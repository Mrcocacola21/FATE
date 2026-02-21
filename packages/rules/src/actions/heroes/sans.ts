import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  PapyrusBoneType,
  UnitState,
} from "../../model";
import { isInsideBoard } from "../../model";
import { resolveAoE } from "../../aoe";
import {
  ABILITY_SANS_BADASS_JOKE,
  ABILITY_SANS_BONE_FIELD,
  ABILITY_SANS_GASTER_BLASTER,
  ABILITY_SANS_SLEEP,
  TRICKSTER_AOE_RADIUS,
  getAbilitySpec,
  setCharges,
  spendCharges,
} from "../../abilities";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../heroes";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { evAbilityUsed, evAoeResolved, evUnitDied, evUnitHealed, requestRoll } from "../../core";
import type { TricksterAoEContext } from "../../pendingRoll/types";
import {
  ARENA_BONE_FIELD_ID,
  collectSansLineTargetIds,
  hasSansUnbelieverUnlocked,
  isSans,
  isSansCenterOnAttackLine,
  isSansOrPapyrus,
  pickSansLastAttackTargetId,
  unlockSansUnbeliever,
} from "../../sans";
import { getUnitBaseMaxHp } from "../shared";

interface LinePayload {
  target?: Coord;
  line?: Coord;
  center?: Coord;
}

function parseCoord(value: unknown): Coord | null {
  if (!value || typeof value !== "object") return null;
  const col = (value as { col?: unknown }).col;
  const row = (value as { row?: unknown }).row;
  if (typeof col !== "number" || typeof row !== "number") return null;
  return { col, row };
}

function sortUnitIdsByReadingOrder(state: GameState, unitIds: string[]): string[] {
  return [...unitIds].sort((a, b) => {
    const unitA = state.units[a];
    const unitB = state.units[b];
    const posA = unitA?.position;
    const posB = unitB?.position;
    if (!posA || !posB) return a.localeCompare(b);
    if (posA.row !== posB.row) return posA.row - posB.row;
    if (posA.col !== posB.col) return posA.col - posB.col;
    return a.localeCompare(b);
  });
}

function getActionActorId(
  prevState: GameState,
  action: GameAction
): string | undefined {
  if (
    action.type === "move" ||
    action.type === "requestMoveOptions" ||
    action.type === "enterStealth" ||
    action.type === "searchStealth" ||
    action.type === "useAbility" ||
    action.type === "unitStartTurn"
  ) {
    return action.unitId;
  }
  if (action.type === "attack") {
    return action.attackerId;
  }
  if (action.type === "resolvePendingRoll") {
    const pending = prevState.pendingRoll;
    const unitId = pending?.context?.unitId;
    return typeof unitId === "string" ? unitId : undefined;
  }
  return undefined;
}

function requestSansQueuedAttacks(
  state: GameState,
  caster: UnitState,
  abilityId: string,
  center: Coord,
  affectedUnitIds: string[],
  options?: {
    allowFriendlyTarget?: boolean;
  }
): ApplyResult {
  if (affectedUnitIds.length === 0) {
    return {
      state,
      events: [
        evAoeResolved({
          sourceUnitId: caster.id,
          abilityId,
          casterId: caster.id,
          center,
          radius: 0,
          affectedUnitIds: [],
          revealedUnitIds: [],
          damagedUnitIds: [],
          damageByUnitId: {},
        }),
      ],
    };
  }

  const queuedState: GameState = {
    ...state,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: caster.id,
      abilityId,
      center,
      radius: 0,
      affectedUnitIds,
      revealedUnitIds: [],
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: TricksterAoEContext = {
    casterId: caster.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
    allowFriendlyTarget: options?.allowFriendlyTarget ?? false,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
  };

  const requested = requestRoll(
    queuedState,
    caster.owner,
    "tricksterAoE_attackerRoll",
    ctx,
    caster.id
  );

  return { state: requested.state, events: requested.events };
}

export function applySansGasterBlaster(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isSans(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  const payload = (action.payload ?? {}) as LinePayload;
  const target =
    parseCoord(payload.target) ??
    parseCoord(payload.line) ??
    parseCoord(payload.center);
  if (!target || !isInsideBoard(target, state.boardSize)) {
    return { state, events: [] };
  }
  if (!isSansCenterOnAttackLine(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_SANS_GASTER_BLASTER);
  if (!spec) return { state, events: [] };
  const chargeCost = spec.chargesPerUse ?? spec.chargeCost ?? 2;
  const spent = spendCharges(unit, spec.id, chargeCost);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit = spent.unit;
  const updatedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const targets = collectSansLineTargetIds(updatedState, updatedUnit, target);
  const queued = requestSansQueuedAttacks(
    updatedState,
    updatedUnit,
    ABILITY_SANS_GASTER_BLASTER,
    target,
    targets,
    { allowFriendlyTarget: true }
  );

  return {
    state: queued.state,
    events: [
      evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_SANS_GASTER_BLASTER }),
      ...queued.events,
    ],
  };
}

export function applySansBadassJoke(
  state: GameState,
  unit: UnitState,
  rng: { next: () => number }
): ApplyResult {
  if (!isSans(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_SANS_BADASS_JOKE);
  if (!spec) return { state, events: [] };

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }
  const chargeCost = spec.chargesPerUse ?? spec.chargeCost ?? 3;
  const spent = spendCharges(unit, spec.id, chargeCost);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(spent.unit, costs);
  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_SANS_BADASS_JOKE }),
  ];

  const center = updatedUnit.position;
  if (!center) {
    return { state: nextState, events };
  }

  const aoeRes = resolveAoE(
    nextState,
    updatedUnit.id,
    center,
    {
      radius: TRICKSTER_AOE_RADIUS,
      shape: "chebyshev",
      revealHidden: true,
      targetFilter: (target, caster) => target.owner !== caster.owner,
      abilityId: spec.id,
      emitEvent: false,
    },
    rng
  );
  nextState = aoeRes.nextState;
  events.push(...aoeRes.events);

  const affectedUnitIds = sortUnitIdsByReadingOrder(
    nextState,
    Array.from(new Set(aoeRes.affectedUnitIds))
  );
  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: updatedUnit.id,
        abilityId: spec.id,
        casterId: updatedUnit.id,
        center: { ...center },
        radius: TRICKSTER_AOE_RADIUS,
        affectedUnitIds,
        revealedUnitIds: aoeRes.revealedUnitIds,
        damagedUnitIds: [],
        damageByUnitId: {},
      })
    );
    return { state: nextState, events };
  }

  const queuedState: GameState = {
    ...nextState,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: updatedUnit.id,
      abilityId: spec.id,
      center: { ...center },
      radius: TRICKSTER_AOE_RADIUS,
      affectedUnitIds,
      revealedUnitIds: aoeRes.revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };
  const ctx: TricksterAoEContext = {
    casterId: updatedUnit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };
  const requested = requestRoll(
    queuedState,
    updatedUnit.owner,
    "tricksterAoE_attackerRoll",
    ctx,
    updatedUnit.id
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function applySansBoneField(
  state: GameState,
  unit: UnitState,
  rng: { next: () => number }
): ApplyResult {
  if (!isSans(unit) || !unit.isAlive || !hasSansUnbelieverUnlocked(unit)) {
    return { state, events: [] };
  }

  const duration = 1 + Math.floor(rng.next() * 6) + 1;
  const updatedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unit.id]: unit,
    },
    arenaId: ARENA_BONE_FIELD_ID,
    boneFieldTurnsLeft: duration,
  };
  return {
    state: updatedState,
    events: [
      evAbilityUsed({ unitId: unit.id, abilityId: ABILITY_SANS_BONE_FIELD }),
      {
        type: "sansBoneFieldActivated",
        sansId: unit.id,
        duration,
      },
    ],
  };
}

export function applySansSleep(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isSans(unit) || !unit.isAlive || !hasSansUnbelieverUnlocked(unit)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_SANS_SLEEP);
  if (!spec) return { state, events: [] };
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeCost = spec.chargesPerUse ?? spec.chargeCost ?? 3;
  const spent = spendCharges(unit, spec.id, chargeCost);
  if (!spent.ok) {
    return { state, events: [] };
  }
  const slotted = spendSlots(spent.unit, costs);
  const maxHp = getUnitBaseMaxHp(slotted);
  const hpBefore = slotted.hp;
  const healed = Math.max(0, Math.min(2, maxHp - hpBefore));
  const updatedUnit: UnitState = {
    ...slotted,
    hp: Math.min(maxHp, hpBefore + 2),
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_SANS_SLEEP }),
  ];
  if (healed > 0) {
    events.push(
      evUnitHealed({
        unitId: updatedUnit.id,
        amount: healed,
        hpAfter: updatedUnit.hp,
        sourceAbilityId: ABILITY_SANS_SLEEP,
      })
    );
  }

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
    },
    events,
  };
}

export function applySansBoneFieldStartOfTurn(
  state: GameState,
  unitId: string,
  rng: { next: () => number }
): ApplyResult {
  if (state.arenaId !== ARENA_BONE_FIELD_ID) {
    return { state, events: [] };
  }

  let nextState = state;
  const nextEvents: GameEvent[] = [];

  let changed = false;
  const cleanedUnits: Record<string, UnitState> = { ...nextState.units };
  for (const unit of Object.values(nextState.units)) {
    const status = unit.sansBoneFieldStatus;
    if (!status || status.turnNumber === state.turnNumber) continue;
    cleanedUnits[unit.id] = {
      ...unit,
      sansBoneFieldStatus: undefined,
    };
    changed = true;
  }
  if (changed) {
    nextState = {
      ...nextState,
      units: cleanedUnits,
    };
  }

  const turnsLeft = Math.max(0, Math.trunc(nextState.boneFieldTurnsLeft ?? 0));
  if (turnsLeft <= 0) {
    return {
      state: {
        ...nextState,
        arenaId: null,
        boneFieldTurnsLeft: 0,
      },
      events: nextEvents,
    };
  }

  const activeUnit = nextState.units[unitId];
  if (activeUnit && activeUnit.isAlive && !isSansOrPapyrus(activeUnit)) {
    const roll = 1 + Math.floor(rng.next() * 2);
    const boneType: PapyrusBoneType = roll === 1 ? "blue" : "orange";
    const updatedUnit: UnitState = {
      ...activeUnit,
      sansBoneFieldStatus: {
        kind: boneType,
        turnNumber: state.turnNumber,
      },
    };
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [updatedUnit.id]: updatedUnit,
      },
    };
    nextEvents.push({
      type: "sansBoneFieldApplied",
      unitId: updatedUnit.id,
      boneType,
      turnNumber: state.turnNumber,
    });
  }

  return {
    state: {
      ...nextState,
      boneFieldTurnsLeft: Math.max(0, turnsLeft - 1),
    },
    events: nextEvents,
  };
}

function applySansBadassJokeDebuffs(
  state: GameState,
  prevState: GameState,
  events: GameEvent[]
): ApplyResult {
  if (prevState.pendingAoE?.abilityId !== ABILITY_SANS_BADASS_JOKE) {
    return { state, events: [] };
  }

  let nextState = state;
  const nextEvents: GameEvent[] = [];

  for (const event of events) {
    if (event.type !== "attackResolved" || !event.hit) continue;
    const sans = nextState.units[event.attackerId];
    if (!isSans(sans) || !sans.isAlive) continue;
    const target = nextState.units[event.defenderId];
    if (!target || !target.isAlive) continue;

    const updatedTarget: UnitState = {
      ...target,
      movementDisabledNextTurn: true,
      sansMoveLockArmed: true,
      sansMoveLockSourceId: sans.id,
    };
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [updatedTarget.id]: updatedTarget,
      },
    };
    nextEvents.push({
      type: "sansBadassJokeApplied",
      sansId: sans.id,
      targetId: updatedTarget.id,
    });
  }

  return { state: nextState, events: nextEvents };
}

function applySansUnbelieverFromDeaths(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const fallenHeroIds = events
    .filter((event) => event.type === "unitDied")
    .map((event) => (event.type === "unitDied" ? event.unitId : ""))
    .filter((unitId) => {
      const unit = state.units[unitId];
      return !!unit?.heroId && unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID;
    });
  if (fallenHeroIds.length === 0) {
    return { state, events: [] };
  }

  const uniqueFallen = Array.from(new Set(fallenHeroIds)).sort();
  let nextState = state;
  const nextEvents: GameEvent[] = [];

  for (const sans of Object.values(state.units).sort((a, b) =>
    a.id.localeCompare(b.id)
  )) {
    if (!isSans(sans) || !sans.isAlive || hasSansUnbelieverUnlocked(sans)) {
      continue;
    }
    const fallenAllyId = uniqueFallen.find((unitId) => {
      const fallen = nextState.units[unitId];
      if (!fallen || !fallen.heroId) return false;
      if (fallen.id === sans.id) return false;
      return fallen.owner === sans.owner;
    });
    if (!fallenAllyId) continue;

    const unlocked = unlockSansUnbeliever(sans);
    const withSleepCharges = setCharges(
      unlocked,
      ABILITY_SANS_SLEEP,
      unlocked.charges?.[ABILITY_SANS_SLEEP] ?? 0
    );
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [withSleepCharges.id]: withSleepCharges,
      },
    };
    nextEvents.push({
      type: "sansUnbelieverActivated",
      sansId: withSleepCharges.id,
      fallenAllyId,
    });
  }

  return { state: nextState, events: nextEvents };
}

function applySansBoneFieldPunish(
  state: GameState,
  targetId: string,
  expectedBoneType: PapyrusBoneType,
  reason: "moveSpent" | "moveNotSpent",
  expectedTurnNumber: number
): ApplyResult {
  const target = state.units[targetId];
  if (!target || !target.isAlive) return { state, events: [] };
  const status = target.sansBoneFieldStatus;
  if (
    !status ||
    status.kind !== expectedBoneType ||
    status.turnNumber !== expectedTurnNumber
  ) {
    return { state, events: [] };
  }
  if (
    expectedBoneType === "blue" &&
    status.bluePunishedTurnNumber === expectedTurnNumber
  ) {
    return { state, events: [] };
  }

  const hpAfter = Math.max(0, target.hp - 1);
  const updatedStatus = {
    ...status,
    bluePunishedTurnNumber:
      expectedBoneType === "blue"
        ? expectedTurnNumber
        : status.bluePunishedTurnNumber,
  };
  let updatedTarget: UnitState = {
    ...target,
    hp: hpAfter,
    sansBoneFieldStatus: updatedStatus,
  };
  const events: GameEvent[] = [
    {
      type: "sansBoneFieldPunished",
      targetId: updatedTarget.id,
      boneType: status.kind,
      damage: 1,
      reason,
      hpAfter,
    },
  ];

  if (hpAfter <= 0) {
    updatedTarget = {
      ...updatedTarget,
      isAlive: false,
      position: null,
    };
    events.push(
      evUnitDied({
        unitId: updatedTarget.id,
        killerId: null,
      })
    );
  }

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedTarget.id]: updatedTarget,
      },
    },
    events,
  };
}

function applySansLastAttackFromDeaths(
  state: GameState,
  prevState: GameState,
  events: GameEvent[]
): ApplyResult {
  let nextState = state;
  const nextEvents: GameEvent[] = [];

  const sansDeathEvents = events
    .filter((event) => event.type === "unitDied")
    .map((event) => (event.type === "unitDied" ? event.unitId : ""))
    .filter((unitId) => {
      const prevUnit = prevState.units[unitId];
      return !!prevUnit && isSans(prevUnit) && hasSansUnbelieverUnlocked(prevUnit);
    });
  if (sansDeathEvents.length === 0) {
    return { state, events: [] };
  }

  for (const sansId of Array.from(new Set(sansDeathEvents)).sort()) {
    const prevSans = prevState.units[sansId];
    if (!prevSans || !isSans(prevSans)) continue;
    const targetId = pickSansLastAttackTargetId(
      nextState,
      prevSans.owner,
      prevSans.position
    );
    if (!targetId) continue;
    const target = nextState.units[targetId];
    if (!target || !target.isAlive) continue;
    const updatedTarget: UnitState = {
      ...target,
      sansLastAttackCurseSourceId: prevSans.id,
    };
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [updatedTarget.id]: updatedTarget,
      },
    };
    nextEvents.push({
      type: "sansLastAttackApplied",
      sansId: prevSans.id,
      targetId: updatedTarget.id,
    });
  }

  return { state: nextState, events: nextEvents };
}

function applySansLastAttackTickOnTurnStart(
  state: GameState,
  action: GameAction
): ApplyResult {
  if (action.type !== "unitStartTurn") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit) return { state, events: [] };
  if (!unit.sansLastAttackCurseSourceId) return { state, events: [] };

  if (!unit.isAlive) {
    const cleared: UnitState = {
      ...unit,
      sansLastAttackCurseSourceId: undefined,
    };
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [cleared.id]: cleared,
        },
      },
      events: [
        {
          type: "sansLastAttackRemoved",
          targetId: cleared.id,
          reason: "targetDead",
        },
      ],
    };
  }

  if (unit.hp <= 1) {
    const cleared: UnitState = {
      ...unit,
      sansLastAttackCurseSourceId: undefined,
    };
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [cleared.id]: cleared,
        },
      },
      events: [
        {
          type: "sansLastAttackRemoved",
          targetId: cleared.id,
          reason: "hpOne",
        },
      ],
    };
  }

  const hpAfter = Math.max(1, unit.hp - 1);
  const damage = unit.hp - hpAfter;
  const updated: UnitState = {
    ...unit,
    hp: hpAfter,
    sansLastAttackCurseSourceId: hpAfter <= 1 ? undefined : unit.sansLastAttackCurseSourceId,
  };
  const events: GameEvent[] = [
    {
      type: "sansLastAttackTick",
      targetId: updated.id,
      damage,
      hpAfter,
    },
  ];
  if (hpAfter <= 1) {
    events.push({
      type: "sansLastAttackRemoved",
      targetId: updated.id,
      reason: "hpOne",
    });
  }

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    },
    events,
  };
}

function clearCursesForDeadUnits(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const deadIds = events
    .filter((event) => event.type === "unitDied")
    .map((event) => (event.type === "unitDied" ? event.unitId : ""))
    .filter((id) => id.length > 0);
  if (deadIds.length === 0) {
    return { state, events: [] };
  }

  let nextState = state;
  const nextEvents: GameEvent[] = [];
  for (const deadId of Array.from(new Set(deadIds))) {
    const unit = nextState.units[deadId];
    if (!unit || !unit.sansLastAttackCurseSourceId) continue;
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [unit.id]: {
          ...unit,
          sansLastAttackCurseSourceId: undefined,
        },
      },
    };
    nextEvents.push({
      type: "sansLastAttackRemoved",
      targetId: unit.id,
      reason: "targetDead",
    });
  }
  return { state: nextState, events: nextEvents };
}

function applySansMoveDeniedNotice(
  state: GameState,
  prevState: GameState,
  action: GameAction
): ApplyResult {
  if (action.type !== "unitStartTurn") {
    return { state, events: [] };
  }
  const prevUnit = prevState.units[action.unitId];
  const nextUnit = state.units[action.unitId];
  if (!prevUnit || !nextUnit || !prevUnit.sansMoveLockArmed) {
    return { state, events: [] };
  }
  if (!nextUnit.turn.moveUsed) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = {
    ...nextUnit,
    sansMoveLockArmed: false,
    sansMoveLockSourceId: undefined,
  };
  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
    },
    events: [
      {
        type: "sansMoveDenied",
        unitId: updatedUnit.id,
        sourceSansId: prevUnit.sansMoveLockSourceId,
      },
    ],
  };
}

export function applySansPostAction(
  prevState: GameState,
  action: GameAction,
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  let nextState = state;
  let nextEvents: GameEvent[] = [...events];

  const actorId = getActionActorId(prevState, action);
  if (actorId) {
    const prevActor = prevState.units[actorId];
    const nextActor = nextState.units[actorId];
    if (
      prevActor &&
      nextActor &&
      !prevActor.turn.moveUsed &&
      nextActor.turn.moveUsed
    ) {
      const punished = applySansBoneFieldPunish(
        nextState,
        actorId,
        "blue",
        "moveSpent",
        prevState.turnNumber
      );
      nextState = punished.state;
      nextEvents = [...nextEvents, ...punished.events];
    }
  }

  if (action.type === "endTurn") {
    const endingUnitId = prevState.activeUnitId;
    if (endingUnitId) {
      const endingUnitBefore = prevState.units[endingUnitId];
      if (endingUnitBefore && !endingUnitBefore.turn.moveUsed) {
        const punished = applySansBoneFieldPunish(
          nextState,
          endingUnitId,
          "orange",
          "moveNotSpent",
          prevState.turnNumber
        );
        nextState = punished.state;
        nextEvents = [...nextEvents, ...punished.events];
      }
    }
  }

  const badJoke = applySansBadassJokeDebuffs(nextState, prevState, nextEvents);
  nextState = badJoke.state;
  nextEvents = [...nextEvents, ...badJoke.events];

  const unbeliever = applySansUnbelieverFromDeaths(nextState, nextEvents);
  nextState = unbeliever.state;
  nextEvents = [...nextEvents, ...unbeliever.events];

  const lastAttack = applySansLastAttackFromDeaths(nextState, prevState, nextEvents);
  nextState = lastAttack.state;
  nextEvents = [...nextEvents, ...lastAttack.events];

  const curseTick = applySansLastAttackTickOnTurnStart(nextState, action);
  nextState = curseTick.state;
  nextEvents = [...nextEvents, ...curseTick.events];

  const denied = applySansMoveDeniedNotice(nextState, prevState, action);
  nextState = denied.state;
  nextEvents = [...nextEvents, ...denied.events];

  const clearDead = clearCursesForDeadUnits(nextState, nextEvents);
  nextState = clearDead.state;
  nextEvents = [...nextEvents, ...clearDead.events];

  return {
    state: nextState,
    events: nextEvents,
  };
}
