import type { GameState, PlayerId, UnitState } from "../model";
import { canAttackTarget } from "../combat";
import {
  canDirectlyTargetUnit,
  canPlayerKnowUnitExactPosition,
} from "../visibility";
import { canSpendSlots } from "../turnEconomy";

export function canControlledAttackTarget(
  state: GameState,
  controlledUnitId: string,
  controllerPlayerId: PlayerId,
  targetId: string,
  options: { requireSlots?: boolean } = {}
): boolean {
  const controlled = state.units[controlledUnitId];
  const target = state.units[targetId];
  if (!controlled || !target) return false;
  if (!controlled.isAlive || !target.isAlive) return false;
  if (!controlled.position || !target.position) return false;
  if (controlled.id === target.id) return false;
  if (controlled.owner === controllerPlayerId) return false;
  if (target.owner !== controlled.owner) return false;
  if (!canPlayerKnowUnitExactPosition(state, controllerPlayerId, target.id)) {
    return false;
  }
  if (options.requireSlots !== false) {
    if (!canSpendSlots(controlled, { attack: true, action: true })) {
      return false;
    }
  }
  if (!canDirectlyTargetUnit(state, controlled.id, target.id)) return false;
  return canAttackTarget(state, controlled as UnitState, target as UnitState, {
    allowFriendlyTarget: true,
  });
}

export function getControlledAttackTargetIds(
  state: GameState,
  controlledUnitId: string,
  controllerPlayerId: PlayerId,
  options: { requireSlots?: boolean } = {}
): string[] {
  return Object.values(state.units)
    .filter((target) =>
      canControlledAttackTarget(
        state,
        controlledUnitId,
        controllerPlayerId,
        target.id,
        options
      )
    )
    .map((target) => target.id)
    .sort();
}
