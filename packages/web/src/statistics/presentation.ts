import type { Language } from "../i18n";

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
