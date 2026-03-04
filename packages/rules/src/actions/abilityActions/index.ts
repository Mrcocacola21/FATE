import type { ApplyResult, GameAction, GameEvent, GameState, UnitState } from "../../model";
import { isInsideBoard } from "../../model";
import type { RNG } from "../../rng";
import {
  ABILITY_FALSE_TRAIL_EXPLOSION,
  ABILITY_TRICKSTER_AOE,
  getAbilitySpec,
  spendCharges,
} from "../../abilities";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { evAbilityUsed } from "../../core";
import { HERO_FALSE_TRAIL_TOKEN_ID, HERO_KALADIN_ID } from "../../heroes";
import { tryApplyDirectAbility } from "./directHandlers";
import { applyTricksterAoEAfterUse } from "./tricksterAoE";
import type { UseAbilityAction } from "./types";

function getAbilityUserOrNull(
  state: GameState,
  action: UseAbilityAction
): UnitState | null {
  if (state.phase !== "battle") {
    return null;
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return null;
  }
  if (
    unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID &&
    action.abilityId !== ABILITY_FALSE_TRAIL_EXPLOSION
  ) {
    return null;
  }
  if (unit.owner !== state.currentPlayer) {
    return null;
  }
  if (state.activeUnitId !== unit.id) {
    return null;
  }
  if ((unit.lokiChickenSources?.length ?? 0) > 0) {
    return null;
  }

  return unit;
}

export function applyUseAbility(
  state: GameState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  const unit = getAbilityUserOrNull(state, action);
  if (!unit) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(action.abilityId);
  if (!spec) {
    return { state, events: [] };
  }

  const directResult = tryApplyDirectAbility(state, unit, action, rng, spec.id);
  if (directResult) {
    return directResult;
  }

  const isTricksterAoE = spec.id === ABILITY_TRICKSTER_AOE;
  const aoeCenter = isTricksterAoE ? unit.position : null;
  if (isTricksterAoE) {
    if (unit.class !== "trickster" && unit.heroId !== HERO_KALADIN_ID) {
      return { state, events: [] };
    }
    if (!aoeCenter || !isInsideBoard(aoeCenter, state.boardSize)) {
      return { state, events: [] };
    }
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const { unit: afterCharges, ok } = spendCharges(unit, spec.id, chargeAmount);
  if (!ok || !afterCharges) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = spendSlots(afterCharges, costs);
  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  if (isTricksterAoE && aoeCenter) {
    const tricksterResult = applyTricksterAoEAfterUse(
      nextState,
      updatedUnit,
      aoeCenter,
      spec.id,
      rng
    );
    return {
      state: tricksterResult.state,
      events: [...events, ...tricksterResult.events],
    };
  }

  return { state: nextState, events };
}
