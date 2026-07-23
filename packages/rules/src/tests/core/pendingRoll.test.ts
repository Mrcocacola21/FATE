import {
  ALL_ROLL_KINDS,
  applyActionRaw,
  assert,
  CORE_PENDING_ROLL_KINDS,
  createEmptyGame,
  GameState,
  HERO_PENDING_ROLL_KINDS,
  pendingRollActions,
  PlayerId,
  RollKind,
  SeededRNG,
} from "../helpers/testUtils";
import { getPendingCombatQueueCount } from "../../view/pending";
import {
  attachArmy,
  createDefaultArmy,
  createPendingRollContext,
  createTrapRollContext,
} from "../../index";

export function testActiveQueuedRollProjectsAsPending() {
  const riderPending = {
    id: "roll-rider-final",
    player: "P1" as PlayerId,
    kind: "riderPathAttack_defenderRoll" as RollKind,
    context: { queueKind: "riderPath" },
  };
  assert.strictEqual(
    getPendingCombatQueueCount([], riderPending),
    1,
    "the active final rider-path defense must keep the visual queue pending",
  );

  const normalPending = {
    ...riderPending,
    id: "roll-normal",
    kind: "attack_defenderRoll" as RollKind,
    context: { queueKind: "normal" },
  };
  assert.strictEqual(
    getPendingCombatQueueCount([], normalPending),
    0,
    "a normal single-target attack must not be projected as a visual queue",
  );

  console.log("active_queued_roll_projects_as_pending passed");
}
export function testPendingRollActionsExportsStable() {
  const expected = ["applyResolvePendingRoll"];
  const exported = Object.keys(pendingRollActions);
  for (const name of expected) {
    assert(exported.includes(name), `pendingRollActions missing export: ${name}`);
    assert.strictEqual(
      typeof (pendingRollActions as any)[name],
      "function",
      `pendingRollActions export ${name} should be a function`,
    );
  }

  console.log("pendingRollActions_exports_stable passed");
}

export function testPendingRollResolverCoverage() {
  const handled = new Set<string>([...CORE_PENDING_ROLL_KINDS, ...HERO_PENDING_ROLL_KINDS]);
  const duplicates = [...CORE_PENDING_ROLL_KINDS, ...HERO_PENDING_ROLL_KINDS].filter(
    (kind, index, all) => all.indexOf(kind) !== index,
  );

  assert.deepStrictEqual(duplicates, [], "pending roll resolver kinds should be unique");
  for (const kind of ALL_ROLL_KINDS) {
    assert(handled.has(kind), `pending roll kind is missing resolver coverage: ${kind}`);
  }

  console.log("pending_roll_resolver_coverage passed");
}

export function testUnknownPendingRollKindDoesNotClear() {
  const pendingRoll = {
    id: "roll-unknown",
    player: "P1" as PlayerId,
    kind: "__unknownRollKind" as RollKind,
    context: {},
  };
  const state: GameState = {
    ...createEmptyGame(),
    pendingRoll,
  };

  const result = pendingRollActions.applyResolvePendingRoll(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pendingRoll.id,
      player: "P1",
    },
    new SeededRNG(1),
  );

  assert.strictEqual(
    result.state.pendingRoll,
    pendingRoll,
    "unknown pending roll kind must not be cleared",
  );
  assert(
    result.events.some(
      (event) =>
        event.type === "pendingRollUnhandled" &&
        event.rollId === pendingRoll.id &&
        event.kind === pendingRoll.kind,
    ),
    "unknown pending roll kind should emit diagnostic event",
  );

  console.log("unknown_pending_roll_kind_does_not_clear passed");
}

export function testPendingRollPresentationMetadata() {
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === "knight",
  )!;
  const defender = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "knight",
  )!;
  const combatContext = {
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerDice: [],
    defenderDice: [],
    stage: "initial",
    queueKind: "normal",
  };

  const battleState: GameState = {
    ...state,
    phase: "battle",
    currentPlayer: attacker.owner,
    activeUnitId: attacker.id,
    units: {
      ...state.units,
      [attacker.id]: { ...attacker, position: { col: 3, row: 3 } },
      [defender.id]: { ...defender, position: { col: 4, row: 3 } },
    },
  };
  const attack = applyActionRaw(
    battleState,
    {
      type: "attack",
      attackerId: attacker.id,
      defenderId: defender.id,
    },
    new SeededRNG(1),
  ).state.pendingRoll;
  assert.strictEqual(attack?.presentation?.rollKind, "attack");
  assert.strictEqual(attack?.presentation?.sourceUnitId, attacker.id);
  assert.strictEqual(attack?.presentation?.targetUnitId, defender.id);
  assert.strictEqual(attack?.presentation?.diceLabel, "2d6");
  assert(attack?.presentation?.successText);
  assert(attack?.presentation?.failureText);

  const defense = createPendingRollContext({
    state,
    requestedPlayerId: defender.owner,
    kind: "attack_defenderRoll",
    resolutionContext: { ...combatContext, attackerDice: [5, 3] },
    actorUnitId: defender.id,
  });
  assert.strictEqual(defense.rollKind, "defense");
  assert.strictEqual(defense.actorUnitId, defender.id);
  assert.strictEqual(defense.sourceUnitId, attacker.id);
  assert.strictEqual(defense.targetUnitId, defender.id);
  assert.strictEqual(defense.opponentRollTotal, 8);
  assert.match(defense.successRule ?? "", /8/);
  assert(defense.successText && defense.failureText);

  const stealthUnit = { ...attacker, class: "assassin" as const };
  const stealthState = {
    ...state,
    units: { ...state.units, [attacker.id]: stealthUnit },
  };
  const stealth = createPendingRollContext({
    state: stealthState,
    requestedPlayerId: attacker.owner,
    kind: "enterStealth",
    resolutionContext: { unitId: attacker.id },
    actorUnitId: attacker.id,
  });
  assert.strictEqual(stealth.rollKind, "stealth");
  assert.strictEqual(stealth.successRule, "5-6 succeeds");
  assert.match(stealth.successText ?? "", /hidden/);
  assert.match(stealth.failureText ?? "", /revealed/);

  const explosion = createPendingRollContext({
    state,
    requestedPlayerId: defender.owner,
    kind: "falseTrailExplosion_defenderRoll",
    resolutionContext: { ...combatContext, attackerDice: [4, 2] },
    actorUnitId: defender.id,
  });
  assert.strictEqual(explosion.rollKind, "explosion");
  assert.match(explosion.reason, /explosion/i);
  assert.match(explosion.failureText ?? "", /damage/i);

  const trap = createTrapRollContext({
    state,
    requestedPlayerId: defender.owner,
    kind: "forestMoveCheck",
    resolutionContext: {
      sourceUnitId: attacker.id,
      targetUnitId: defender.id,
      abilityId: "jack_snare",
      damage: 1,
    },
    actorUnitId: defender.id,
  });
  assert.strictEqual(trap.rollKind, "trap");
  assert.match(trap.reason, /trap/i);
  assert.match(trap.failureText ?? "", /1 damage/i);

  console.log("pending_roll_presentation_metadata passed");
}
