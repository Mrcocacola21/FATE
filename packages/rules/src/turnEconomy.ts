// packages/rules/src/turnEconomy.ts

import { TurnEconomy, TurnSlot, UnitState, makeEmptyTurnEconomy } from "./model";

export type TurnSlotCosts = Partial<Record<TurnSlot, boolean>>;

function actionTypeFromCosts(costs: TurnSlotCosts): "move" | "main" | "stealth" | null {
  if (costs.move) return "move";
  if (costs.stealth) return "stealth";
  if (costs.action || costs.attack) return "main";
  return null;
}

function getTurnEconomy(unit: UnitState): TurnEconomy {
  const base = unit.turn ?? makeEmptyTurnEconomy();
  return {
    moveUsed: base.moveUsed || (unit.hasMovedThisTurn ?? false),
    attackUsed: base.attackUsed || (unit.hasAttackedThisTurn ?? false),
    actionUsed: base.actionUsed || (unit.hasActedThisTurn ?? false),
    stealthUsed: base.stealthUsed || (unit.stealthAttemptedThisTurn ?? false),
  };
}

function getRiverBoatmanExtraMoves(unit: UnitState): number {
  return Math.max(0, Math.floor(unit.riverBoatmanExtraMoves ?? 0));
}

function isMoveOnlyCost(costs: TurnSlotCosts): boolean {
  return !!costs.move && !costs.attack && !costs.action && !costs.stealth;
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
  const isChicken = (unit.lokiChickenSources?.length ?? 0) > 0;
  if (isChicken && (costs.attack || costs.action || costs.stealth)) {
    return false;
  }
  if (costs.move && (unit.kaladinMoveLockSources?.length ?? 0) > 0) {
    return false;
  }
  if (costs.move && (unit.lokiMoveLockSources?.length ?? 0) > 0) {
    return false;
  }
  const restricted = unit.courtProceduralRestriction;
  const actionType = actionTypeFromCosts(costs);
  if (restricted?.spentType && actionType && restricted.spentType !== actionType) {
    return false;
  }
  const slotBlocked =
    (costs.move && turn.moveUsed) ||
    (costs.attack && turn.attackUsed) ||
    (costs.action && turn.actionUsed) ||
    (costs.stealth && turn.stealthUsed);
  if (slotBlocked && isMoveOnlyCost(costs) && getRiverBoatmanExtraMoves(unit) > 0) {
    return true;
  }
  const extra = unit.courtExtraFlexibleAction;
  if (slotBlocked && extra && !extra.used && actionType) {
    const blockedByOnlySpentSlot =
      (costs.move && turn.moveUsed && !costs.attack && !costs.action && !costs.stealth) ||
      (costs.stealth && turn.stealthUsed && !costs.move && !costs.attack && !costs.action) ||
      ((costs.action || costs.attack) && turn.actionUsed);
    if (blockedByOnlySpentSlot) return true;
  }
  if (slotBlocked) return false;
  return true;
}

export function spendSlots(
  unit: UnitState,
  costs: TurnSlotCosts | undefined
): UnitState {
  if (!costs) return setTurnEconomy(unit, getTurnEconomy(unit));
  const before = getTurnEconomy(unit);
  const actionType = actionTypeFromCosts(costs);
  const turn = { ...getTurnEconomy(unit) };
  let extra = unit.courtExtraFlexibleAction;
  const shouldUseRiverExtraMove =
    isMoveOnlyCost(costs) &&
    before.moveUsed &&
    getRiverBoatmanExtraMoves(unit) > 0;
  const shouldUseExtra =
    !!extra &&
    !extra.used &&
    actionType &&
    !shouldUseRiverExtraMove &&
    ((costs.move && before.moveUsed) ||
      (costs.stealth && before.stealthUsed) ||
      ((costs.action || costs.attack) && before.actionUsed));
  if (costs.move) turn.moveUsed = true;
  if (costs.attack) turn.attackUsed = true;
  if (costs.action) turn.actionUsed = true;
  if (costs.stealth) turn.stealthUsed = true;
  let updated = setTurnEconomy(unit, turn);
  if (shouldUseExtra && extra) {
    updated = {
      ...updated,
      courtExtraFlexibleAction: { ...extra, used: true },
    };
  }
  if (shouldUseRiverExtraMove) {
    updated = {
      ...updated,
      riverBoatmanExtraMoves: getRiverBoatmanExtraMoves(unit) - 1,
    };
  }
  if (unit.courtProceduralRestriction && actionType) {
    updated = {
      ...updated,
      courtProceduralRestriction: {
        ...unit.courtProceduralRestriction,
        spentType: unit.courtProceduralRestriction.spentType ?? actionType,
      },
    };
  }
  return updated;
}

export function resetTurnEconomy(unit: UnitState): UnitState {
  return {
    ...setTurnEconomy(unit, makeEmptyTurnEconomy()),
    riverBoatmanExtraMoves: 0,
    riverBoatmanMovePending: false,
    riverBoatCarryAllyId: undefined,
  };
}
