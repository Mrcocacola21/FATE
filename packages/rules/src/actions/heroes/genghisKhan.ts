import type { ApplyResult, GameEvent, GameState, PendingMove, UnitState } from "../../model";
import { isInsideBoard } from "../../model";
import { addCoord, DIAG_DIRS, ORTHO_DIRS } from "../../board";
import { canUnitEnterCell } from "../../visibility";
import {
  ABILITY_GENGHIS_KHAN_KHANS_DECREE,
  ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
  getAbilitySpec,
  spendCharges,
} from "../../abilities";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { getLegalMovesForUnitModes } from "../../movement";
import { evAbilityUsed, evMoveOptionsGenerated } from "../utils/events";

function buildLineMoves(state: GameState, unit: UnitState, dirs: { col: number; row: number }[]) {
  const res: { col: number; row: number }[] = [];
  if (!unit.position) return res;
  for (const dir of dirs) {
    let cur = addCoord(unit.position, dir);
    while (isInsideBoard(cur, state.boardSize)) {
      if (canUnitEnterCell(state, unit.id, cur)) {
        res.push(cur);
      }
      cur = addCoord(cur, dir);
    }
  }
  return res;
}

export function getMongolChargeMoves(
  state: GameState,
  unit: UnitState
): { col: number; row: number }[] {
  if (!unit.position) return [];
  return [
    ...buildLineMoves(state, unit, ORTHO_DIRS),
    ...buildLineMoves(state, unit, DIAG_DIRS),
  ];
}

export function applyKhansDecree(state: GameState, unit: UnitState): ApplyResult {
  const spec = getAbilitySpec(ABILITY_GENGHIS_KHAN_KHANS_DECREE);
  if (!spec) {
    return { state, events: [] };
  }

  const requiresMove = spec.actionCost?.consumes?.move === true;
  if (requiresMove && !canSpendSlots(unit, { move: true })) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const { unit: afterCharges, ok } = spendCharges(unit, spec.id, chargeAmount);
  if (!ok) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = {
    ...afterCharges,
    genghisKhanDiagonalMoveActive: true,
    genghisKhanDecreeMovePending: true,
  };

  const updatedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const legalTo = getLegalMovesForUnitModes(updatedState, updatedUnit.id, [
    updatedUnit.class,
  ]);
  const pendingMove: PendingMove = {
    unitId: updatedUnit.id,
    roll: undefined,
    legalTo,
    expiresTurnNumber: state.turnNumber,
    mode: "normal",
  };

  const nextState: GameState = {
    ...updatedState,
    pendingMove,
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
    evMoveOptionsGenerated({
      unitId: updatedUnit.id,
      roll: undefined,
      legalTo,
      mode: "normal",
    }),
  ];

  return { state: nextState, events };
}

export function applyMongolCharge(state: GameState, unit: UnitState): ApplyResult {
  const spec = getAbilitySpec(ABILITY_GENGHIS_KHAN_MONGOL_CHARGE);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const { unit: afterCharges, ok } = spendCharges(unit, spec.id, chargeAmount);
  if (!ok) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = {
    ...spendSlots(afterCharges, costs),
    genghisKhanMongolChargeActive: true,
  };

  const legalTo = getMongolChargeMoves(state, updatedUnit);
  const pendingMove: PendingMove = {
    unitId: updatedUnit.id,
    roll: undefined,
    legalTo,
    expiresTurnNumber: state.turnNumber,
    mode: "normal",
  };

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
    pendingMove,
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
    evMoveOptionsGenerated({
      unitId: updatedUnit.id,
      roll: undefined,
      legalTo,
      mode: "normal",
    }),
  ];

  return { state: nextState, events };
}
