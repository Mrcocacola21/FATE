import { getAbilitySpec } from "../../abilities";
import { getHeroMeta } from "../../heroMeta";
import type { GameState, PendingRollContext, PlayerId, RollKind, UnitState } from "../../model";
import { getStealthSuccessMinRoll } from "../../stealth";

export interface PendingRollContextBuilderParams {
  state: GameState;
  requestedPlayerId: PlayerId;
  kind: RollKind;
  resolutionContext: Record<string, unknown>;
  actorUnitId?: string;
}

function valueAsString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function valueAsStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function unitName(unit: UnitState | undefined): string | undefined {
  if (!unit) return undefined;
  const identity = unit.figureId ?? unit.heroId;
  return (
    (identity ? getHeroMeta(identity)?.name : undefined) ??
    identity ??
    `${unit.class.charAt(0).toUpperCase()}${unit.class.slice(1)}`
  );
}

function abilityName(abilityId: string | undefined): string | undefined {
  return abilityId ? (getAbilitySpec(abilityId)?.displayName ?? abilityId) : undefined;
}

function sumDice(value: unknown): number | undefined {
  if (!Array.isArray(value) || !value.every((die) => typeof die === "number")) {
    return undefined;
  }
  return value.reduce<number>((total, die) => total + die, 0);
}

function unitFromContext(
  state: GameState,
  context: Record<string, unknown>,
  ...keys: string[]
): UnitState | undefined {
  for (const key of keys) {
    const id = valueAsString(context[key]);
    if (id && state.units[id]) return state.units[id];
  }
  return undefined;
}

function queuedTarget(state: GameState, context: Record<string, unknown>): UnitState | undefined {
  const targets = valueAsStringArray(context.targetsQueue);
  const index = typeof context.currentTargetIndex === "number" ? context.currentTargetIndex : 0;
  return state.units[targets[index] ?? ""];
}

function baseContext(
  params: PendingRollContextBuilderParams,
  details: Partial<PendingRollContext>,
): PendingRollContext {
  return {
    title: details.title ?? "Roll required",
    reason: details.reason ?? "Roll dice to continue resolving the current effect.",
    rollKind: details.rollKind ?? "unknown",
    diceLabel: details.diceLabel ?? "1d6",
    requestedPlayerId: params.requestedPlayerId,
    ...details,
  };
}

export function createAttackRollContext(
  params: PendingRollContextBuilderParams,
): PendingRollContext {
  const { state, resolutionContext } = params;
  const attacker = unitFromContext(state, resolutionContext, "attackerId", "casterId");
  const defender =
    unitFromContext(state, resolutionContext, "defenderId", "targetId") ??
    queuedTarget(state, resolutionContext);
  const sourceAbilityId = valueAsString(resolutionContext.sourceAbilityId);
  const attackerLabel = unitName(attacker) ?? "Unknown source";
  const defenderLabel = unitName(defender) ?? "Unknown target";
  const tieBreak = resolutionContext.stage === "tieBreak";
  const controllerPlayerId = valueAsString(resolutionContext.controllerPlayerId);

  return baseContext(params, {
    title: tieBreak ? "Attack Tie-break" : "Attack Roll",
    reason: `${attackerLabel} attacks ${defenderLabel}.`,
    rollKind: sourceAbilityId ? "ability" : "attack",
    actorUnitId: attacker?.id,
    actorName: attackerLabel,
    sourceUnitId: attacker?.id,
    sourceName: attackerLabel,
    targetUnitId: defender?.id,
    targetName: defenderLabel,
    abilityId: sourceAbilityId,
    abilityName: abilityName(sourceAbilityId),
    diceLabel: tieBreak ? "1d6" : "2d6",
    successRule: tieBreak ? "Roll higher than the defense tie-break" : undefined,
    successText: "Hit the target and resolve attack damage.",
    failureText: "The attack misses.",
    isControlledRoll:
      !!attacker &&
      controllerPlayerId === params.requestedPlayerId &&
      attacker.owner !== params.requestedPlayerId,
  });
}

export function createDefenseRollContext(
  params: PendingRollContextBuilderParams,
): PendingRollContext {
  const { state, resolutionContext } = params;
  const attacker = unitFromContext(state, resolutionContext, "attackerId", "casterId");
  const defender =
    unitFromContext(state, resolutionContext, "defenderId", "targetId") ??
    queuedTarget(state, resolutionContext);
  const sourceAbilityId = valueAsString(resolutionContext.sourceAbilityId);
  const attackerLabel = unitName(attacker) ?? "Unknown source";
  const defenderLabel = unitName(defender) ?? "Unknown target";
  const tieBreak = resolutionContext.stage === "tieBreak";
  const attackDiceTotal = sumDice(resolutionContext.attackerDice);
  const tieBreakTotal = sumDice(resolutionContext.tieBreakAttacker);
  const opponentRollTotal =
    attackDiceTotal === undefined ? undefined : attackDiceTotal + (tieBreakTotal ?? 0);
  const damageOverride =
    typeof resolutionContext.damageOverride === "number"
      ? resolutionContext.damageOverride
      : undefined;
  const damageBonus =
    typeof resolutionContext.damageBonus === "number" ? resolutionContext.damageBonus : 0;
  const damage =
    damageOverride ?? (attacker ? Math.max(0, attacker.attack + damageBonus) : undefined);

  return baseContext(params, {
    title: tieBreak ? "Defense Tie-break" : "Defense Roll",
    reason: `${attackerLabel} attacks ${defenderLabel}.`,
    rollKind: "defense",
    actorUnitId: defender?.id,
    actorName: defenderLabel,
    sourceUnitId: attacker?.id,
    sourceName: attackerLabel,
    targetUnitId: defender?.id,
    targetName: defenderLabel,
    abilityId: sourceAbilityId,
    abilityName: abilityName(sourceAbilityId),
    diceLabel: tieBreak ? "1d6" : "2d6",
    successRule:
      opponentRollTotal === undefined
        ? "Roll higher than the attack"
        : `Roll higher than ${opponentRollTotal}`,
    successText: "Block or avoid the attack.",
    failureText: damage === undefined ? "Take attack damage." : `Take ${damage} damage.`,
    opponentRollTotal,
    comparedAgainst:
      opponentRollTotal === undefined
        ? `${attackerLabel}'s attack roll`
        : `${attackerLabel}'s attack roll ${opponentRollTotal}`,
  });
}

export function createStealthRollContext(
  params: PendingRollContextBuilderParams,
): PendingRollContext {
  const { state, resolutionContext } = params;
  const actor =
    unitFromContext(state, resolutionContext, "unitId", "friskId") ??
    state.units[params.actorUnitId ?? ""];
  const actorLabel = unitName(actor) ?? "Your unit";
  const minimum = actor ? getStealthSuccessMinRoll(actor) : null;
  const successRule = minimum ? `${minimum}-6 succeeds` : "Roll to resolve";

  return baseContext(params, {
    title: params.kind === "searchStealth" ? "Search / Reveal Roll" : "Stealth Attempt",
    reason:
      params.kind === "searchStealth"
        ? `${actorLabel} searches for a hidden enemy.`
        : `${actorLabel} tries to enter stealth.`,
    rollKind: "stealth",
    actorUnitId: actor?.id,
    actorName: actorLabel,
    sourceUnitId: actor?.id,
    sourceName: actorLabel,
    diceLabel: "1d6",
    successRule,
    successText:
      params.kind === "searchStealth"
        ? "Reveal a nearby hidden enemy on a successful search."
        : `${actorLabel} becomes hidden.`,
    failureText:
      params.kind === "searchStealth"
        ? "The hidden enemy remains concealed."
        : `${actorLabel} remains revealed.`,
  });
}

export function createTrapRollContext(params: PendingRollContextBuilderParams): PendingRollContext {
  const { state, resolutionContext } = params;
  const source = unitFromContext(state, resolutionContext, "sourceUnitId", "casterId");
  const target = unitFromContext(
    state,
    resolutionContext,
    "targetUnitId",
    "targetId",
    "defenderId",
    "unitId",
  );
  const sourceLabel = unitName(source) ?? "Unknown source";
  const targetLabel = unitName(target) ?? "Unknown target";
  return baseContext(params, {
    title: "Trap Save",
    reason: `${targetLabel} triggered ${sourceLabel}'s trap.`,
    rollKind: "trap",
    actorUnitId: target?.id,
    actorName: targetLabel,
    sourceUnitId: source?.id,
    sourceName: sourceLabel,
    targetUnitId: target?.id,
    targetName: targetLabel,
    diceLabel: "1d6",
    successRule: "5-6 succeeds",
    successText: "Avoid trap damage.",
    failureText: "Take 1 damage.",
  });
}

export function createExplosionRollContext(
  params: PendingRollContextBuilderParams,
): PendingRollContext {
  const context = params.kind.includes("defender")
    ? createDefenseRollContext(params)
    : createAttackRollContext(params);
  return {
    ...context,
    title: params.kind.includes("defender") ? "Explosion Save" : "Explosion Roll",
    reason: context.abilityName
      ? `Resolve ${context.abilityName}'s explosion.`
      : "Resolve the explosion effect.",
    rollKind: "explosion",
    successText: params.kind.includes("defender")
      ? "Avoid or reduce the explosion damage."
      : "The explosion hits the target.",
    failureText: params.kind.includes("defender")
      ? "Take explosion damage."
      : "The explosion misses the target.",
  };
}

export function createStatusSaveRollContext(
  params: PendingRollContextBuilderParams,
): PendingRollContext {
  const context = createAbilityRollContext(params);
  return {
    ...context,
    title: "Status Save",
    rollKind: "statusSave",
    successText: "Avoid the status effect.",
    failureText: "The status effect is applied.",
  };
}

export function createAbilityRollContext(
  params: PendingRollContextBuilderParams,
): PendingRollContext {
  const { state, resolutionContext } = params;
  if (params.kind === "initiativeRoll") {
    return baseContext(params, {
      title: "Initiative Roll",
      reason: "Determine who takes the first turn.",
      rollKind: "ability",
      diceLabel: "1d6",
      successText: "Set your initiative total.",
      failureText: undefined,
    });
  }
  const actor =
    unitFromContext(
      state,
      resolutionContext,
      "unitId",
      "casterId",
      "asgoreId",
      "friskId",
      "lokiId",
      "attackerId",
    ) ?? state.units[params.actorUnitId ?? ""];
  const target = unitFromContext(
    state,
    resolutionContext,
    "targetUnitId",
    "targetId",
    "defenderId",
  );
  const id =
    valueAsString(resolutionContext.abilityId) ?? valueAsString(resolutionContext.sourceAbilityId);
  const name = abilityName(id);
  const actorLabel = unitName(actor) ?? "Your unit";
  const targetLabel = unitName(target);
  const title = name ? `${name} Roll` : "Ability Roll";
  const isChoice = /Choice|Destination|Placement|Target/.test(params.kind);

  return baseContext(params, {
    title,
    reason: name
      ? `${actorLabel} uses ${name}${targetLabel ? ` on ${targetLabel}` : ""}.`
      : "Resolve the current ability or effect.",
    rollKind: "ability",
    actorUnitId: actor?.id,
    actorName: actorLabel,
    sourceUnitId: actor?.id,
    sourceName: actorLabel,
    targetUnitId: target?.id,
    targetName: targetLabel,
    abilityId: id,
    abilityName: name,
    diceLabel: isChoice ? "Choice" : "1d6",
    successText: isChoice ? undefined : "Apply the successful effect.",
    failureText: isChoice ? undefined : "Apply the failed effect.",
  });
}

const ATTACK_ROLL_KINDS = new Set<RollKind>([
  "attack_attackerRoll",
  "riderPathAttack_attackerRoll",
  "tricksterAoE_attackerRoll",
  "elCidTisona_attackerRoll",
  "elCidKolada_attackerRoll",
  "dora_attackerRoll",
  "kaiserCarpetStrikeAttack",
  "falseTrailExplosion_attackerRoll",
  "jebeHailOfArrows_attackerRoll",
  "vladForest_attackerRoll",
]);

const DEFENSE_ROLL_KINDS = new Set<RollKind>([
  "attack_defenderRoll",
  "riderPathAttack_defenderRoll",
  "tricksterAoE_defenderRoll",
  "elCidTisona_defenderRoll",
  "elCidKolada_defenderRoll",
  "dora_defenderRoll",
  "carpetStrike_defenderRoll",
  "falseTrailExplosion_defenderRoll",
  "jebeHailOfArrows_defenderRoll",
  "vladForest_defenderRoll",
  "berserkerDefenseChoice",
  "odinMuninnDefenseChoice",
  "asgoreBraveryDefenseChoice",
  "chikatiloDecoyChoice",
  "friskSubstitutionChoice",
  "friskChildsCryChoice",
  "tricksterAoE_berserkerDefenseChoice",
  "dora_berserkerDefenseChoice",
  "jebeHailOfArrows_berserkerDefenseChoice",
  "carpetStrike_berserkerDefenseChoice",
  "vladForest_berserkerDefenseChoice",
]);

export function createPendingRollContext(
  params: PendingRollContextBuilderParams,
): PendingRollContext {
  if (params.kind === "enterStealth" || params.kind === "searchStealth") {
    return createStealthRollContext(params);
  }
  if (params.kind.includes("falseTrailExplosion")) {
    return createExplosionRollContext(params);
  }
  if (ATTACK_ROLL_KINDS.has(params.kind)) {
    return createAttackRollContext(params);
  }
  if (DEFENSE_ROLL_KINDS.has(params.kind)) {
    return createDefenseRollContext(params);
  }
  if (params.kind.toLowerCase().includes("trap")) {
    return createTrapRollContext(params);
  }
  if (
    params.kind.toLowerCase().includes("chicken") ||
    params.kind.toLowerCase().includes("entangle") ||
    params.kind.toLowerCase().includes("blind")
  ) {
    return createStatusSaveRollContext(params);
  }
  return createAbilityRollContext(params);
}
