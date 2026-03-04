import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  UnitState,
} from "../../../model";
import {
  hasSansUnbelieverUnlocked,
  isSans,
  pickSansLastAttackTargetId,
} from "../../../sans";

export function applySansLastAttackFromDeaths(
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

export function applySansLastAttackTickOnTurnStart(
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

export function clearCursesForDeadUnits(
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

export function applySansMoveDeniedNotice(
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
