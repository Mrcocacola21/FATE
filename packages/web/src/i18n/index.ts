import { useSyncExternalStore } from "react";
import { en } from "./locales/en";
import { uk } from "./locales/uk";
import { locales, normalizeLanguage, type Language } from "./registry";
export { localeRegistry, locales, languageName, normalizeLanguage, isLanguage } from "./registry";
export type { Language } from "./registry";

export const LANGUAGE_STORAGE_KEY = "FATE_LANGUAGE";

type LeafKeys<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends Record<string, unknown>
      ? LeafKeys<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

export type TranslationKey = LeafKeys<typeof en>;
export type TranslationValues = Record<string, string | number | null | undefined>;
export type Translate = (key: TranslationKey | string, values?: TranslationValues) => string;

export function resolveInitialLanguage(
  storage?: Pick<Storage, "getItem"> | null,
  browserLanguage?: string | null,
): Language {
  try {
    const saved = normalizeLanguage(storage?.getItem(LANGUAGE_STORAGE_KEY));
    if (saved) return saved;
  } catch {
    /* Browser privacy settings can disable storage. */
  }
  return normalizeLanguage(browserLanguage) ?? "en";
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let language: Language = resolveInitialLanguage(
  browserStorage(),
  typeof navigator === "undefined" ? null : navigator.language,
);
const listeners = new Set<() => void>();

function getByPath(source: unknown, key: string): string | undefined {
  let value: unknown = source;
  for (const part of key.split(".")) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    return value === null || value === undefined ? "" : String(value);
  });
}

function pluralKey(locale: Language, key: string, values?: TranslationValues): string {
  const count = values?.count;
  if (typeof count !== "number") return key;
  const category = new Intl.PluralRules(locale).select(count);
  const candidate = `${key}_${category}`;
  return getByPath(locales[locale], candidate) ? candidate : `${key}_other`;
}

export function translateForLanguage(
  locale: Language,
  key: string,
  values?: TranslationValues,
): string {
  const resolvedKey = pluralKey(locale, key, values);
  const fallbackKey = pluralKey("en", key, values);
  const template =
    getByPath(locales[locale], resolvedKey) ??
    getByPath(locales[locale], key) ??
    getByPath(locales.en, fallbackKey) ??
    getByPath(locales.en, key) ??
    key;
  return interpolate(template, values);
}

export const translate: Translate = (key, values) => translateForLanguage(language, key, values);

export function getLocaleText(locale: Language, key: string): string | undefined {
  return getByPath(locales[locale], key);
}

export function updateDocumentLanguage() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.documentElement.dir = language === "he" ? "rtl" : "ltr";
}

export function getLanguage(): Language {
  return language;
}

export function setLanguage(next: Language, storage?: Pick<Storage, "setItem"> | null) {
  if (!Object.prototype.hasOwnProperty.call(locales, next)) return;
  const targetStorage = storage === undefined ? browserStorage() : storage;
  try {
    targetStorage?.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    /* Changing language still works without persistent browser storage. */
  }
  const changed = language !== next;
  language = next;
  updateDocumentLanguage();
  if (changed) listeners.forEach((listener) => listener());
}

export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useI18n() {
  const currentLanguage = useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
  return {
    language: currentLanguage,
    setLanguage,
    t: translate,
  };
}

export function localeKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? [path] : localeKeys(child, path);
  });
}

export { en, uk };
