import type { ApplyResult, GameAction, GameState, UnitState } from "../../../model";
import {
  ABILITY_GUTS_ARBALET,
  ABILITY_GUTS_CANNON,
  getAbilitySpec,
} from "../../../abilities";
import { commitAbilityCost } from "../../abilityCosts";
import { canUseArcherLikeAttack, isGuts, requestGutsRangedAttack } from "./helpers";
import type { TargetPayload } from "./types";

export function applyGutsArbalet(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isGuts(unit) || !unit.position) {
    return { state, events: [] };
  }
  const payload = action.payload as TargetPayload | undefined;
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
  if (!canUseArcherLikeAttack(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_GUTS_ARBALET);
  if (!spec) {
    return { state, events: [] };
  }
  const committed = commitAbilityCost(state, unit.id, spec.id);
  if (!committed.ok) return { state, events: [] };

  const requested = requestGutsRangedAttack(committed.state, committed.unit, targetId, {
    damageOverride: 1,
    ignoreBonuses: true,
  });
  return { state: requested.state, events: [...committed.events, ...requested.events] };
}

export function applyGutsCannon(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isGuts(unit) || !unit.position) {
    return { state, events: [] };
  }
  const payload = action.payload as TargetPayload | undefined;
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
  if (!canUseArcherLikeAttack(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_GUTS_CANNON);
  if (!spec) {
    return { state, events: [] };
  }
  const committed = commitAbilityCost(state, unit.id, spec.id);
  if (!committed.ok) return { state, events: [] };

  const requested = requestGutsRangedAttack(
    committed.state,
    committed.unit,
    targetId
  );
  return { state: requested.state, events: [...committed.events, ...requested.events] };
}
