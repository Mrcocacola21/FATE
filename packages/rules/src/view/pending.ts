import { GameState, PendingRollContext, PlayerId, PlayerView } from "../model";
import { canPlayerKnowUnitExactPosition } from "../visibility";
import type { OpponentPendingPresentation, PendingDecisionView, UnitState } from "../model";
import { HERO_VLAD_TEPES_ID } from "../heroes";

const OPPONENT_PRESENTATIONS: Record<
  OpponentPendingPresentation["key"],
  OpponentPendingPresentation
> = {
  reaction: {
    key: "reaction",
    title: "Reaction opportunity",
    message: "Opponent is deciding whether to make a reaction attack.",
  },
  generic: {
    key: "generic",
    title: "Opponent is making a decision",
    message: "Waiting for your opponent to finish resolving an ability.",
  },
  hidden: {
    key: "hidden",
    title: "Opponent is making a decision",
    message: "Your opponent is resolving a hidden battlefield effect.",
    hiddenInformation: true,
  },
  vladStakes: {
    key: "vladStakes",
    title: "Vlad is preparing the battlefield",
    message:
      "Your opponent is placing hidden stakes. Their locations will remain unknown until revealed.",
    abilityName: "Field of Stakes",
    hiddenInformation: true,
  },
  jackSnares: {
    key: "jackSnares",
    title: "Jack is preparing traps",
    message: "Your opponent is placing hidden snares. Their locations are secret.",
    abilityName: "Snares",
    hiddenInformation: true,
  },
  hassanStealth: {
    key: "hassanStealth",
    title: "Hassan is using an ability",
    message: "Your opponent is choosing targets for a stealth effect.",
    abilityName: "Assassin Order",
    hiddenInformation: true,
  },
};

/** Allowlisted status metadata only. Never spread a pending roll or its context here. */
export function projectPendingDecision(
  state: GameState,
  viewer: PlayerId | "spectator",
): PendingDecisionView | null {
  const pending = state.pendingRoll;
  if (!pending) return null;
  if (pending.player === viewer) {
    return {
      type: "pendingDecision",
      ownerPlayerId: pending.player,
      viewerCanRespond: true,
      decisionType: pending.kind,
    };
  }

  let key: OpponentPendingPresentation["key"] = "generic";
  let source: UnitState | undefined;
  if (pending.kind === "reactionChoice") key = "reaction";
  if (pending.kind === "vladPlaceStakes") {
    key = "vladStakes";
    source = Object.values(state.units).find(
      (unit) => unit.owner === pending.player && unit.isAlive && unit.heroId === HERO_VLAD_TEPES_ID,
    );
  } else if (pending.kind === "hassanAssassinOrderSelection") {
    key = "hassanStealth";
    source = state.units[String(pending.context.hassanId ?? "")];
  } else if (
    pending.kind === "chargedImpulseTargetChoice" &&
    pending.context.abilityId === "jackRipperSnares"
  ) {
    key = "jackSnares";
    source = state.units[String(pending.context.unitId ?? "")];
  }
  if (
    key !== "generic" && key !== "reaction" &&
    (!source ||
      (viewer === "spectator"
        ? source.isStealthed
        : !canPlayerKnowUnitExactPosition(state, viewer, source.id)))
  ) {
    key = "hidden";
  }
  return {
    type: "opponentResolvingDecision",
    ownerPlayerId: pending.player,
    viewerCanRespond: false,
    opponentStatus: { ...OPPONENT_PRESENTATIONS[key] },
  };
}

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
  delete context.resumePendingRoll;
  const unitIdLists = [
    "targetsQueue",
    "targetIds",
    "targetUnitIds",
    "affectedUnitIds",
    "chickenOptions",
    "mindControlEnemyOptions",
    "spinCandidateIds",
    "options",
    "legalTargetIds",
    "candidateIds",
    "eligibleUnitIds",
    "selectedIds",
    "damagedUnitIds",
    "revealedUnitIds",
  ];
  for (const key of unitIdLists) {
    if (pendingRoll.kind === "selectLastAttackTarget" && key === "legalTargetIds") continue;
    const value = context[key];
    if (!Array.isArray(value)) continue;
    const isAuthorized = (item: unknown) =>
      typeof item !== "string" || !state.units[item] ||
      canPlayerKnowUnitExactPosition(state, playerId, item);
    if (key === "targetsQueue" && typeof context.currentTargetIndex === "number") {
      context.currentTargetIndex = value.slice(0, context.currentTargetIndex).filter(isAuthorized).length;
    }
    context[key] = value.filter(isAuthorized);
  }
  for (const key of ["damageByUnitId", "rollsByUnitId"]) {
    const value = context[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    context[key] = Object.fromEntries(Object.entries(value).filter(([unitId]) =>
      canPlayerKnowUnitExactPosition(state, playerId, unitId),
    ));
  }
  for (const key of [
    "defenderId", "targetId", "targetUnitId", "attackerId", "actorUnitId",
    "sourceUnitId", "casterId", "forcedAttackerId", "passengerId", "riverId",
  ]) {
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
  const { chainSource: _chainSource, pendingRollsRemaining: _pendingRollsRemaining, ...visibleRoll } = pendingRoll;
  return {
    ...visibleRoll,
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
  const textFields = ["title", "reason", "diceLabel", "successRule", "successText", "failureText", "comparedAgainst"] as const;
  const scrubText = (secret: string, replacement: string) => {
    for (const key of textFields) {
      const value = projected[key];
      if (value) projected[key] = replaceAllLiteral(value, secret, replacement);
    }
  };

  for (const field of fields) {
    const unitId = projected[field.idKey];
    if (!unitId) continue;
    const isVisible = playerId !== null &&
      (state.units[unitId]?.owner === playerId || canPlayerKnowUnitExactPosition(state, playerId, unitId));
    if (isVisible) continue;
    const oldName = projected[field.nameKey];
    if (oldName) scrubText(oldName, field.safeName);
    scrubText(unitId, field.safeName);
    delete projected[field.idKey];
    projected[field.nameKey] = field.safeName;
    if (field.idKey === "sourceUnitId" || (field.idKey === "actorUnitId" && !presentation.sourceUnitId)) sourceWasRedacted = true;
  }

  if (sourceWasRedacted) {
    if (projected.abilityName) scrubText(projected.abilityName, "Hidden effect");
    if (projected.abilityId) scrubText(projected.abilityId, "Hidden effect");
    delete projected.abilityId;
    delete projected.abilityName;
  }

  return projected;
}

/** Committed blast geometry is public; hidden caster/ability identity is independent. */
export function buildPendingAoEPreview(
  state: GameState,
  viewer: PlayerId | "spectator",
): PlayerView["pendingAoEPreview"] {
  const pendingAoE = state.pendingAoE;
  if (!pendingAoE || !pendingAoE.abilityId) return null;
  const caster = state.units[pendingAoE.casterId];
  const visible = !!caster && (viewer === "spectator"
    ? !caster.isStealthed
    : canPlayerKnowUnitExactPosition(state, viewer, caster.id));
  return {
    ...(visible ? { casterId: pendingAoE.casterId, abilityId: pendingAoE.abilityId } : {}),
    center: { ...pendingAoE.center },
    radius: pendingAoE.radius,
  };
}
