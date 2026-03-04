import type { ApplyResult, GameEvent, GameState, UnitState } from "../../../model";
import { resolveAoE } from "../../../aoe";
import {
  ABILITY_ASGORE_FIRE_PARADE,
  TRICKSTER_AOE_RADIUS,
  getAbilitySpec,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { requestRoll, evAbilityUsed, evAoeResolved } from "../../../core";
import type { TricksterAoEContext } from "../../../pendingRoll/types";
import { isAsgore } from "./helpers";

export function applyAsgoreFireParade(
  state: GameState,
  unit: UnitState,
  rng: { next: () => number }
): ApplyResult {
  if (!isAsgore(unit) || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_ASGORE_FIRE_PARADE);
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
  const center = updatedUnit.position;
  if (!center) {
    return { state: nextState, events };
  }

  const aoeRes = resolveAoE(
    nextState,
    updatedUnit.id,
    center,
    {
      radius: TRICKSTER_AOE_RADIUS,
      shape: "chebyshev",
      revealHidden: true,
      targetFilter: (target, caster) => target.id !== caster.id,
      abilityId: spec.id,
      emitEvent: false,
    },
    rng
  );
  nextState = aoeRes.nextState;
  events.push(...aoeRes.events);

  const affectedUnitIds = aoeRes.affectedUnitIds;
  const revealedUnitIds = aoeRes.revealedUnitIds;
  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: updatedUnit.id,
        abilityId: spec.id,
        casterId: updatedUnit.id,
        center: { ...center },
        radius: TRICKSTER_AOE_RADIUS,
        affectedUnitIds,
        revealedUnitIds,
        damagedUnitIds: [],
        damageByUnitId: {},
      })
    );
    return { state: nextState, events };
  }

  const queuedState: GameState = {
    ...nextState,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: updatedUnit.id,
      abilityId: spec.id,
      center: { ...center },
      radius: TRICKSTER_AOE_RADIUS,
      affectedUnitIds,
      revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };
  const ctx: TricksterAoEContext = {
    casterId: updatedUnit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };
  const requested = requestRoll(
    queuedState,
    updatedUnit.owner,
    "tricksterAoE_attackerRoll",
    ctx,
    updatedUnit.id
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}
