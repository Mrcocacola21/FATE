-- Extend the existing preference enum; preserve existing defaults and rows.
ALTER TYPE "ProfileLanguage" ADD VALUE IF NOT EXISTS 'pl';
ALTER TYPE "ProfileLanguage" ADD VALUE IF NOT EXISTS 'de';
ALTER TYPE "ProfileLanguage" ADD VALUE IF NOT EXISTS 'fr';
ALTER TYPE "ProfileLanguage" ADD VALUE IF NOT EXISTS 'es';
ALTER TYPE "ProfileLanguage" ADD VALUE IF NOT EXISTS 'pt-BR';
ALTER TYPE "ProfileLanguage" ADD VALUE IF NOT EXISTS 'tr';
ALTER TYPE "ProfileLanguage" ADD VALUE IF NOT EXISTS 'ja';
ALTER TYPE "ProfileLanguage" ADD VALUE IF NOT EXISTS 'ko';
ALTER TYPE "ProfileLanguage" ADD VALUE IF NOT EXISTS 'zh-CN';
ALTER TYPE "ProfileLanguage" ADD VALUE IF NOT EXISTS 'he';
