import type { ApplyResult, GameState, PendingRoll, ResolveRollChoice } from "../../../../model";
import { canSpendSlots, spendSlots } from "../../../../turnEconomy";
import {
  canCommitAbilityCost,
  commitAbilityCost,
} from "../../../../actions/abilityCosts";
import { ABILITY_LOKI_LAUGHT } from "../../../../abilities";
import { clearPendingRoll, requestRoll, makeAttackContext } from "../../../../core";
import { canControlledAttackTarget } from "../../../../actions/controlledAttack";
import type {
  LokiChickenTargetChoiceContext,
  LokiMindControlEnemyChoiceContext,
  LokiMindControlTargetChoiceContext,
} from "../../../types";
import {
  getLokiChickenTargetIds,
  getLokiForcedAttackTargetIds,
  isLokiChicken,
} from "../../../../actions/heroes/loki";
import {
  COST_CHICKEN,
  COST_MIND_CONTROL,
  getLokiUnit,
} from "./helpers";

export function resolveLokiChickenTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as LokiChickenTargetChoiceContext;
  if (!ctx.lokiId || !getLokiUnit(state, ctx.lokiId)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== "lokiChickenTarget" || !payload.targetId) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  const currentOptions = getLokiChickenTargetIds(state, ctx.lokiId);
  if (!options.includes(payload.targetId) || !currentOptions.includes(payload.targetId)) {
    return { state, events: [] };
  }

  const target = state.units[payload.targetId];
  if (!target || !target.isAlive || target.owner === state.units[ctx.lokiId]?.owner) {
    return { state, events: [] };
  }

  const loki = getLokiUnit(state, ctx.lokiId);
  if (
    !loki ||
    !canCommitAbilityCost(state, loki.id, ABILITY_LOKI_LAUGHT, {
      costs: { action: true },
      chargeAmount: COST_CHICKEN,
    })
  ) {
    return { state, events: [] };
  }
  const committed = commitAbilityCost(state, loki.id, ABILITY_LOKI_LAUGHT, {
    costs: { action: true },
    chargeAmount: COST_CHICKEN,
  });
  if (!committed.ok) {
    return { state, events: [] };
  }

  const requested = requestRoll(
    clearPendingRoll(committed.state),
    loki.owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: loki.id,
      defenderId: target.id,
      ignoreRange: true,
      damageOverride: 0,
      ignoreBonuses: true,
      preserveAttackerStealth: true,
      sourceAbilityId: ABILITY_LOKI_LAUGHT,
      lokiStatusOnHit: "chicken",
      lokiStatusSourceId: loki.id,
      consumeSlots: false,
      queueKind: "normal",
    }),
    loki.id
  );
  return {
    state: requested.state,
    events: [...committed.events, ...requested.events],
  };
}

export function resolveLokiMindControlEnemyChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as LokiMindControlEnemyChoiceContext;
  if (!ctx.lokiId || !getLokiUnit(state, ctx.lokiId)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== "lokiMindControlEnemy" || !payload.targetId) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(payload.targetId)) {
    return { state, events: [] };
  }

  const controlled = state.units[payload.targetId];
  if (!controlled || !controlled.isAlive || !controlled.position) {
    return { state, events: [] };
  }

  const loki = getLokiUnit(state, ctx.lokiId);
  if (!loki) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targetOptions = getLokiForcedAttackTargetIds(
    state,
    controlled.id,
    loki.owner
  );
  if (targetOptions.length === 0) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const requested = requestRoll(
    clearPendingRoll(state),
    pending.player,
    "lokiMindControlTargetChoice",
    {
      lokiId: ctx.lokiId,
      controlledUnitId: controlled.id,
      options: targetOptions,
    } satisfies LokiMindControlTargetChoiceContext,
    controlled.id
  );
  return { state: requested.state, events: requested.events };
}

export function resolveLokiMindControlTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as LokiMindControlTargetChoiceContext;
  if (!ctx.lokiId || !getLokiUnit(state, ctx.lokiId)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const controlled = state.units[ctx.controlledUnitId];
  if (
    !controlled ||
    !controlled.isAlive ||
    !controlled.position ||
    isLokiChicken(controlled)
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (!canSpendSlots(controlled, { attack: true, action: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== "lokiMindControlTarget" || !payload.targetId) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(payload.targetId)) {
    return { state, events: [] };
  }

  const loki = getLokiUnit(state, ctx.lokiId);
  if (
    !loki ||
    !canCommitAbilityCost(state, loki.id, ABILITY_LOKI_LAUGHT, {
      costs: { action: true },
      chargeAmount: COST_MIND_CONTROL,
    })
  ) {
    return { state, events: [] };
  }
  const committed = commitAbilityCost(state, loki.id, ABILITY_LOKI_LAUGHT, {
    costs: { action: true },
    chargeAmount: COST_MIND_CONTROL,
  });
  if (!committed.ok) {
    return { state, events: [] };
  }
  if (
    !canControlledAttackTarget(
      state,
      controlled.id,
      loki.owner,
      payload.targetId
    )
  ) {
    return { state, events: [] };
  }
  const updatedControlled = spendSlots(controlled, { attack: true, action: true });
  const updatedState: GameState = {
    ...clearPendingRoll(committed.state),
    units: {
      ...committed.state.units,
      [updatedControlled.id]: updatedControlled,
    },
  };

  const requested = requestRoll(
    updatedState,
    loki.owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: updatedControlled.id,
      defenderId: payload.targetId,
      allowFriendlyTarget: true,
      controllerPlayerId: loki.owner,
      consumeSlots: false,
      queueKind: "normal",
    }),
    updatedControlled.id
  );

  return {
    state: requested.state,
    events: [
      ...committed.events,
      {
        type: "controlledAttackDeclared" as const,
        controllerUnitId: loki.id,
        controlledUnitId: controlled.id,
        targetId: payload.targetId,
        abilityId: ABILITY_LOKI_LAUGHT,
      },
      ...requested.events,
    ],
  };
}
