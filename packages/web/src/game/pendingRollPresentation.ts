import type { PendingRollContext, RollKind } from "rules";
import type { Translate as WebTranslate } from "../i18n";

export const FALLBACK_PENDING_ROLL_CONTEXT: Omit<PendingRollContext, "requestedPlayerId"> = {
  title: "Roll required",
  reason: "Roll dice to continue resolving the current effect.",
  rollKind: "unknown",
  diceLabel: "1d6",
};

const DIRECT_DICE_ROLL_KINDS = new Set<RollKind>([
  "initiativeRoll",
  "enterStealth",
  "enterBunker",
  "searchStealth",
  "moveTrickster",
  "moveBerserker",
  "courtAttackerRoll",
  "courtDefenderRoll",
  "moonRoundRoll",
  "moonCoordinateRoll",
  "attack_attackerRoll",
  "attack_defenderRoll",
  "riderPathAttack_attackerRoll",
  "riderPathAttack_defenderRoll",
  "tricksterAoE_attackerRoll",
  "tricksterAoE_defenderRoll",
  "elCidTisona_attackerRoll",
  "elCidTisona_defenderRoll",
  "elCidKolada_attackerRoll",
  "elCidKolada_defenderRoll",
  "dora_attackerRoll",
  "dora_defenderRoll",
  "kaiserCarpetStrikeCenter",
  "kaiserCarpetStrikeAttack",
  "carpetStrike_defenderRoll",
  "vladForest_attackerRoll",
  "vladForest_defenderRoll",
  "falseTrailExplosion_attackerRoll",
  "falseTrailExplosion_defenderRoll",
  "jebeHailOfArrows_attackerRoll",
  "jebeHailOfArrows_defenderRoll",
  "jebeKhansShooterRicochetRoll",
  "asgoreSoulParadeRoll",
  "friskWarmWordsHealRoll",
  "femtoDivineMoveRoll",
  "lechyStormStartTurnRoll",
  "forestMoveCheck",
]);

export function canResolvePendingRollDirectly(kind: RollKind): boolean {
  return DIRECT_DICE_ROLL_KINDS.has(kind);
}

export function pendingRollTitle(context: PendingRollContext, t: WebTranslate): string {
  if (context.title === "Initiative Roll") {
    return t("pending.rollInitiative");
  }
  const keyByKind: Record<PendingRollContext["rollKind"], string> = {
    attack: "pending.context.attackRoll",
    defense: "pending.context.defenseRoll",
    stealth: "pending.context.stealthAttempt",
    statusSave: "pending.context.statusSave",
    trap: "pending.context.trapSave",
    explosion: "pending.context.explosionSave",
    ability: "pending.context.abilityRoll",
    phantasm: "pending.context.phantasmRoll",
    reaction: "pending.context.reactionRoll",
    unknown: "pending.rollRequired",
  };
  return context.title.includes("Tie-break")
    ? t("pending.context.tieBreak", { title: t(keyByKind[context.rollKind]) })
    : t(keyByKind[context.rollKind]);
}

export function pendingRollReason(
  context: PendingRollContext,
  language: "en" | "uk",
  t: WebTranslate,
): string {
  if (language === "en") return context.reason;
  const actor = context.actorName ?? t("pending.context.hiddenUnit");
  const source = context.sourceName ?? t("pending.context.unknownSource");
  const target = context.targetName ?? t("pending.context.unknownTarget");
  switch (context.rollKind) {
    case "attack":
    case "defense":
      return t("pending.context.reasonAttack", { source, target });
    case "stealth":
      return t("pending.context.reasonStealth", { actor });
    case "trap":
      return t("pending.context.reasonTrap", { source, target });
    case "explosion":
      return t("pending.context.reasonExplosion");
    case "ability":
    case "phantasm":
    case "reaction":
    case "statusSave":
      return context.abilityName
        ? t("pending.context.reasonAbility", {
            actor,
            ability: context.abilityName,
            target: context.targetName ? ` — ${target}` : "",
          })
        : t("pending.context.fallbackReason");
    default:
      return t("pending.context.fallbackReason");
  }
}

export function localizedSuccessRule(
  rule: string | undefined,
  language: "en" | "uk",
  t: WebTranslate,
): string | undefined {
  if (!rule || language === "en") return rule;
  const threshold = rule.match(/^(\d+)-6 succeeds$/);
  if (threshold) {
    return t("pending.context.thresholdSucceeds", { min: threshold[1] });
  }
  const higher = rule.match(/^Roll higher than (\d+)$/);
  if (higher) {
    return t("pending.context.rollHigherThan", { total: higher[1] });
  }
  return rule;
}

export function localizedOutcome(
  context: PendingRollContext,
  outcome: "success" | "failure",
  language: "en" | "uk",
  t: WebTranslate,
): string | undefined {
  const raw = outcome === "success" ? context.successText : context.failureText;
  if (!raw || language === "en") return raw;
  const damage = raw.match(/Take (\d+) damage/i)?.[1];
  if (damage) return t("pending.context.takeDamage", { damage });
  const key = `${context.rollKind}.${outcome}`;
  const keys: Record<string, string> = {
    "attack.success": "pending.context.attackSuccess",
    "attack.failure": "pending.context.attackFailure",
    "defense.success": "pending.context.defenseSuccess",
    "defense.failure": "pending.context.defenseFailure",
    "stealth.success": "pending.context.stealthSuccess",
    "stealth.failure": "pending.context.stealthFailure",
    "trap.success": "pending.context.trapSuccess",
    "trap.failure": "pending.context.trapFailure",
    "explosion.success": "pending.context.explosionSuccess",
    "explosion.failure": "pending.context.explosionFailure",
  };
  return t(
    keys[key] ??
      (outcome === "success" ? "pending.context.genericSuccess" : "pending.context.genericFailure"),
  );
}
