import type { Language, Translate } from "../i18n";
import { isGameModeId, getGameModeName } from "../modes/modeLabels";
import type { MatchMetadata, MatchOutcome } from "./types";
import { ApiError } from "../api/client";

export function modeLabel(mode: string, t: Translate) {
  return isGameModeId(mode) ? getGameModeName(mode, t) : mode;
}
export function outcomeLabel(result: MatchOutcome | null, t: Translate) {
  return t(`matches.${result ?? "unknown"}`);
}
export function formatDate(value: string | null, language: Language, t: Translate) {
  return value ? new Date(value).toLocaleString(language) : t("matches.unavailable");
}
export function matchDate(match: MatchMetadata) {
  return match.finishedAt ?? match.startedAt ?? match.createdAt;
}
export function formatDuration(value: number | null, t: Translate) {
  if (value === null) return t("matches.unavailable");
  const seconds = Math.floor(value / 1000);
  return t("matches.durationValue", {
    minutes: Math.floor(seconds / 60),
    seconds: String(seconds % 60).padStart(2, "0"),
  });
}
export function finishReasonLabel(reason: string | null, t: Translate) {
  return reason && ["allEnemyUnitsDefeated", "chessMutualKingDefeat", "unknown"].includes(reason)
    ? t(`matches.reasons.${reason}`)
    : t("matches.unavailable");
}
export function matchErrorMessage(error: unknown, t: Translate) {
  if (error instanceof ApiError) {
    if (error.code === "USER_NOT_FOUND") return t("profile.notFound");
    if (error.code === "MATCH_NOT_FOUND") return t("matches.notFound");
    if (error.code === "MATCH_NOT_FINISHED") return t("matches.notFinished");
    if (["INVALID_REQUEST", "VALIDATION_ERROR"].includes(error.code)) return t("matches.invalidRequest");
  }
  return t("matches.loadError");
}
