import { GameState, PendingRollContext, PlayerId, PlayerView } from "../model";
import { canPlayerKnowUnitExactPosition } from "../visibility";

const PENDING_COMBAT_QUEUE_KINDS = new Set<string>([
  "tricksterAoE_attackerRoll",
  "tricksterAoE_defenderRoll",
  "tricksterAoE_berserkerDefenseChoice",
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
  pendingRoll: GameState["pendingRoll"],
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
  playerId: PlayerId,
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
        canPlayerKnowUnitExactPosition(state, playerId, item),
    );
  }
  for (const key of ["defenderId", "targetId", "targetUnitId"]) {
    const value = context[key];
    if (
      typeof value === "string" &&
      state.units[value] &&
      !canPlayerKnowUnitExactPosition(state, playerId, value)
    ) {
      delete context[key];
    }
  }
  if (
    pendingRoll.kind === "papyrusBoneChoice" &&
    typeof context.targetUnitId === "string" &&
    state.units[context.targetUnitId] &&
    !canPlayerKnowUnitExactPosition(state, playerId, context.targetUnitId)
  ) {
    delete context.targetUnitId;
  }
  return {
    ...pendingRoll,
    context,
    presentation: projectPendingRollPresentation(state, pendingRoll.presentation, playerId),
  };
}

function replaceAllLiteral(value: string, search: string, replacement: string): string {
  return search ? value.split(search).join(replacement) : value;
}

/**
 * Project descriptive roll metadata independently from resolution context.
 * This is also used by the server's public waiting summary.
 */
export function projectPendingRollPresentation(
  state: GameState,
  presentation: PendingRollContext | undefined,
  playerId: PlayerId | null,
): PendingRollContext | undefined {
  if (!presentation) return undefined;
  const projected: PendingRollContext = { ...presentation };
  const fields = [
    {
      idKey: "actorUnitId" as const,
      nameKey: "actorName" as const,
      safeName: "Hidden unit",
    },
    {
      idKey: "sourceUnitId" as const,
      nameKey: "sourceName" as const,
      safeName: "Unknown source",
    },
    {
      idKey: "targetUnitId" as const,
      nameKey: "targetName" as const,
      safeName: "Unknown target",
    },
  ];
  let sourceWasRedacted = false;

  for (const field of fields) {
    const unitId = projected[field.idKey];
    if (!unitId || !state.units[unitId]) continue;
    const isVisible = playerId !== null && canPlayerKnowUnitExactPosition(state, playerId, unitId);
    if (isVisible) continue;
    const oldName = projected[field.nameKey];
    if (oldName) {
      projected.reason = replaceAllLiteral(projected.reason, oldName, field.safeName);
      if (projected.comparedAgainst) {
        projected.comparedAgainst = replaceAllLiteral(
          projected.comparedAgainst,
          oldName,
          field.safeName,
        );
      }
      if (projected.successText) {
        projected.successText = replaceAllLiteral(projected.successText, oldName, field.safeName);
      }
      if (projected.failureText) {
        projected.failureText = replaceAllLiteral(projected.failureText, oldName, field.safeName);
      }
    }
    delete projected[field.idKey];
    projected[field.nameKey] = field.safeName;
    if (field.idKey === "sourceUnitId") sourceWasRedacted = true;
  }

  if (sourceWasRedacted) {
    delete projected.abilityId;
    delete projected.abilityName;
  }

  return projected;
}

export function buildPendingAoEPreview(
  pendingAoE: GameState["pendingAoE"],
): PlayerView["pendingAoEPreview"] {
  if (!pendingAoE || !pendingAoE.abilityId) return null;
  return {
    casterId: pendingAoE.casterId,
    abilityId: pendingAoE.abilityId,
    center: { ...pendingAoE.center },
    radius: pendingAoE.radius,
  };
}
