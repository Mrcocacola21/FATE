import type { ApplyResult, Coord, GameAction, GameEvent, GameState, UnitState } from "../../../model";
import { isInsideBoard } from "../../../model";
import { coordsEqual, getUnitAt } from "../../../board";
import { ABILITY_GROZNY_INVADE_TIME, getAbilitySpec, spendCharges } from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { evAbilityUsed } from "../../../core";
import type { RNG } from "../../../rng";
import { isGrozny } from "./helpers";
import { applyGroznyFreeMove } from "./movement";

export function applyGroznyInvadeTime(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (!isGrozny(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as { to?: Coord; target?: Coord } | undefined;
  const dest = payload?.to ?? payload?.target;
  if (!dest || !isInsideBoard(dest, state.boardSize)) {
    return { state, events: [] };
  }
  if (coordsEqual(dest, unit.position)) {
    return { state, events: [] };
  }
  if (getUnitAt(state, dest)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_GROZNY_INVADE_TIME);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok || !spent.unit) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(spent.unit, costs);
  const baseState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const moved = applyGroznyFreeMove(baseState, updatedUnit, dest, rng);
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
    ...moved.events,
  ];

  return { state: moved.state, events };
}
