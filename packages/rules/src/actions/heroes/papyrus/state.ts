import type {
  ApplyResult,
  GameEvent,
  GameState,
  PapyrusBoneStatus,
  PapyrusBoneType,
  UnitState,
} from "../../../model";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  getAbilitySpec,
  setCharges,
} from "../../../abilities";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import { evUnitDied, requestRoll } from "../../../core";
import { isPapyrus, isPapyrusBoneStatusActive } from "./helpers";

export function applyPapyrusBonePunish(
  state: GameState,
  targetId: string,
  expectedBoneType: PapyrusBoneType,
  reason: "moveSpent" | "nonMoveFirst"
): ApplyResult {
  const target = state.units[targetId];
  if (!target || !target.isAlive) return { state, events: [] };
  const status = target.papyrusBoneStatus;
  if (
    !isPapyrusBoneStatusActive(state, status) ||
    status.kind !== expectedBoneType
  ) {
    return { state, events: [] };
  }
  if (
    expectedBoneType === "blue" &&
    status.bluePunishedTurnNumber === state.turnNumber
  ) {
    return { state, events: [] };
  }
  if (
    expectedBoneType === "orange" &&
    (target.orangeBoneFirstMoveSatisfied ||
      target.orangeBonePenaltyAppliedThisTurn)
  ) {
    return { state, events: [] };
  }

  const hpAfter = Math.max(0, target.hp - 1);
  const updatedStatus: PapyrusBoneStatus = {
    ...status,
    bluePunishedTurnNumber:
      expectedBoneType === "blue" ? state.turnNumber : status.bluePunishedTurnNumber,
  };
  let updatedTarget: UnitState = {
    ...target,
    hp: hpAfter,
    papyrusBoneStatus: updatedStatus,
    orangeBonePenaltyAppliedThisTurn:
      expectedBoneType === "orange"
        ? true
        : target.orangeBonePenaltyAppliedThisTurn,
    hasSpentMeaningfulTurnAction:
      expectedBoneType === "orange"
        ? true
        : target.hasSpentMeaningfulTurnAction,
  };
  const events: GameEvent[] = [
    {
      type: "papyrusBonePunished",
      papyrusId: status.sourceUnitId,
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
        killerId: status.sourceUnitId,
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

export function applyPapyrusBoneStatus(
  state: GameState,
  papyrusId: string,
  targetId: string,
  boneType: PapyrusBoneType
): ApplyResult {
  const papyrus = state.units[papyrusId];
  const target = state.units[targetId];
  if (!isPapyrus(papyrus) || !papyrus.isAlive || !target?.isAlive) {
    return { state, events: [] };
  }

  const expiresOnSourceOwnTurn = (papyrus.ownTurnsStarted ?? 0) + 1;
  const status: PapyrusBoneStatus = {
    sourceUnitId: papyrus.id,
    kind: boneType,
    expiresOnSourceOwnTurn,
    bluePunishedTurnNumber: undefined,
  };
  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [target.id]: {
          ...target,
          papyrusBoneStatus: status,
        },
      },
    },
    events: [
      {
        type: "papyrusBoneApplied",
        papyrusId: papyrus.id,
        targetId: target.id,
        boneType,
        expiresOnSourceOwnTurn,
      },
    ],
  };
}

/**
 * Pre-transformation hits apply Blue Bone immediately. Transformed hits are
 * queued while combat (including every AoE defense) finishes, then exposed as
 * one authoritative choice at a time.
 */
export function applyPapyrusBoneOnHits(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  let nextState = state;
  const nextEvents: GameEvent[] = [];
  const queued = [...(state.pendingPapyrusBoneChoices ?? [])];

  for (const event of events) {
    if (event.type !== "attackResolved" || !event.hit) continue;

    const papyrus = nextState.units[event.attackerId];
    if (!isPapyrus(papyrus) || !papyrus.isAlive) continue;
    const target = nextState.units[event.defenderId];
    if (!target || !target.isAlive) continue;

    if (!papyrus.papyrusUnbelieverActive) {
      const applied = applyPapyrusBoneStatus(
        nextState,
        papyrus.id,
        target.id,
        "blue"
      );
      nextState = applied.state;
      nextEvents.push(...applied.events);
      continue;
    }

    if (
      !queued.some(
        (choice) =>
          choice.papyrusUnitId === papyrus.id &&
          choice.targetUnitId === target.id
      )
    ) {
      queued.push({ papyrusUnitId: papyrus.id, targetUnitId: target.id });
    }
  }

  const previousQueue = state.pendingPapyrusBoneChoices ?? [];
  if (
    queued.length !== previousQueue.length ||
    queued.some((choice, index) => choice !== previousQueue[index])
  ) {
    nextState = { ...nextState, pendingPapyrusBoneChoices: queued };
  }

  return { state: nextState, events: nextEvents };
}

export function maybeRequestPapyrusBoneChoice(state: GameState): ApplyResult {
  if (state.pendingRoll) return { state, events: [] };

  const queue = state.pendingPapyrusBoneChoices ?? [];
  let firstIndex = -1;
  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index];
    const papyrus = state.units[entry.papyrusUnitId];
    const target = state.units[entry.targetUnitId];
    if (
      isPapyrus(papyrus) &&
      papyrus.isAlive &&
      papyrus.papyrusUnbelieverActive &&
      target?.isAlive
    ) {
      firstIndex = index;
      break;
    }
  }

  if (firstIndex < 0) {
    return queue.length > 0
      ? { state: { ...state, pendingPapyrusBoneChoices: [] }, events: [] }
      : { state, events: [] };
  }

  const first = queue[firstIndex];
  const targetIds = queue
    .filter((entry) => entry.papyrusUnitId === first.papyrusUnitId)
    .map((entry) => entry.targetUnitId)
    .filter((targetId, index, ids) => ids.indexOf(targetId) === index)
    .filter((targetId) => state.units[targetId]?.isAlive === true);
  const remainingQueue = queue.filter(
    (entry) => entry.papyrusUnitId !== first.papyrusUnitId
  );
  const baseState: GameState = {
    ...state,
    pendingPapyrusBoneChoices: remainingQueue,
  };
  if (targetIds.length === 0) {
    return maybeRequestPapyrusBoneChoice(baseState);
  }

  const papyrus = state.units[first.papyrusUnitId];
  const requested = requestRoll(
    baseState,
    papyrus.owner,
    "papyrusBoneChoice",
    {
      papyrusUnitId: papyrus.id,
      targetUnitId: targetIds[0],
      targetIds,
      currentTargetIndex: 0,
      targetIndex: 1,
      targetCount: targetIds.length,
      availableBones: ["blue", "orange"],
    },
    papyrus.id
  );
  return requested;
}

export function applyPapyrusUnbelieverFromDeaths(
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

  for (const papyrus of Object.values(state.units).sort((a, b) =>
    a.id.localeCompare(b.id)
  )) {
    if (!isPapyrus(papyrus) || !papyrus.isAlive || papyrus.papyrusUnbelieverActive) {
      continue;
    }
    const fallenAllyId = uniqueFallen.find((unitId) => {
      const fallen = nextState.units[unitId];
      if (!fallen || !fallen.heroId) return false;
      if (fallen.id === papyrus.id) return false;
      return fallen.owner === papyrus.owner;
    });
    if (!fallenAllyId) continue;

    const berserkSpec = getAbilitySpec(ABILITY_BERSERK_AUTO_DEFENSE);
    const berserkFull = berserkSpec?.maxCharges ?? 6;
    let transformedPapyrus: UnitState = {
      ...papyrus,
      papyrusUnbelieverActive: true,
      papyrusLongBoneMode: papyrus.papyrusLongBoneMode ?? false,
      papyrusLineAxis: papyrus.papyrusLineAxis ?? "row",
    };
    transformedPapyrus = setCharges(
      transformedPapyrus,
      ABILITY_BERSERK_AUTO_DEFENSE,
      berserkFull
    );

    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [papyrus.id]: transformedPapyrus,
      },
    };
    nextEvents.push({
      type: "papyrusUnbelieverActivated",
      papyrusId: papyrus.id,
      fallenAllyId,
    });
  }

  return { state: nextState, events: nextEvents };
}

export function clearExpiredPapyrusStatusesForSource(
  state: GameState,
  sourcePapyrusId: string
): GameState {
  const source = state.units[sourcePapyrusId];
  if (!isPapyrus(source)) return state;
  const sourceOwnTurns = source.ownTurnsStarted ?? 0;

  let changed = false;
  const units: Record<string, UnitState> = { ...state.units };
  for (const unit of Object.values(state.units)) {
    const status = unit.papyrusBoneStatus;
    if (!status || status.sourceUnitId !== sourcePapyrusId) continue;
    if (sourceOwnTurns < status.expiresOnSourceOwnTurn) continue;
    changed = true;
    units[unit.id] = {
      ...unit,
      papyrusBoneStatus: undefined,
    };
  }

  return changed ? { ...state, units } : state;
}
