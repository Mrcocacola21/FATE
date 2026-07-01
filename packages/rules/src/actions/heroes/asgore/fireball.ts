import type { ApplyResult, GameAction, GameState, UnitState } from "../../../model";
import {
  ABILITY_ASGORE_FIREBALL,
  getAbilitySpec,
} from "../../../abilities";
import { canDirectlyTargetUnit } from "../../../visibility";
import { makeAttackContext, requestRoll } from "../../../core";
import { commitAbilityCost } from "../../abilityCosts";
import { canUseAsClassAttack, isAsgore } from "./helpers";

interface FireballPayload {
  targetId?: string;
}

function requestAsgoreClassAttack(
  state: GameState,
  unit: UnitState,
  targetId: string
): ApplyResult {
  const ctx = makeAttackContext({
    attackerId: unit.id,
    defenderId: targetId,
    ignoreRange: true,
    consumeSlots: false,
    queueKind: "normal",
  });
  const requested = requestRoll(
    state,
    unit.owner,
    "attack_attackerRoll",
    ctx,
    unit.id
  );
  return requested;
}

export function applyAsgoreFireball(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isAsgore(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as FireballPayload | undefined;
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
  if (!canDirectlyTargetUnit(state, unit.id, target.id)) {
    return { state, events: [] };
  }
  if (!canUseAsClassAttack(state, unit, target, "archer")) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_ASGORE_FIREBALL);
  if (!spec) {
    return { state, events: [] };
  }

  const committed = commitAbilityCost(state, unit.id, spec.id);
  if (!committed.ok) return { state, events: [] };

  const requested = requestAsgoreClassAttack(
    committed.state,
    committed.unit,
    targetId
  );
  return { state: requested.state, events: [...committed.events, ...requested.events] };
}
