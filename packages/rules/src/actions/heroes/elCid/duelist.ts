import type { ApplyResult, GameAction, GameEvent, GameState, UnitState } from "../../../model";
import { canAttackTarget } from "../../../combat";
import {
  ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
  getAbilitySpec,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { requestRoll, evAbilityUsed, makeAttackContext } from "../../../core";
import { isElCid } from "../../shared";

interface DuelistPayload {
  targetId?: string;
}

export function applyElCidDemonDuelist(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isElCid(unit)) {
    return { state, events: [] };
  }
  if (!unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as DuelistPayload | undefined;
  const targetId = payload?.targetId;
  if (!targetId) {
    return { state, events: [] };
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }

  if (target.owner === unit.owner) {
    return { state, events: [] };
  }

  if (!canAttackTarget(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(spent.unit, costs);

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  const ctx = {
    ...makeAttackContext({
      attackerId: updatedUnit.id,
      defenderId: targetId,
      consumeSlots: false,
      queueKind: "normal",
    }),
    elCidDuelist: {
      attackerId: updatedUnit.id,
      targetId,
    },
  };

  const requested = requestRoll(
    nextState,
    updatedUnit.owner,
    "attack_attackerRoll",
    ctx,
    updatedUnit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}
