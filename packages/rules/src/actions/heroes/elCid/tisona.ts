import type { ApplyResult, Coord, GameAction, GameEvent, GameState, UnitState } from "../../../model";
import { isInsideBoard } from "../../../model";
import type { RNG } from "../../../rng";
import {
  ABILITY_EL_SID_COMPEADOR_TISONA,
  getAbilitySpec,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { requestRoll, evAbilityUsed, evAoeResolved } from "../../../core";
import { isElCid } from "../../shared";
import type { ElCidAoEContext } from "../../types";
import { collectLineTargets, isSameRowOrCol } from "./helpers";

interface LinePayload {
  target?: Coord;
}

export function applyElCidTisona(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (!isElCid(unit)) {
    return { state, events: [] };
  }
  if (!unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as LinePayload | undefined;
  const target = payload?.target;
  if (!target || !isInsideBoard(target, state.boardSize)) {
    return { state, events: [] };
  }
  if (!isSameRowOrCol(unit.position, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_EL_SID_COMPEADOR_TISONA);
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

  const affectedUnitIds = collectLineTargets(nextState, updatedUnit, target);
  const revealedUnitIds: string[] = [];

  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: updatedUnit.id,
        abilityId: spec.id,
        casterId: updatedUnit.id,
        center: { ...target },
        radius: 0,
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
      center: { ...target },
      radius: 0,
      affectedUnitIds,
      revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: ElCidAoEContext = {
    casterId: updatedUnit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = requestRoll(
    queuedState,
    updatedUnit.owner,
    "elCidTisona_attackerRoll",
    ctx,
    updatedUnit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}
