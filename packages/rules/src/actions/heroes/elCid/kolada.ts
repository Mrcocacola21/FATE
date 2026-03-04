import type { ApplyResult, GameEvent, GameState } from "../../../model";
import type { RNG } from "../../../rng";
import { resolveAoE } from "../../../aoe";
import {
  ABILITY_EL_SID_COMPEADOR_KOLADA,
  getCharges,
  spendCharges,
} from "../../../abilities";
import { requestRoll, evAbilityUsed, evAoeResolved } from "../../../core";
import { isElCid } from "../../shared";
import type { ElCidAoEContext } from "../../types";
import { collectRadiusTargets } from "./helpers";

export function maybeTriggerElCidKolada(
  state: GameState,
  unitId: string,
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  const center = unit.position;
  if (!isElCid(unit)) {
    return { state, events: [] };
  }

  const charges = getCharges(unit, ABILITY_EL_SID_COMPEADOR_KOLADA);
  if (charges < 3) {
    return { state, events: [] };
  }

  const spent = spendCharges(unit, ABILITY_EL_SID_COMPEADOR_KOLADA, 3);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit = spent.unit;
  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_EL_SID_COMPEADOR_KOLADA }),
  ];

  const aoeRes = resolveAoE(
    nextState,
    updatedUnit.id,
    center,
    {
      radius: 1,
      shape: "chebyshev",
      revealHidden: false,
      targetFilter: (u, caster) => u.id !== caster.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_KOLADA,
      emitEvent: false,
    },
    rng
  );

  nextState = aoeRes.nextState;
  if (aoeRes.events.length > 0) {
    events.push(...aoeRes.events);
  }

  const affectedUnitIds =
    aoeRes.affectedUnitIds.length > 0
      ? aoeRes.affectedUnitIds
      : collectRadiusTargets(nextState, updatedUnit);

  const revealedUnitIds = aoeRes.revealedUnitIds ?? [];

  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: updatedUnit.id,
        abilityId: ABILITY_EL_SID_COMPEADOR_KOLADA,
        casterId: updatedUnit.id,
        center: { ...center },
        radius: 1,
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
      abilityId: ABILITY_EL_SID_COMPEADOR_KOLADA,
      center: { ...center },
      radius: 1,
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
    "elCidKolada_attackerRoll",
    ctx,
    updatedUnit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}
