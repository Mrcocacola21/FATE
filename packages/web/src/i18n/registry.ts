import { en } from "./locales/en";
import { uk } from "./locales/uk";
import pl from "./locales/pl.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import ptBR from "./locales/pt-BR.json";
import tr from "./locales/tr.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zhCN from "./locales/zh-CN.json";
import he from "./locales/he.json";

export interface LocaleResource {
  [key: string]: string | LocaleResource;
}
const resource = (value: LocaleResource): LocaleResource => value;
export const localeRegistry = [
  { code: "uk", label: "Українська", direction: "ltr", resource: resource(uk) },
  { code: "en", label: "English", direction: "ltr", resource: resource(en) },
  { code: "pl", label: "Polski", direction: "ltr", resource: resource(pl) },
  { code: "de", label: "Deutsch", direction: "ltr", resource: resource(de) },
  { code: "fr", label: "Français", direction: "ltr", resource: resource(fr) },
  { code: "es", label: "Español", direction: "ltr", resource: resource(es) },
  { code: "pt-BR", label: "Português (Brasil)", direction: "ltr", resource: resource(ptBR) },
  { code: "tr", label: "Türkçe", direction: "ltr", resource: resource(tr) },
  { code: "ja", label: "日本語", direction: "ltr", resource: resource(ja) },
  { code: "ko", label: "한국어", direction: "ltr", resource: resource(ko) },
  { code: "zh-CN", label: "简体中文", direction: "ltr", resource: resource(zhCN) },
  { code: "he", label: "עברית", direction: "rtl", resource: resource(he) },
] as const satisfies ReadonlyArray<{
  code: string;
  label: string;
  direction: "ltr" | "rtl";
  resource: LocaleResource;
}>;

export type Language = (typeof localeRegistry)[number]["code"];
export function isLanguage(value: unknown): value is Language {
  return localeRegistry.some((locale) => locale.code === value);
}
export const locales = Object.fromEntries(
  localeRegistry.map((locale) => [locale.code, locale.resource]),
) as unknown as Record<Language, LocaleResource>;

export function languageName(code: Language): string {
  return localeRegistry.find((locale) => locale.code === code)?.label ?? "English";
}

export function normalizeLanguage(value?: string | null): Language | undefined {
  if (!value) return undefined;
  const normalized = value.trim().replace(/_/g, "-").toLowerCase();
  const exact = localeRegistry.find((locale) => locale.code.toLowerCase() === normalized);
  if (exact) return exact.code;
  const base = normalized.split("-")[0];
  if (base === "iw") return "he";
  // Portuguese defaults to the product's Brazilian locale. Traditional Chinese
  // is deliberately unsupported; never silently select Simplified Chinese for it.
  if (base === "pt") return "pt-BR";
  if (base === "zh") {
    if (/(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(normalized)) return undefined;
    if (normalized === "zh" || /(?:^|-)(?:hans|cn|sg)(?:-|$)/.test(normalized)) return "zh-CN";
    return undefined;
  }
  return localeRegistry.find((locale) => locale.code === base)?.code;
}
