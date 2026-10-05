import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  UnitState,
  PendingRoll,
  ResolveRollChoice,
} from "../../../model";
import { requestRoll } from "../../../core";

function finishSansDeath(state: GameState, sans: UnitState): ApplyResult {
  return {
    state: {
      ...state,
      activeUnitId: state.activeUnitId === sans.id ? null : state.activeUnitId,
      pendingMove: state.pendingMove?.unitId === sans.id ? null : state.pendingMove,
      units: {
        ...state.units,
        [sans.id]: { ...sans, hp: 0, isAlive: false, position: null, sansPendingDeath: undefined },
      },
    },
    events: [
      { type: "unitDied", unitId: sans.id, killerId: sans.sansPendingDeath?.killerId ?? null },
    ],
  };
}

export function resolveSansLastAttackTarget(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
): ApplyResult {
  if (!choice || typeof choice !== "object" || choice.type !== "sansLastAttackTarget") {
    return { state, events: [] };
  }
  const sans = state.units[String(pending.context.sourceUnitId)];
  const target = state.units[choice.targetId];
  const legalTargetIds = pending.context.legalTargetIds as string[];
  if (
    !sans?.sansPendingDeath ||
    !target?.isAlive ||
    target.hp <= 0 ||
    target.owner === sans.owner ||
    !legalTargetIds.includes(target.id)
  ) {
    return { state, events: [] };
  }
  const cursedState: GameState = {
    ...state,
    pendingRoll: (pending.context.resumePendingRoll as PendingRoll | null) ?? null,
    units: { ...state.units, [target.id]: { ...target, sansLastAttackCurseSourceId: sans.id } },
  };
  const finished = finishSansDeath(cursedState, sans);
  return {
    state: finished.state,
    events: [
      { type: "sansLastAttackApplied", sansId: sans.id, targetId: target.id },
      ...finished.events,
    ],
  };
}

export function applySansLastAttackFromDeaths(state: GameState): ApplyResult {
  let nextState = state;
  const nextEvents: GameEvent[] = [];

  if (state.pendingRoll?.kind === "selectLastAttackTarget") return { state, events: [] };
  for (const sans of Object.values(state.units).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!sans.sansPendingDeath) continue;
    const legalTargetIds = Object.values(nextState.units)
      .filter((unit) => unit.isAlive && unit.hp > 0 && unit.owner !== sans.owner)
      .map((unit) => unit.id)
      .sort();
    if (legalTargetIds.length === 0) {
      const finished = finishSansDeath(nextState, sans);
      nextState = finished.state;
      nextEvents.push(...finished.events);
      continue;
    }
    // Suspend a queued combat roll without losing its explicit dice continuation.
    const requested = requestRoll(
      { ...nextState, pendingRoll: null },
      sans.owner,
      "selectLastAttackTarget",
      {
        sourceUnitId: sans.id,
        playerId: sans.owner,
        legalTargetIds,
        resumePendingRoll: nextState.pendingRoll,
      },
      sans.id,
    );
    nextState = requested.state;
    nextEvents.push(...requested.events);
    break;
  }

  return { state: nextState, events: nextEvents };
}

export function applySansLastAttackTickOnTurnStart(
  state: GameState,
  action: GameAction,
): ApplyResult {
  if (action.type !== "unitStartTurn") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit) return { state, events: [] };
  if (!unit.sansLastAttackCurseSourceId) return { state, events: [] };
  if (unit.sansLastAttackLastTickTurnNumber === state.turnNumber) return { state, events: [] };

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
      hp: 1,
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
    sansLastAttackLastTickTurnNumber: state.turnNumber,
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

export function clearCursesForDeadUnits(state: GameState, events: GameEvent[]): ApplyResult {
  const deadIds = events
    .filter((event) => event.type === "unitDied")
    .map((event) => (event.type === "unitDied" ? event.unitId : ""))
    .filter((id) => id.length > 0);
  deadIds.push(
    ...Object.values(state.units)
      .filter((unit) => unit.isAlive && unit.hp === 1 && !!unit.sansLastAttackCurseSourceId)
      .map((unit) => unit.id),
  );

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
      reason: unit.isAlive ? "hpOne" : "targetDead",
    });
  }
  return { state: nextState, events: nextEvents };
}

export function applySansMoveDeniedNotice(
  state: GameState,
  prevState: GameState,
  action: GameAction,
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
