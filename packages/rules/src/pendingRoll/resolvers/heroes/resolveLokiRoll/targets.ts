import type { ApplyResult, GameState, PendingRoll, ResolveRollChoice } from "../../../../model";
import { canSpendSlots, spendSlots } from "../../../../turnEconomy";
import { clearPendingRoll, requestRoll, makeAttackContext } from "../../../../core";
import type {
  LokiChickenTargetChoiceContext,
  LokiMindControlEnemyChoiceContext,
  LokiMindControlTargetChoiceContext,
} from "../../../types";
import {
  addLokiChicken,
  getLokiForcedAttackTargetIds,
  isLokiChicken,
} from "../../../../actions/heroes/loki";
import { getLokiUnit } from "./helpers";

export function resolveLokiChickenTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as LokiChickenTargetChoiceContext;
  if (!ctx.lokiId || !getLokiUnit(state, ctx.lokiId)) {
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
  if (!options.includes(payload.targetId)) {
    return { state, events: [] };
  }

  const target = state.units[payload.targetId];
  if (!target || !target.isAlive || target.owner === state.units[ctx.lokiId]?.owner) {
    return { state, events: [] };
  }

  const updatedTarget = addLokiChicken(target, ctx.lokiId);
  return {
    state: clearPendingRoll({
      ...state,
      units: {
        ...state.units,
        [updatedTarget.id]: updatedTarget,
      },
    }),
    events: [],
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

  const targetOptions = getLokiForcedAttackTargetIds(state, controlled.id);
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

  const updatedControlled = spendSlots(controlled, { attack: true, action: true });
  const updatedState: GameState = {
    ...clearPendingRoll(state),
    units: {
      ...state.units,
      [updatedControlled.id]: updatedControlled,
    },
  };

  const requested = requestRoll(
    updatedState,
    updatedControlled.owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: updatedControlled.id,
      defenderId: payload.targetId,
      allowFriendlyTarget: true,
      consumeSlots: false,
      queueKind: "normal",
    }),
    updatedControlled.id
  );

  return { state: requested.state, events: requested.events };
}
