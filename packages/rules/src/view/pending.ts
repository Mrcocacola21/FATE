import { GameState, PlayerId, PlayerView } from "../model";
import { canPlayerKnowUnitExactPosition } from "../visibility";

const PENDING_COMBAT_QUEUE_KINDS = new Set<string>([
  "tricksterAoE_attackerRoll",
  "tricksterAoE_defenderRoll",
  "falseTrailExplosion_attackerRoll",
  "falseTrailExplosion_defenderRoll",
  "elCidTisona_attackerRoll",
  "elCidTisona_defenderRoll",
  "elCidKolada_attackerRoll",
  "elCidKolada_defenderRoll",
  "dora_attackerRoll",
  "dora_defenderRoll",
  "dora_berserkerDefenseChoice",
  "vladForest_attackerRoll",
  "vladForest_defenderRoll",
  "vladForest_berserkerDefenseChoice",
  "kaiserCarpetStrikeAttack",
  "carpetStrike_defenderRoll",
  "carpetStrike_berserkerDefenseChoice",
]);

type QueuePendingContext = {
  targetsQueue?: string[];
  currentTargetIndex?: number;
  queueKind?: "normal" | "riderPath" | "aoe";
};

function getQueuedTargetsRemaining(context: unknown): number {
  const ctx = context as QueuePendingContext;
  const total = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue.length : 0;
  const idx = typeof ctx.currentTargetIndex === "number" ? ctx.currentTargetIndex : 0;
  return Math.max(0, total - idx);
}

export function getPendingCombatQueueCount(
  pendingCombatQueue: GameState["pendingCombatQueue"],
  pendingRoll: GameState["pendingRoll"]
): number {
  const basePendingCount = pendingCombatQueue?.length ?? 0;
  if (basePendingCount !== 0 || !pendingRoll) {
    return basePendingCount;
  }

  const context = pendingRoll.context as QueuePendingContext;
  if (context.queueKind === "riderPath" || context.queueKind === "aoe") {
    return Math.max(1, getQueuedTargetsRemaining(context));
  }

  if (!PENDING_COMBAT_QUEUE_KINDS.has(pendingRoll.kind)) {
    return basePendingCount;
  }

  return getQueuedTargetsRemaining(context);
}

export function getVisiblePendingRollForPlayer(
  state: GameState,
  pendingRoll: GameState["pendingRoll"],
  playerId: PlayerId
): GameState["pendingRoll"] {
  if (!pendingRoll || pendingRoll.player !== playerId) return null;
  const context = { ...(pendingRoll.context ?? {}) } as Record<string, unknown>;
  const unitIdLists = [
    "targetsQueue",
    "targetIds",
    "affectedUnitIds",
    "chickenOptions",
    "mindControlEnemyOptions",
    "spinCandidateIds",
    "options",
    "legalTargetIds",
  ];
  for (const key of unitIdLists) {
    const value = context[key];
    if (!Array.isArray(value)) continue;
    context[key] = value.filter(
      (item) =>
        typeof item !== "string" ||
        !state.units[item] ||
        canPlayerKnowUnitExactPosition(state, playerId, item)
    );
  }
  return { ...pendingRoll, context };
}

export function buildPendingAoEPreview(
  pendingAoE: GameState["pendingAoE"]
): PlayerView["pendingAoEPreview"] {
  if (!pendingAoE || !pendingAoE.abilityId) return null;
  return {
    casterId: pendingAoE.casterId,
    abilityId: pendingAoE.abilityId,
    center: { ...pendingAoE.center },
    radius: pendingAoE.radius,
  };
}
