import type {
  ApplyResult,
  GameEvent,
  GameState,
  UnitState,
} from "../../model";
import type { RNG } from "../../rng";
import { coordsEqual } from "../../board";
import { getLegalAttackTargets } from "../../legal";
import { linePath } from "../../path";
import { canSpendSlots } from "../../turnEconomy";
import { findStakeStopOnPath, applyStakeTriggerIfAny } from "../../core";
import { makeAttackContext, requestRoll } from "../../core";
import { evUnitMoved } from "../../core";
import { maybeRequestForestMoveCheck } from "./forest";
import { getMongolChargeCorridor, sortUnitIdsByReadingOrder } from "./rider";
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

  const corridor = getMongolChargeCorridor(path, newState.boardSize);
  const corridorSet = new Set(corridor.map((cell) => `${cell.col},${cell.row}`));
  const allies = Object.values(newState.units).filter(
    (other) =>
      other.isAlive &&
      other.position &&
      other.owner === unit.owner &&
      other.id !== unit.id &&
      corridorSet.has(`${other.position.col},${other.position.row}`)
  );

  const orderedAllies = [...allies].sort((a, b) => a.id.localeCompare(b.id));
  const queue = orderedAllies.flatMap((ally) => {
    if (!ally.position) return [];
    if (!canSpendSlots(ally, { attack: true, action: true })) return [];
    const targets = getLegalAttackTargets(newState, ally.id);
    if (targets.length === 0) return [];
    const sortedTargets = sortUnitIdsByReadingOrder(newState, targets);
    const defenderId = sortedTargets[0];
    if (!defenderId) return [];
    return [
      {
        attackerId: ally.id,
        defenderId,
        damageBonusSourceId: unit.id,
        consumeSlots: true,
        kind: "aoe" as const,
      },
    ];
  });

  if (queue.length === 0) {
    return { state: newState, events };
  }

  const queuedState: GameState = {
    ...newState,
    pendingCombatQueue: queue,
  };

  const first = queue[0];
  const ctx = makeAttackContext({
    attackerId: first.attackerId,
    defenderId: first.defenderId,
    damageBonusSourceId: first.damageBonusSourceId,
    consumeSlots: first.consumeSlots ?? false,
    queueKind: "aoe",
  });

  const requested = requestRoll(
    queuedState,
    newState.units[first.attackerId].owner,
    "attack_attackerRoll",
    ctx,
    first.attackerId
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}
