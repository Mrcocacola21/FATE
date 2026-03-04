import type {
  ApplyResult,
  GameEvent,
  GameState,
  PapyrusBoneType,
  UnitState,
} from "../../../model";
import {
  ABILITY_SANS_BADASS_JOKE,
  ABILITY_SANS_SLEEP,
  setCharges,
} from "../../../abilities";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import { evUnitDied } from "../../../core";
import {
  hasSansUnbelieverUnlocked,
  isSans,
  unlockSansUnbeliever,
} from "../../../sans";

export function applySansBadassJokeDebuffs(
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

export function applySansUnbelieverFromDeaths(
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

export function applySansBoneFieldPunish(
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
