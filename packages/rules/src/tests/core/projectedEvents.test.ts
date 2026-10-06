import assert from "node:assert/strict";
import {
  applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  HERO_HASSAN_ID,
  HERO_JACK_RIPPER_ID,
  HERO_VLAD_TEPES_ID,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  SeededRNG,
} from "../../index";
import type { GameEvent, GameState, ProjectedGameEvent, UnitClass } from "../../model";
import { evUnitMoved } from "../../core";
import { EVENT_VISIBILITY } from "../../model/events/visibility";
import { requestHassanAssassinOrderSelection } from "../../actions/heroes/hassan";
import { maybeTriggerChargedImpulseChoice } from "../../actions/chargedImpulses";

function setup(heroId?: string, unitClass: UnitClass = "assassin") {
  let state = attachArmy(
    createEmptyGame(),
    createDefaultArmy("P1", heroId ? { [unitClass]: heroId } : {}),
  );
  state = attachArmy(state, createDefaultArmy("P2"));
  let first = 0;
  let second = 0;
  const units = Object.fromEntries(
    Object.values(state.units).map((unit) => [
      unit.id,
      {
        ...unit,
        // Avoid board-wide public Trickster options coincidentally containing a secret test cell.
        class: unit.owner === "P2" ? ("spearman" as const) : unit.class,
        position: {
          col: unit.owner === "P1" ? first++ : second++,
          row: unit.owner === "P1" ? 0 : 8,
        },
      },
    ]),
  );
  const source = Object.values(units).find(
    (unit) => unit.owner === "P1" && (heroId ? unit.heroId === heroId : unit.class === unitClass),
  )!;
  state = {
    ...state,
    units,
    phase: "battle",
    activeUnitId: source.id,
    currentPlayer: "P1",
    turnNumber: 2,
  };
  return { state, source };
}

function absent(value: unknown, secrets: string[]) {
  const json = JSON.stringify(value);
  for (const secret of secrets)
    assert(!json.includes(secret), `Unauthorized JSON contains ${secret}`);
}

function testStakesAndSnareSerialization() {
  const { state, source } = setup(HERO_VLAD_TEPES_ID, "spearman");
  const cell = { col: 6, row: 5 };
  state.stakeMarkers = [
    { id: "SECRET_STAKE_STACK_A", owner: "P1", position: cell, isRevealed: false, createdAt: 1 },
  ];
  const event: GameEvent = {
    type: "stakesPlaced",
    owner: "P1",
    positions: [cell],
    hiddenFromOpponent: true,
  };
  assert(
    JSON.stringify(projectEventsForRecipient(state, [event], "P1")).includes(JSON.stringify(cell)),
  );
  for (const recipient of ["P2", "spectator"] as const) {
    const events = projectEventsForRecipient(state, [event], recipient);
    assert.deepEqual(events, [
      { type: "hiddenSetupCompleted", owner: "P1", ability: "vladStakes" },
    ]);
    absent(
      {
        events,
        view: recipient === "P2" ? makePlayerView(state, recipient) : makeSpectatorView(state),
      },
      [JSON.stringify(cell), "SECRET_STAKE_STACK_A"],
    );
  }
  const trigger: GameEvent = {
    type: "stakeTriggered",
    unitId: source.id,
    markerPos: source.position!,
    damage: 1,
    stopped: true,
    stakeIdsRevealed: ["SECRET_STAKE_STACK_A", "SECRET_STAKE_STACK_B"],
  };
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(state, [trigger], recipient);
    assert(projected[0]?.type === "stakeTriggered");
    absent(projected, ["stakeIdsRevealed", "SECRET_STAKE_STACK"]);
  }

  const jack = setup(HERO_JACK_RIPPER_ID);
  jack.state.jackTraps = [
    {
      id: "SECRET_SNARE",
      sourceUnitId: jack.source.id,
      owner: "P1",
      position: cell,
      isRevealed: false,
      triggeredTargetIds: [],
    },
  ];
  const pending = maybeTriggerChargedImpulseChoice(jack.state, jack.source.id).state;
  if (pending.pendingRoll) pending.pendingRoll.context.placement = cell;
  assert(JSON.stringify(makePlayerView(pending, "P1")).includes("SECRET_SNARE"));
  for (const view of [makePlayerView(pending, "P2"), makeSpectatorView(pending)]) {
    assert.equal(view.pendingRoll, null);
    absent(view, [JSON.stringify(cell), "SECRET_SNARE", '"placement"', '"options"']);
  }
}

function testHassanSerialization() {
  const { state } = setup(HERO_HASSAN_ID);
  const pending = requestHassanAssassinOrderSelection(state, "P1").state;
  const ids = makePlayerView(pending, "P1").pendingRoll!.context.eligibleUnitIds as string[];
  assert(ids.length >= 2);
  pending.pendingRoll!.context.candidateIds = ids;
  pending.pendingRoll!.context.selectedIds = ids.slice(0, 2);
  pending.pendingRoll!.context.candidateCells = [{ col: 6, row: 5 }];
  pending.pendingRoll!.context.selectedCount = 2;
  for (const view of [makePlayerView(pending, "P2"), makeSpectatorView(pending)]) {
    absent(view.pendingDecision, [...ids, "candidateCells", "selectedCount"]);
    assert.equal(view.pendingRoll, null);
  }
  const resolved = applyAction(
    pending,
    {
      type: "resolvePendingRoll",
      player: "P1",
      pendingRollId: pending.pendingRoll!.id,
      choice: { type: "hassanAssassinOrderPick", unitIds: ids.slice(0, 2) },
    },
    new SeededRNG(1),
  );
  for (const recipient of ["P2", "spectator"] as const) {
    absent(projectEventsForRecipient(resolved.state, resolved.events, recipient), ids);
    const view =
      recipient === "P2"
        ? makePlayerView(resolved.state, recipient)
        : makeSpectatorView(resolved.state);
    absent(view, ["stealthSuccessMinRoll", "selectedIds", "selectedCount", "eligibleUnitIds"]);
    const entries: GameEvent[] = ids
      .slice(0, 2)
      .map((unitId) => ({ type: "stealthEntered", unitId, success: true }));
    assert.deepEqual(
      projectEventsForRecipient(resolved.state, entries, recipient),
      [],
      "private entry events must not reveal selection cardinality",
    );
  }
}

function testMovementEventTimeAndHistory() {
  const { state, source } = setup();
  const a = { col: 4, row: 3 },
    b = { col: 5, row: 4 },
    c = { col: 6, row: 5 };
  const hidden: GameState = {
    ...state,
    units: { ...state.units, [source.id]: { ...source, isStealthed: true, position: a } },
  };
  hidden.lastKnownPositions.P2[source.id] = { col: 1, row: 2 };
  const first = evUnitMoved(hidden, { unitId: source.id, from: a, to: b });
  const atB = {
    ...hidden,
    units: { ...hidden.units, [source.id]: { ...hidden.units[source.id], position: b } },
  };
  const second = evUnitMoved(atB, { unitId: source.id, from: b, to: c });
  const revealed = {
    ...hidden,
    units: { ...hidden.units, [source.id]: { ...source, isStealthed: false, position: c } },
  };
  const reveal: GameEvent = {
    type: "stealthRevealed",
    unitId: source.id,
    reason: "forcedDisplacement",
  };
  for (const recipient of ["P2", "spectator"] as const) {
    const events = projectEventsForRecipient(revealed, [first, second, reveal], recipient);
    assert(!events.some((event) => event.type === "unitMoved"));
    absent(events, [JSON.stringify(a), JSON.stringify(b), JSON.stringify(c)]);
  }
  const view = makePlayerView(atB, "P2");
  assert(!view.units[source.id]);
  assert.deepEqual(view.lastKnownPositions[source.id], { col: 1, row: 2 });
  absent(view, [JSON.stringify(b)]);
  const publicMove = evUnitMoved(state, { unitId: source.id, from: source.position!, to: b });
  for (const recipient of ["P2", "spectator"] as const) {
    const events = projectEventsForRecipient(
      atB,
      [publicMove, { type: "stealthEntered", unitId: source.id, success: true }],
      recipient,
    );
    assert(
      events[0]?.type === "unitMoved",
      "later stealth must preserve earlier authorized movement",
    );
    assert.deepEqual(Object.getOwnPropertySymbols(events[0]), []);
  }
  assert(first[EVENT_VISIBILITY], "engine movement must capture a local visibility fact");
  const marker: GameEvent = {
    type: "combatVisualBatchReady",
    chainId: "opaque-chain",
    visualBatchId: "opaque-batch",
    deferVisuals: false,
    isChainComplete: true,
  };
  assert.deepEqual(
    projectEventsForRecipient(atB, [marker], "P2"),
    [marker],
    "chain completion cannot be mistaken for a hidden unit reference",
  );
  const legacy: GameEvent = { type: "unitMoved", unitId: source.id, from: a, to: b };
  assert.deepEqual(
    projectEventsForRecipient(revealed, [legacy, reveal], "P2"),
    [reveal],
    "legacy positional events fail closed without event-time facts",
  );
}

function testCombatAndAoESerialization() {
  const { state, source } = setup();
  const target = Object.values(state.units).find((unit) => unit.owner === "P2")!;
  const hiddenTarget = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.id !== source.id,
  )!;
  state.units[source.id] = { ...source, isStealthed: true, position: { col: 6, row: 5 } };
  state.units[hiddenTarget.id] = { ...hiddenTarget, isStealthed: true };
  const event: GameEvent = {
    type: "aoeResolved",
    sourceUnitId: source.id,
    casterId: source.id,
    abilityId: "SECRET_ABILITY",
    center: { col: 4, row: 4 },
    radius: 1,
    affectedUnitIds: [hiddenTarget.id, target.id],
    revealedUnitIds: [],
    damagedUnitIds: [hiddenTarget.id, target.id],
    damageByUnitId: { [hiddenTarget.id]: 2, [target.id]: 1 },
    rollsByUnitId: { [hiddenTarget.id]: 6, [target.id]: 3 },
  };
  state.pendingAoE = {
    casterId: source.id,
    abilityId: "SECRET_ABILITY",
    center: event.center,
    radius: 1,
    affectedUnitIds: event.affectedUnitIds,
    revealedUnitIds: [],
    damagedUnitIds: event.damagedUnitIds,
    damageByUnitId: event.damageByUnitId!,
  };
  for (const recipient of ["P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(state, [event], recipient);
    assert(projected[0]?.type === "aoeResolved");
    if (projected[0]?.type === "aoeResolved") {
      assert.deepEqual(projected[0].center, event.center);
      assert.equal(projected[0].radius, 1);
      assert.deepEqual(projected[0].affectedUnitIds, [target.id]);
    }
    absent(projected, [
      source.id,
      hiddenTarget.id,
      "SECRET_ABILITY",
      JSON.stringify(state.units[source.id].position),
    ]);
    const view = recipient === "P2" ? makePlayerView(state, recipient) : makeSpectatorView(state);
    assert.deepEqual(view.pendingAoEPreview, { center: event.center, radius: 1 });
  }
  assert.equal(makePlayerView(state, "P1").pendingAoEPreview!.casterId, source.id);
  state.pendingRoll = {
    id: "private-defense", player: "P2", kind: "attack_defenderRoll",
    chainSource: "jackRipperUltimate", pendingRollsRemaining: 19,
    context: { attackerId: source.id, defenderId: target.id, targetsQueue: [source.id, target.id], currentTargetIndex: 1, damageByUnitId: { [source.id]: 2 }, resumePendingRoll: { secretPath: "SECRET_RESUME" } },
    presentation: {
      title: "SECRET_SOURCE uses SECRET_ABILITY", reason: "SECRET_SOURCE uses SECRET_ABILITY",
      sourceUnitId: source.id, sourceName: "SECRET_SOURCE", abilityId: "SECRET_ABILITY", abilityName: "SECRET_ABILITY",
      diceLabel: "d6", rollKind: "defense", requestedPlayerId: "P2",
    },
  };
  const defending = makePlayerView(state, "P2").pendingRoll;
  assert(defending && defending.context.defenderId === target.id);
  assert.equal(defending.context.currentTargetIndex, 0);
  absent(defending, [source.id, "SECRET_SOURCE", "SECRET_ABILITY", "SECRET_RESUME", "jackRipperUltimate", "pendingRollsRemaining"]);
  assert.equal(makeSpectatorView(state).pendingCombatQueueCount, 0);
  const carpet: GameEvent = {
    type: "carpetStrikeAttackRolled",
    unitId: source.id,
    dice: [4, 4],
    sum: 8,
    center: event.center,
    affectedUnitIds: [hiddenTarget.id, target.id],
  };
  const failedSearch: GameEvent = {
    type: "searchStealth",
    unitId: target.id,
    mode: "action",
    rolls: [{ targetId: source.id, roll: 1, success: false }],
  };
  for (const recipient of ["P2", "spectator"] as const) {
    const carpetEvents = projectEventsForRecipient(state, [carpet], recipient);
    assert(carpetEvents[0]?.type === "carpetStrikeAttackRolled");
    absent(carpetEvents, [source.id, hiddenTarget.id]);
    absent(projectEventsForRecipient(state, [failedSearch], recipient), [source.id]);
    const reaction: GameEvent = {
      type: "reactionOpportunity",
      reactorUnitId: target.id,
      source: "tralala",
      targetUnitIds: [source.id],
    };
    assert.deepEqual(
      projectEventsForRecipient(state, [reaction], recipient),
      [],
      "waiting status cannot reveal legal reaction targets",
    );
  }
  const nestedFuture = { ...event, center: { ...event.center, secretSource: "SECRET_NESTED" } };
  absent(projectEventsForRecipient(state, [nestedFuture], "P2"), ["SECRET_NESTED"]);
  const attack = {
    type: "attackResolved" as const, attackerId: source.id, defenderId: target.id,
    attackerRoll: { dice: [6], sum: 6, isDouble: false, privateSource: "SECRET_DICE_SOURCE" },
    defenderRoll: { dice: [1], sum: 1, isDouble: false },
    hit: true, damage: 1, defenderHpAfter: 5, sourceCell: { col: 6, row: 5 },
  };
  for (const recipient of ["P2", "spectator"] as const) {
    const attacks = projectEventsForRecipient(state, [attack], recipient);
    assert(attacks[0]?.type === "attackResolved" && attacks[0].defenderId === target.id);
    absent(attacks, [source.id, "sourceCell", "SECRET_DICE_SOURCE"]);
  }
  const futureFields = {
    type: "unitDied" as const,
    unitId: target.id,
    killerId: null,
    sourceCell: { col: 6, row: 5 },
    hiddenPath: ["SECRET_PATH"],
  };
  absent(projectEventsForRecipient(state, [futureFields], "P2"), [
    "sourceCell",
    "hiddenPath",
    "SECRET_PATH",
  ]);
  state.units[source.id] = { ...state.units[source.id], isAlive: false };
  absent(makePlayerView(state, "P2"), [JSON.stringify(state.units[source.id].position)]);
  assert.deepEqual(
    projectEventsForRecipient(
      state,
      [{ type: "unitDied", unitId: source.id, killerId: null }],
      "P2",
    ),
    [],
  );
  // Exercise the untrusted runtime boundary as well as the exhaustive never checks.
  const unknownEvent: GameEvent = {
    // @ts-expect-error Unknown events cannot satisfy the authoritative contract.
    type: "futurePrivateEvent",
    secret: "SECRET",
  };
  assert.deepEqual(projectEventsForRecipient(state, [unknownEvent], "P2"), []);
}

/** Compile-time regression: a notice cannot masquerade as a complete gameplay event. */
function projectedTypeAssertions(event: ProjectedGameEvent) {
  if (event.type === "eventRedacted") {
    // @ts-expect-error Notices have no private unit identity.
    void event.unitId;
  }
  // @ts-expect-error A movement needs both guaranteed authorized endpoints.
  const invalid: ProjectedGameEvent = { type: "unitMoved" };
  void invalid;
}
void projectedTypeAssertions;

export function testSafeProjectedEventSerialization() {
  testStakesAndSnareSerialization();
  testHassanSerialization();
  testMovementEventTimeAndHistory();
  testCombatAndAoESerialization();
  console.log("safe_projected_event_serialization_and_event_time_visibility passed");
}
