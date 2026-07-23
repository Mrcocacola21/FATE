import { requestHassanAssassinOrderSelection } from "../../actions/heroes/hassan";
import { applyDebugStateCommand } from "../../debug";
import type { ApplyResult, GameState, UnitState } from "../../model";
import { processUnitStartOfTurnStealth } from "../../stealth";
import {
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  getStealthSuccessMinRoll,
  HERO_HASSAN_ID,
  HERO_LOKI_ID,
  initKnowledgeForOwners,
  makeRngSequence,
  resolvePendingRollOnce,
  setUnit,
  setupLokiState,
  toBattleState,
} from "../helpers/testUtils";

function place(state: GameState, unit: UnitState, col: number, row: number): GameState {
  return setUnit(state, unit.id, { position: { col, row } });
}

function startUnitTurn(state: GameState, unitId: string): ApplyResult {
  const unit = state.units[unitId];
  assert(unit?.isAlive && unit.position, `expected placed living unit ${unitId}`);
  return applyAction(
    {
      ...state,
      phase: "battle",
      currentPlayer: unit.owner,
      activeUnitId: null,
      pendingRoll: null,
      pendingMove: null,
      turnQueue: [unit.id],
      turnQueueIndex: 0,
      turnOrder: [unit.id],
      turnOrderIndex: 0,
    },
    { type: "unitStartTurn", unitId: unit.id } as any,
    makeRngSequence([]),
  );
}

function enterStealthSuccessfully(state: GameState, unitId: string): GameState {
  const unit = state.units[unitId];
  const ready = initKnowledgeForOwners(toBattleState(state, unit.owner, unit.id));
  const rng = makeRngSequence([0.99]);
  const requested = applyAction(ready, { type: "enterStealth", unitId } as any, rng);
  assert(
    requested.state.pendingRoll?.kind === "enterStealth",
    `${unitId} should request a stealth roll`,
  );
  const resolved = resolvePendingRollOnce(requested.state, rng);
  assert(resolved.state.units[unitId].isStealthed, `${unitId} should enter stealth`);
  const duration = resolved.state.units[unitId].stealthDuration;
  assert(duration?.ownTurnStartsWhileHidden === 0, "stealth entry should initialize at zero");
  assert(duration?.maxOwnTurnStartsHidden === 3, "normal stealth should allow three own starts");
  return resolved.state;
}

function assertUnchangedDuration(before: UnitState, after: UnitState, message: string) {
  assert(after.isStealthed, message);
  assert(
    after.stealthDuration?.ownTurnStartsWhileHidden ===
      before.stealthDuration?.ownTurnStartsWhileHidden,
    `${message}: own-turn counter changed`,
  );
}

function assertOwnTurnExpiry(state: GameState, unitId: string, label: string): GameState {
  let working = state;
  for (let turn = 1; turn <= 3; turn += 1) {
    const started = startUnitTurn(working, unitId);
    const hidden = started.state.units[unitId];
    assert(hidden.isStealthed, `${label} should remain hidden on own start ${turn}`);
    assert(
      hidden.stealthDuration?.ownTurnStartsWhileHidden === turn,
      `${label} should record own hidden start ${turn}`,
    );
    working = started.state;
  }

  const fourth = startUnitTurn(working, unitId);
  assert(
    !fourth.state.units[unitId].isStealthed,
    `${label} should reveal on its fourth own turn start`,
  );
  assert(
    fourth.events.some(
      (event) =>
        event.type === "stealthRevealed" &&
        event.unitId === unitId &&
        event.reason === "timerExpired",
    ),
    `${label} fourth own start should emit timer expiry reveal`,
  );
  return fourth.state;
}

export function testNormalStealthCountsOnlyHiddenFiguresOwnTurnStarts() {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1")),
    createDefaultArmy("P2"),
  );
  const assassin = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin",
  )!;
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "archer",
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman",
  )!;
  state = place(state, assassin, 4, 4);
  state = place(state, ally, 2, 2);
  state = place(state, enemy, 6, 6);
  state = enterStealthSuccessfully(state, assassin.id);

  let before = state.units[assassin.id];
  const allyStart = startUnitTurn(state, ally.id);
  assertUnchangedDuration(
    before,
    allyStart.state.units[assassin.id],
    "an allied unit turn must not advance stealth",
  );

  before = allyStart.state.units[assassin.id];
  const roundBefore = allyStart.state.roundNumber;
  const roundAdvanced = applyAction(
    allyStart.state,
    { type: "endTurn" } as any,
    makeRngSequence([]),
  );
  assert(
    roundAdvanced.state.roundNumber > roundBefore,
    "single-unit queue should advance the round for the regression fixture",
  );
  assertUnchangedDuration(
    before,
    roundAdvanced.state.units[assassin.id],
    "a global round change must not advance stealth",
  );

  before = roundAdvanced.state.units[assassin.id];
  const enemyStart = startUnitTurn(roundAdvanced.state, enemy.id);
  assertUnchangedDuration(
    before,
    enemyStart.state.units[assassin.id],
    "an opponent turn must not advance stealth",
  );

  const pendingRng = makeRngSequence([0.01]);
  const allyReady = initKnowledgeForOwners(toBattleState(enemyStart.state, ally.owner, ally.id));
  const pending = applyAction(
    allyReady,
    { type: "enterStealth", unitId: ally.id } as any,
    pendingRng,
  );
  before = pending.state.units[assassin.id];
  const resolved = resolvePendingRollOnce(pending.state, pendingRng);
  assertUnchangedDuration(
    before,
    resolved.state.units[assassin.id],
    "resolving another figure's pending roll must not advance stealth",
  );

  assertOwnTurnExpiry(resolved.state, assassin.id, "normal Assassin");
  console.log("normal_stealth_counts_only_hidden_figures_own_turn_starts passed");
}

export function testLokiStealthUsesOwnTurnDuration() {
  let { state, loki } = setupLokiState();
  const ally = Object.values(state.units).find(
    (unit) => unit.owner === loki.owner && unit.id !== loki.id,
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner !== loki.owner && unit.class === "spearman",
  )!;
  state = place(state, loki, 4, 4);
  state = place(state, ally, 2, 2);
  state = place(state, enemy, 6, 6);
  state = enterStealthSuccessfully(state, loki.id);

  const before = state.units[loki.id];
  const enemyStart = startUnitTurn(state, enemy.id);
  assertUnchangedDuration(
    before,
    enemyStart.state.units[loki.id],
    "enemy turns must not shorten Loki Natural Stealth",
  );
  const allyStart = startUnitTurn(enemyStart.state, ally.id);
  assertUnchangedDuration(
    enemyStart.state.units[loki.id],
    allyStart.state.units[loki.id],
    "allied turns must not shorten Loki Natural Stealth",
  );

  assertOwnTurnExpiry(allyStart.state, loki.id, "Loki");
  console.log("loki_stealth_uses_own_turn_duration passed");
}

export function testHassanGrantedStealthUsesGrantedUnitsOwnTurns() {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { assassin: HERO_HASSAN_ID })),
    createDefaultArmy("P2"),
  );
  const hassan = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.heroId === HERO_HASSAN_ID,
  )!;
  const granted = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "rider",
  )!;
  const secondGranted = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight",
  )!;
  const enemy = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "spearman",
  )!;
  state = place(state, hassan, 4, 4);
  state = place(state, granted, 2, 2);
  state = place(state, secondGranted, 3, 2);
  state = place(state, enemy, 6, 6);
  state = { ...state, phase: "battle", pendingRoll: null };

  const requested = requestHassanAssassinOrderSelection(state, "P1");
  assert(
    requested.state.pendingRoll?.kind === "hassanAssassinOrderSelection",
    "Hassan should grant stealth access through Assassin Order",
  );
  const selected = applyAction(
    requested.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: requested.state.pendingRoll!.id,
      player: "P1",
      choice: {
        type: "hassanAssassinOrderPick",
        unitIds: [granted.id, secondGranted.id],
      },
    } as any,
    makeRngSequence([]),
  );
  assert(
    getStealthSuccessMinRoll(selected.state.units[granted.id]) === 5,
    "selected unit should receive Hassan's stealth threshold",
  );
  state = enterStealthSuccessfully(selected.state, granted.id);

  const before = state.units[granted.id];
  const hassanStart = startUnitTurn(state, hassan.id);
  assertUnchangedDuration(
    before,
    hassanStart.state.units[granted.id],
    "Hassan's own turn must not shorten the granted unit's stealth",
  );
  const enemyStart = startUnitTurn(hassanStart.state, enemy.id);
  assertUnchangedDuration(
    hassanStart.state.units[granted.id],
    enemyStart.state.units[granted.id],
    "enemy turns must not shorten Hassan-granted stealth",
  );
  const allyStart = startUnitTurn(enemyStart.state, secondGranted.id);
  assertUnchangedDuration(
    enemyStart.state.units[granted.id],
    allyStart.state.units[granted.id],
    "other allied turns must not shorten Hassan-granted stealth",
  );

  assertOwnTurnExpiry(allyStart.state, granted.id, "Hassan-granted unit");
  console.log("hassan_granted_stealth_uses_granted_units_own_turns passed");
}

export function testStealthLegacyFallbackAndDebugInitialization() {
  let state = attachArmy(createEmptyGame(), createDefaultArmy("P1"));
  const assassin = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin",
  )!;
  state = place(state, assassin, 4, 4);
  state = setUnit(state, assassin.id, {
    isStealthed: true,
    stealthTurnsLeft: 0,
    stealthDuration: undefined,
  });
  const legacyStart = startUnitTurn(state, assassin.id);
  assert(
    legacyStart.state.units[assassin.id].isStealthed,
    "a hidden legacy unit without new metadata must initialize as recently hidden",
  );
  assert(
    legacyStart.state.units[assassin.id].stealthDuration?.ownTurnStartsWhileHidden === 1,
    "legacy fallback should record the first observed own hidden turn",
  );

  const forced = applyDebugStateCommand(
    setUnit(legacyStart.state, assassin.id, {
      isStealthed: false,
      stealthTurnsLeft: 0,
      stealthDuration: undefined,
    }),
    {
      type: "debugSetStatus",
      unitId: assassin.id,
      status: "isStealthed",
      value: true,
    },
  );
  assert(
    forced.state.units[assassin.id].stealthDuration?.ownTurnStartsWhileHidden === 0,
    "Test Room force stealth should initialize duration metadata",
  );

  const spawned = applyDebugStateCommand(createEmptyGame(), {
    type: "debugSpawnUnit",
    heroId: HERO_LOKI_ID,
    owner: "P1",
    coord: { col: 4, row: 4 },
    options: { stealthed: true },
  });
  const spawnedLoki = Object.values(spawned.state.units).find(
    (unit) => unit.heroId === HERO_LOKI_ID,
  );
  assert(
    spawnedLoki?.stealthDuration?.ownTurnStartsWhileHidden === 0,
    "Test Room stealthed spawn should initialize duration metadata",
  );

  console.log("stealth_legacy_fallback_and_debug_initialization passed");
}

export function testStealthTurnStartContinuationIsIdempotent() {
  let state = attachArmy(createEmptyGame(), createDefaultArmy("P1"));
  const assassin = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "assassin",
  )!;
  state = place(state, assassin, 4, 4);
  state = enterStealthSuccessfully(state, assassin.id);

  const first = processUnitStartOfTurnStealth(state, assassin.id, makeRngSequence([]));
  const continued = processUnitStartOfTurnStealth(first.state, assassin.id, makeRngSequence([]));
  assert(
    continued.state.units[assassin.id].stealthDuration?.ownTurnStartsWhileHidden === 1,
    "re-entering the same own turn after a pending continuation must not tick twice",
  );
  assert(
    continued.state.units[assassin.id].stealthTurnsLeft === 2,
    "legacy remaining-turn projection must also remain stable across continuation",
  );

  console.log("stealth_turn_start_continuation_is_idempotent passed");
}
