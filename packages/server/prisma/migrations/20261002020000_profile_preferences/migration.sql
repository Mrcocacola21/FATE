CREATE TYPE "ProfileLanguage" AS ENUM ('en', 'uk');
CREATE TYPE "ProfileTheme" AS ENUM ('light', 'dark');

ALTER TABLE "Profile"
  ADD COLUMN "preferredLanguage" "ProfileLanguage" NOT NULL DEFAULT 'en',
  ADD COLUMN "preferredTheme" "ProfileTheme" NOT NULL DEFAULT 'light';
