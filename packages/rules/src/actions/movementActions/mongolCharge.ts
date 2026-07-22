import type {
  ApplyResult,
  GameEvent,
  GameState,
  PendingCombatQueueEntry,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../model";
import type { RNG } from "../../rng";
import { coordsEqual } from "../../board";
import { getLegalAttackTargets } from "../../legal";
import { linePath } from "../../path";
import { canSpendSlots } from "../../turnEconomy";
import { findStakeStopOnPath, applyStakeTriggerIfAny } from "../../core";
import { clearPendingRoll, makeAttackContext, requestRoll } from "../../core";
import { evUnitMoved } from "../../core";
import { maybeRequestForestMoveCheck } from "./forest";
import { getMongolChargeInfluenceCells } from "../../movement/mongolCharge";
import { sortUnitIdsByReadingOrder } from "./rider";
import type { MongolChargeAllyAttackTargetContext } from "../../pendingRoll/types";
import type { MoveActionInternal } from "./types";

export function applyMongolChargeMove(
  state: GameState,
  unit: UnitState,
  action: MoveActionInternal,
  rng: RNG
): ApplyResult {
  const from = unit.position;
  if (!from) {
    return { state, events: [] };
  }

  const pending = state.pendingMove;
  const pendingValid =
    pending &&
    pending.unitId === unit.id &&
    pending.expiresTurnNumber === state.turnNumber;
  if (!pendingValid) {
    return { state, events: [] };
  }

  const isLegal = pending.legalTo.some((c) => coordsEqual(c, action.to));
  if (!isLegal) {
    return { state, events: [] };
  }

  const intendedLine = linePath(from, action.to);
  if (!intendedLine) {
    return { state, events: [] };
  }

  const bypassForestCheck = action.__forestBypass === true;
  if (!bypassForestCheck) {
    const forestCheck = maybeRequestForestMoveCheck(
      state,
      unit,
      from,
      action.to,
      intendedLine,
      pending.legalTo
    );
    if (forestCheck) {
      return forestCheck;
    }
  }

  const stakePath = intendedLine.slice(1);
  const stakeStop = findStakeStopOnPath(state, unit, stakePath);
  const finalTo = stakeStop ?? action.to;
  const didMove = !coordsEqual(finalTo, from);

  if (!didMove) {
    const updatedUnit: UnitState = {
      ...unit,
      genghisKhanMongolChargeActive: false,
    };
    const newState: GameState = {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
      pendingMove: pendingValid ? null : state.pendingMove,
    };
    return { state: newState, events: [] };
  }

  let updatedUnit: UnitState = {
    ...unit,
    position: { ...finalTo },
    genghisKhanMongolChargeActive: false,
  };

  let newState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
    pendingMove: pendingValid ? null : state.pendingMove,
  };

  const events: GameEvent[] = [];
  if (didMove) {
    events.push(
      evUnitMoved({ unitId: updatedUnit.id, from, to: updatedUnit.position! })
    );
  }

  if (didMove) {
    const stakeResult = applyStakeTriggerIfAny(
      newState,
      updatedUnit,
      updatedUnit.position!,
      rng
    );
    if (stakeResult.triggered) {
      newState = stakeResult.state;
      updatedUnit = stakeResult.unit;
      events.push(...stakeResult.events);
    }
  }

  if (!updatedUnit.position) {
    return { state: newState, events };
  }

  const path = linePath(from, updatedUnit.position);
  if (!path) {
    return { state: newState, events };
  }

  const corridor = getMongolChargeInfluenceCells(path, newState.boardSize);
  const corridorSet = new Set(corridor.map((cell) => `${cell.col},${cell.row}`));
  const allies = Object.values(newState.units).filter(
    (other) =>
      other.isAlive &&
      other.position &&
      other.owner === unit.owner &&
      other.id !== unit.id &&
      corridorSet.has(`${other.position.col},${other.position.row}`)
  );

  // Preserve the established Mongol Charge ordering so replays stay stable.
  const orderedAllyIds = [...allies]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((ally) => ally.id);

  const continued = continueMongolChargeAlliedAttacks(
    newState,
    unit.id,
    orderedAllyIds,
    []
  );
  return { state: continued.state, events: [...events, ...continued.events] };
}

function makeMongolChargeQueueEntry(
  controllerUnitId: string,
  sourceUnitId: string,
  targetId: string
): PendingCombatQueueEntry {
  return {
    attackerId: sourceUnitId,
    defenderId: targetId,
    damageBonusSourceId: controllerUnitId,
    consumeSlots: true,
    kind: "aoe",
  };
}

function startMongolChargeAttackQueue(
  state: GameState,
  queue: PendingCombatQueueEntry[]
): ApplyResult {
  const first = queue[0];
  if (!first) return { state, events: [] };
  const attacker = state.units[first.attackerId];
  if (!attacker) return { state, events: [] };

  const queuedState: GameState = { ...state, pendingCombatQueue: queue };
  return requestRoll(
    queuedState,
    attacker.owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: first.attackerId,
      defenderId: first.defenderId,
      damageBonusSourceId: first.damageBonusSourceId,
      consumeSlots: first.consumeSlots ?? false,
      queueKind: "aoe",
    }),
    first.attackerId
  );
}

function getCurrentMongolChargeTargets(
  state: GameState,
  controllerUnitId: string,
  sourceUnitId: string
): string[] {
  const controller = state.units[controllerUnitId];
  const source = state.units[sourceUnitId];
  if (
    !controller ||
    !source ||
    !source.isAlive ||
    !source.position ||
    source.owner !== controller.owner ||
    !canSpendSlots(source, { attack: true, action: true })
  ) {
    return [];
  }
  return sortUnitIdsByReadingOrder(state, getLegalAttackTargets(state, source.id));
}

function continueMongolChargeAlliedAttacks(
  state: GameState,
  controllerUnitId: string,
  allyIds: string[],
  queuedAttacks: PendingCombatQueueEntry[]
): ApplyResult {
  const controller = state.units[controllerUnitId];
  if (!controller) return { state, events: [] };

  const queue = [...queuedAttacks];
  for (let index = 0; index < allyIds.length; index += 1) {
    const sourceUnitId = allyIds[index]!;
    const legalTargetIds = getCurrentMongolChargeTargets(
      state,
      controllerUnitId,
      sourceUnitId
    );
    if (legalTargetIds.length === 0) continue;
    if (legalTargetIds.length === 1) {
      queue.push(
        makeMongolChargeQueueEntry(controllerUnitId, sourceUnitId, legalTargetIds[0]!)
      );
      continue;
    }

    const context: MongolChargeAllyAttackTargetContext = {
      sourceUnitId,
      controllerUnitId,
      legalTargetIds,
      options: legalTargetIds,
      remainingAllyIds: allyIds.slice(index + 1),
      queuedAttacks: queue,
    };
    return requestRoll(
      state,
      controller.owner,
      "mongolChargeAllyAttackTarget",
      context,
      sourceUnitId
    );
  }

  return startMongolChargeAttackQueue(state, queue);
}

export function resolveMongolChargeAllyAttackTarget(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const context = pending.context as MongolChargeAllyAttackTargetContext;
  if (
    !choice ||
    typeof choice !== "object" ||
    choice.type !== "mongolChargeAllyAttackTarget"
  ) {
    return { state, events: [] };
  }

  const declaredTargets = Array.isArray(context.legalTargetIds)
    ? context.legalTargetIds
    : [];
  const currentTargets = getCurrentMongolChargeTargets(
    state,
    context.controllerUnitId,
    context.sourceUnitId
  );
  if (
    !declaredTargets.includes(choice.targetId) ||
    !currentTargets.includes(choice.targetId)
  ) {
    return { state, events: [] };
  }

  const queuedAttacks = Array.isArray(context.queuedAttacks)
    ? context.queuedAttacks
    : [];
  const nextQueue = [
    ...queuedAttacks,
    makeMongolChargeQueueEntry(
      context.controllerUnitId,
      context.sourceUnitId,
      choice.targetId
    ),
  ];
  const remainingAllyIds = Array.isArray(context.remainingAllyIds)
    ? context.remainingAllyIds.filter((id): id is string => typeof id === "string")
    : [];

  return continueMongolChargeAlliedAttacks(
    clearPendingRoll(state),
    context.controllerUnitId,
    remainingAllyIds,
    nextQueue
  );
}
