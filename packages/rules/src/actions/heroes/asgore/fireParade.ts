import type { ApplyResult, GameEvent, GameState, UnitState } from "../../../model";
import { resolveAoE } from "../../../aoe";
import {
  ABILITY_ASGORE_FIRE_PARADE,
  TRICKSTER_AOE_RADIUS,
  getAbilitySpec,
} from "../../../abilities";
import { requestRoll, evAoeResolved } from "../../../core";
import { commitAbilityCost } from "../../abilityCosts";
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

  const committed = commitAbilityCost(state, unit.id, spec.id);
  if (!committed.ok) return { state, events: [] };

  const updatedUnit = committed.unit;
  let nextState: GameState = committed.state;
  const events: GameEvent[] = [...committed.events];
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
