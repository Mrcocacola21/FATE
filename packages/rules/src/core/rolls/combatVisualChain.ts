import type {
  CombatChainSource,
  CombatResolutionChain,
  GameEvent,
  GameState,
  RollKind,
} from "../../model";

function contextString(context: Record<string, unknown>, key: string): string {
  return typeof context[key] === "string" ? context[key] : "";
}

function inferSource(
  state: GameState,
  kind: RollKind,
  context: Record<string, unknown>,
): CombatChainSource | null {
  const queueKind = contextString(context, "queueKind");
  const abilityId =
    contextString(context, "sourceAbilityId") || contextString(context, "abilityId");

  if (queueKind === "riderPath" || kind.startsWith("riderPathAttack_")) {
    return "riderPass";
  }
  if (kind.startsWith("elCid") || context.elCidDuelist) {
    return "elCidUltimate";
  }
  if (abilityId === "jackRipperDismemberment") {
    return "jackRipperUltimate";
  }
  if (context.controllerPlayerId) {
    return "controlledAttack";
  }
  if (queueKind === "aoe" || state.pendingAoE || Array.isArray(context.targetsQueue)) {
    return "aoe";
  }
  if (state.pendingCombatQueue.length > 1 || context.jebeKhansShooter || context.tyrant) {
    return "multiAttack";
  }
  return null;
}

function estimatePendingRolls(state: GameState, context: Record<string, unknown>): number {
  if (state.pendingCombatQueue.length > 0) {
    return state.pendingCombatQueue.length;
  }
  if (Array.isArray(context.targetsQueue)) {
    const index = typeof context.currentTargetIndex === "number" ? context.currentTargetIndex : 0;
    return Math.max(1, context.targetsQueue.length - index);
  }
  const shooter = context.jebeKhansShooter as { remainingAttacks?: unknown } | undefined;
  if (typeof shooter?.remainingAttacks === "number") {
    return Math.max(1, shooter.remainingAttacks);
  }
  return 1;
}

export function getOrCreateCombatResolutionChain(params: {
  state: GameState;
  kind: RollKind;
  context: Record<string, unknown>;
  nextRollCounter: number;
}): CombatResolutionChain | null {
  const { state, kind, context, nextRollCounter } = params;
  const remaining = estimatePendingRolls(state, context);
  if (state.combatResolutionChain) {
    return {
      ...state.combatResolutionChain,
      pendingRollsRemaining: remaining,
      isComplete: false,
    };
  }
  const source = inferSource(state, kind, context);
  if (!source) return null;
  return {
    chainId: `combat-chain-${nextRollCounter}`,
    source,
    pendingRollsRemaining: remaining,
    isComplete: false,
  };
}

function withDeferredMetadata(event: GameEvent, chain: CombatResolutionChain): GameEvent {
  if (event.type === "combatVisualBatchReady") return event;
  return {
    ...event,
    chainId: chain.chainId,
    visualBatchId: chain.chainId,
    deferVisuals: true,
    isChainComplete: false,
  } as GameEvent;
}

function chainHasPendingResolution(state: GameState): boolean {
  return (
    state.pendingRoll !== null || state.pendingAoE !== null || state.pendingCombatQueue.length > 0
  );
}

/**
 * Applies one authoritative visual boundary after every full rules action,
 * including post-action death/reaction hooks.
 */
export function finalizeCombatVisualChain(
  state: GameState,
  events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
  const chain = state.combatResolutionChain;
  if (!chain) return { state, events };

  const deferredEvents = events.map((event) => withDeferredMetadata(event, chain));
  if (chainHasPendingResolution(state)) {
    return {
      state,
      events: deferredEvents,
    };
  }

  return {
    state: {
      ...state,
      combatResolutionChain: null,
    },
    events: [
      ...deferredEvents,
      {
        type: "combatVisualBatchReady",
        chainId: chain.chainId,
        visualBatchId: chain.chainId,
        isChainComplete: true,
        deferVisuals: false,
      },
    ],
  };
}
