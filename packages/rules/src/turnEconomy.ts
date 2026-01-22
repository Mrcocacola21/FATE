// packages/rules/src/turnEconomy.ts

import { TurnEconomy, TurnSlot, UnitState, makeEmptyTurnEconomy } from "./model";

export type TurnSlotCosts = Partial<Record<TurnSlot, boolean>>;

function getTurnEconomy(unit: UnitState): TurnEconomy {
  const base = unit.turn ?? makeEmptyTurnEconomy();
  return {
    moveUsed: base.moveUsed || (unit.hasMovedThisTurn ?? false),
    attackUsed: base.attackUsed || (unit.hasAttackedThisTurn ?? false),
    actionUsed: base.actionUsed || (unit.hasActedThisTurn ?? false),
    stealthUsed: base.stealthUsed || (unit.stealthAttemptedThisTurn ?? false),
  };
}

export function setTurnEconomy(unit: UnitState, turn: TurnEconomy): UnitState {
  return {
    ...unit,
    turn,
    hasMovedThisTurn: turn.moveUsed,
    hasAttackedThisTurn: turn.attackUsed,
    hasActedThisTurn: turn.actionUsed,
    stealthAttemptedThisTurn: turn.stealthUsed,
  };
}

export function canSpendSlots(
  unit: UnitState,
  costs: TurnSlotCosts | undefined
): boolean {
  if (!costs) return true;
  const turn = getTurnEconomy(unit);
  if (costs.move && turn.moveUsed) return false;
  if (costs.attack && turn.attackUsed) return false;
  if (costs.action && turn.actionUsed) return false;
  if (costs.stealth && turn.stealthUsed) return false;
  return true;
}

export function spendSlots(
  unit: UnitState,
  costs: TurnSlotCosts | undefined
): UnitState {
  if (!costs) return setTurnEconomy(unit, getTurnEconomy(unit));
  const turn = { ...getTurnEconomy(unit) };
  if (costs.move) turn.moveUsed = true;
  if (costs.attack) turn.attackUsed = true;
  if (costs.action) turn.actionUsed = true;
  if (costs.stealth) turn.stealthUsed = true;
  return setTurnEconomy(unit, turn);
}

export function resetTurnEconomy(unit: UnitState): UnitState {
  return setTurnEconomy(unit, makeEmptyTurnEconomy());
}
