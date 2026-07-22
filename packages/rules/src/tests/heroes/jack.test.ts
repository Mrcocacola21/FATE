import {
  ABILITY_JACK_RIPPER_COVERING_TRACKS,
  HERO_JACK_RIPPER_ID,
  getAbilityViewsForUnit,
  makePlayerView,
} from "../..";
import { applyNewBatchPostAction } from "../../actions/heroes/newBatchPost";
import { resolveHitDamage } from "../../combat/stateHit";
import type { JackTrapMarker } from "../../model";
import {
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  initKnowledgeForOwners,
  makeRngSequence,
  setUnit,
  toBattleState,
  type GameState,
  type UnitState,
} from "../helpers/testUtils";

function setupJack(): { state: GameState; jack: UnitState; enemies: UnitState[] } {
  let state = createEmptyGame();
  state = attachArmy(
    state,
    createDefaultArmy("P1", { assassin: HERO_JACK_RIPPER_ID }),
  );
  state = attachArmy(state, createDefaultArmy("P2"));
  const jack = Object.values(state.units).find(
    (unit) => unit.heroId === HERO_JACK_RIPPER_ID,
  )!;
  const enemies = Object.values(state.units).filter((unit) => unit.owner === "P2");
  state = initKnowledgeForOwners(toBattleState(state, "P1", jack.id));
  return { state, jack: state.units[jack.id], enemies };
}

function snare(
  jack: UnitState,
  id: number,
  col: number,
  row: number,
  patch: Partial<JackTrapMarker> = {},
): JackTrapMarker {
  return {
    id: `jack-snare-P1-${id}`,
    sourceUnitId: jack.id,
    owner: jack.owner,
    position: { col, row },
    isRevealed: false,
    triggeredTargetIds: [],
    ...patch,
  };
}

function movedEvent(unitId: string, col: number, row: number) {
  return {
    type: "unitMoved" as const,
    unitId,
    from: { col: Math.max(0, col - 1), row },
    to: { col, row },
  };
}

export function testJackSnareActivatesOncePerTarget() {
  let { state, jack, enemies } = setupJack();
  const first = enemies[0];
  const second = enemies[1];
  state = {
    ...state,
    jackTraps: [snare(jack, 1, 4, 4), snare(jack, 2, 6, 6)],
  };
  state = setUnit(state, first.id, { position: { col: 4, row: 4 } });
  let triggered = applyNewBatchPostAction(
    state,
    state,
    [movedEvent(first.id, 4, 4)],
    makeRngSequence([]),
  );
  const firstTrap = triggered.state.jackTraps?.find((trap) => trap.id.endsWith("-1"));
  assert(firstTrap?.trappedUnitId === first.id, "the first target should activate the snare");
  assert(
    firstTrap?.triggeredTargetIds.join(",") === first.id,
    "the serialized marker should record the triggered snare/target pair exactly once",
  );

  const recheckState = {
    ...triggered.state,
    jackTraps: triggered.state.jackTraps?.map((trap) =>
      trap.id === firstTrap?.id ? { ...trap, trappedUnitId: undefined } : trap,
    ),
    units: {
      ...triggered.state.units,
      [first.id]: {
        ...triggered.state.units[first.id],
        immobilizedUntilOwnTurnStart: false,
      },
    },
  };
  const rechecked = applyNewBatchPostAction(
    recheckState,
    recheckState,
    [movedEvent(first.id, 4, 4)],
    makeRngSequence([]),
  );
  assert(
    !rechecked.state.units[first.id].immobilizedUntilOwnTurnStart,
    "the same target must not reactivate the same snare when its cell is rechecked",
  );
  assert(
    rechecked.state.jackTraps?.find((trap) => trap.id === firstTrap?.id)
      ?.triggeredTargetIds.length === 1,
    "a recheck must not append duplicate trigger history",
  );

  state = setUnit(recheckState, second.id, { position: { col: 4, row: 4 } });
  const otherTarget = applyNewBatchPostAction(
    state,
    state,
    [movedEvent(second.id, 4, 4)],
    makeRngSequence([]),
  );
  assert(
    otherTarget.state.units[second.id].immobilizedUntilOwnTurnStart,
    "a different target may activate a still-valid snare",
  );

  const secondSnareState = {
    ...recheckState,
    units: {
      ...recheckState.units,
      [first.id]: {
        ...recheckState.units[first.id],
        position: { col: 6, row: 6 },
        immobilizedUntilOwnTurnStart: false,
      },
    },
  };
  const otherSnare = applyNewBatchPostAction(
    secondSnareState,
    secondSnareState,
    [movedEvent(first.id, 6, 6)],
    makeRngSequence([]),
  );
  assert(
    otherSnare.state.jackTraps?.find((trap) => trap.id.endsWith("-2"))
      ?.triggeredTargetIds.includes(first.id),
    "the same target may activate a different snare",
  );
  console.log("jack_snare_once_per_target passed");
}

export function testJackSnareIsRemovedWithDeadTarget() {
  let { state, jack, enemies } = setupJack();
  const victim = enemies[0];
  state = setUnit(state, victim.id, {
    position: null,
    hp: 0,
    isAlive: false,
    immobilizedUntilOwnTurnStart: true,
  });
  state = {
    ...state,
    jackTraps: [
      snare(jack, 1, 3, 3, {
        isRevealed: true,
        trappedUnitId: victim.id,
        triggeredTargetIds: [victim.id],
      }),
      snare(jack, 2, 7, 7),
    ],
  };
  const cleaned = applyNewBatchPostAction(
    state,
    state,
    [{ type: "unitDied", unitId: victim.id, killerId: jack.id }],
    makeRngSequence([]),
  );
  assert(
    cleaned.state.jackTraps?.length === 1 && cleaned.state.jackTraps[0].id.endsWith("-2"),
    "death during snare resolution should remove only the snare tied to that target",
  );
  assert(
    makePlayerView(cleaned.state, "P1").jackTraps.length === 1 &&
      makePlayerView(cleaned.state, "P2").jackTraps.length === 0,
    "the removed snare must disappear from every projection",
  );
  console.log("jack_snare_dead_target_cleanup passed");
}

export function testJackCoveringTracksSixthSnareFlow() {
  let { state, jack, enemies } = setupJack();
  const failed = enemies[0];
  const saved = enemies[1];
  state = setUnit(state, jack.id, { position: { col: 8, row: 8 } });
  state = setUnit(state, failed.id, { position: { col: 1, row: 1 }, hp: 1 });
  state = setUnit(state, saved.id, { position: { col: 2, row: 1 }, hp: 3 });
  state = {
    ...state,
    jackTrapCounter: 5,
    jackTraps: [
      snare(jack, 1, 1, 1),
      snare(jack, 2, 3, 3),
      snare(jack, 3, 4, 4),
      snare(jack, 4, 5, 5),
      snare(jack, 5, 6, 6),
    ],
  };
  const placementPending = {
    ...state,
    pendingRoll: {
      id: "jack-place-6",
      player: "P1" as const,
      kind: "chargedImpulseTargetChoice" as const,
      context: {
        unitId: jack.id,
        abilityId: "jackRipperSnares",
        options: [{ col: 0, row: 8 }],
      },
    },
  };
  const requested = applyAction(
    placementPending,
    {
      type: "resolvePendingRoll",
      pendingRollId: "jack-place-6",
      player: "P1",
      choice: { type: "chargedImpulseTarget", position: { col: 0, row: 8 } },
    },
    makeRngSequence([]),
  );
  assert(
    requested.state.pendingRoll?.kind === "chargedImpulseTargetChoice" &&
      requested.state.pendingRoll.context.step === "coveringTracks",
    "placing a sixth snare should create the Covering Tracks board choice",
  );
  assert(
    requested.state.jackTraps?.length === 5 &&
      !requested.state.units[jack.id].jackTrapPlacedTurnNumber,
    "the new snare must not commit before an existing snare is selected",
  );
  assert(
    makePlayerView(requested.state, "P1").pendingRoll?.context.step === "coveringTracks" &&
      makePlayerView(requested.state, "P2").pendingRoll === null,
    "the Covering Tracks choice and its five coordinates must be private to Jack's owner",
  );

  const pending = requested.state.pendingRoll!;
  const invalid = applyAction(
    requested.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: "P1",
      choice: { type: "chargedImpulseTarget", position: { col: 7, row: 0 } },
    },
    makeRngSequence([]),
  );
  assert(
    invalid.state.pendingRoll?.id === pending.id && invalid.state.jackTraps?.length === 5,
    "an invalid snare selection must preserve the authoritative pending state without mutation",
  );

  const resolved = applyAction(
    requested.state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: "P1",
      choice: { type: "chargedImpulseTarget", position: { col: 1, row: 1 } },
    },
    makeRngSequence([0, 0.8]),
  );
  assert(!resolved.state.pendingRoll, "Covering Tracks should leave no stale pending choice");
  assert(!resolved.state.units[failed.id].isAlive, "a 1-4 roll should deal 1 lethal damage");
  assert(resolved.state.units[saved.id].hp === 3, "a 5-6 roll should avoid damage");
  assert(
    resolved.state.jackTraps?.length === 5 &&
      !resolved.state.jackTraps.some((trap) => trap.id.endsWith("-1")) &&
      resolved.state.jackTraps.some(
        (trap) => trap.position.col === 0 && trap.position.row === 8,
      ),
    "the exploded snare should be replaced by the originally requested new snare",
  );
  const explosion = resolved.events.find(
    (event) =>
      event.type === "aoeResolved" &&
      event.abilityId === ABILITY_JACK_RIPPER_COVERING_TRACKS,
  );
  assert(
    explosion?.type === "aoeResolved" &&
      explosion.radius === 1 &&
      explosion.rollsByUnitId?.[failed.id] === 1 &&
      explosion.rollsByUnitId?.[saved.id] === 5,
    "the rules event should record authoritative per-creature d6 results for radius 1",
  );
  console.log("jack_covering_tracks_sixth_snare_flow passed");
}

export function testJackKeepsAssassinStealthBaseDamageWithoutOldBonus() {
  const { state, jack, enemies } = setupJack();
  const defender = enemies[0];
  const units = { ...state.units };
  const normal = resolveHitDamage(
    { attackerId: jack.id, defenderId: defender.id },
    jack,
    defender,
    { ...units },
    [],
    true,
    false,
  );
  const stealth = resolveHitDamage(
    { attackerId: jack.id, defenderId: defender.id },
    jack,
    defender,
    { ...units },
    [],
    true,
    true,
  );
  const otherAssassin = createDefaultArmy("P2").find((unit) => unit.class === "assassin")!;
  const otherStealth = resolveHitDamage(
    { attackerId: otherAssassin.id, defenderId: defender.id },
    otherAssassin,
    defender,
    { [otherAssassin.id]: otherAssassin, [defender.id]: defender },
    [],
    true,
    true,
  );
  assert(normal.damage === 1, "Jack's visible attack should use normal Assassin base damage");
  assert(
    stealth.damage === 2,
    "Jack's stealth attack should keep the Assassin base damage of 2 without the removed +1",
  );
  assert(otherStealth.damage === 2, "other Assassins should keep the same stealth base rule");
  const abilityIds = getAbilityViewsForUnit(state, jack.id).map((ability) => ability.id);
  assert(
    abilityIds.includes(ABILITY_JACK_RIPPER_COVERING_TRACKS) &&
      !abilityIds.includes("jackRipperLegendKiller"),
    "Jack's projected ability list should replace Legendary Killer with Covering Tracks",
  );
  console.log("jack_assassin_stealth_base_damage_and_passive_replacement passed");
}
