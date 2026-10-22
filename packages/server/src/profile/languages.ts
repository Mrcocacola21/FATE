import type { ProfileLanguage } from "@prisma/client";

export const profileLanguages = [
  "uk",
  "en",
  "pl",
  "de",
  "fr",
  "es",
  "pt-BR",
  "tr",
  "ja",
  "ko",
  "zh-CN",
  "he",
] as const;
export type PublicProfileLanguage = (typeof profileLanguages)[number];

// Prisma identifiers cannot contain hyphens; public values remain BCP-47 tags.
export function toStoredLanguage(language: PublicProfileLanguage): ProfileLanguage {
  if (language === "pt-BR") return "pt_BR";
  if (language === "zh-CN") return "zh_CN";
  return language;
}

export function toPublicLanguage(language: ProfileLanguage): PublicProfileLanguage {
  if (language === "pt_BR") return "pt-BR";
  if (language === "zh_CN") return "zh-CN";
  return language;
}
