import type { Language, Translate } from "../i18n";
import type { MatchHistoryItem } from "../matches/types";

export function formatNumber(value: number | null, language: Language, digits = 0): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat(language, {
        maximumFractionDigits: digits,
      }).format(value);
}

export function formatWinRate(value: number, language: Language): string {
  return new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function sampleLabel(sample: number, total: number, t: Translate): string {
  return sample ? t("statistics.coverage", { sample, total }) : t("statistics.noReliableData");
}

/** Only a bounded recent sample, ordered oldest to newest. Never used for career metrics. */
export function recentResults(items: readonly MatchHistoryItem[]): MatchHistoryItem[] {
  return items
    .filter((item) => item.result !== null && item.finishedAt !== null)
    .slice()
    .sort(
      (a, b) => Date.parse(a.finishedAt!) - Date.parse(b.finishedAt!) || a.id.localeCompare(b.id),
    );
}

/** Cumulative win fraction inside this recent sample; draws count in the denominator. */
export function recentWinTrend(items: readonly MatchHistoryItem[]): number[] {
  let wins = 0;
  return items.map((item, index) => {
    if (item.result === "WIN") wins++;
    return wins / (index + 1);
  });
}
