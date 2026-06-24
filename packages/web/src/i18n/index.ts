import { useSyncExternalStore } from "react";
import { en } from "./locales/en";
import { uk } from "./locales/uk";

export type Language = "en" | "uk";
export const LANGUAGE_STORAGE_KEY = "FATE_LANGUAGE";

const locales = { en, uk } as const;
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

function isLanguage(value: string | null | undefined): value is Language {
  return value === "en" || value === "uk";
}

export function resolveInitialLanguage(
  storage?: Pick<Storage, "getItem"> | null,
  browserLanguage?: string | null,
): Language {
  const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
  if (isLanguage(saved)) return saved;
  return browserLanguage?.toLowerCase().startsWith("uk") ? "uk" : "en";
}

let language: Language = resolveInitialLanguage(
  typeof window === "undefined" ? null : window.localStorage,
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

function pluralKey(key: string, values?: TranslationValues): string {
  const count = values?.count;
  if (typeof count !== "number") return key;
  const category = new Intl.PluralRules(language).select(count);
  const candidate = `${key}_${category}`;
  return getByPath(locales[language], candidate) ? candidate : `${key}_other`;
}

export const translate: Translate = (key, values) => {
  const resolvedKey = pluralKey(key, values);
  const template =
    getByPath(locales[language], resolvedKey) ??
    getByPath(locales.en, resolvedKey) ??
    getByPath(locales.en, key) ??
    key;
  return interpolate(template, values);
};

export function getLanguage(): Language {
  return language;
}

export function setLanguage(next: Language, storage?: Pick<Storage, "setItem"> | null) {
  const targetStorage =
    storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
  targetStorage?.setItem(LANGUAGE_STORAGE_KEY, next);
  if (language === next) return;
  language = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
  listeners.forEach((listener) => listener());
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
