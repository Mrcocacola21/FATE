-- Deliberate fresh-ladder cutover. Preserve earned GLOBAL state for audit only.
-- Deploy with old writers stopped; never copy global state into any mode.
BEGIN;
ALTER TABLE "Rating" RENAME TO "LegacyGlobalRating";
ALTER TABLE "LegacyGlobalRating" RENAME CONSTRAINT "Rating_pkey" TO "LegacyGlobalRating_pkey";
ALTER TABLE "LegacyGlobalRating" RENAME CONSTRAINT "Rating_userId_fkey" TO "LegacyGlobalRating_userId_fkey";
DROP INDEX "Rating_rating_idx";
CREATE TABLE "Rating" (
  "userId" UUID NOT NULL,
  "gameMode" VARCHAR(50) NOT NULL,
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
  "ratingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 350,
  "volatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
  "ratedGames" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Rating_pkey" PRIMARY KEY ("userId", "gameMode"),
  CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Rating_gameMode_check" CHECK ("gameMode" IN ('standard', 'draft', 'classic'))
);
CREATE INDEX "Rating_gameMode_rating_idx" ON "Rating"("gameMode", "rating" DESC);
-- NULL explicitly preserves the old GLOBAL stream. Match mode alone cannot turn
-- a global before/after snapshot into a mode-specific Glicko state.
ALTER TABLE "RatingHistory" ADD COLUMN "gameMode" VARCHAR(50);
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_gameMode_check"
  CHECK ("gameMode" IS NULL OR "gameMode" IN ('standard', 'draft', 'classic'));
DROP INDEX "RatingHistory_userId_ratedGameNumber_key";
CREATE UNIQUE INDEX "RatingHistory_userId_gameMode_ratedGameNumber_key"
  ON "RatingHistory"("userId", "gameMode", "ratedGameNumber");
CREATE UNIQUE INDEX "RatingHistory_legacy_period_key"
  ON "RatingHistory"("userId", "ratedGameNumber") WHERE "gameMode" IS NULL;
DROP INDEX "RatingHistory_userId_createdAt_idx";
CREATE INDEX "RatingHistory_userId_gameMode_createdAt_idx"
  ON "RatingHistory"("userId", "gameMode", "createdAt");
-- Preserve processed markers and user/match uniqueness: old results cannot be
-- rated twice. Unprocessed eligible matches may recover once into their mode.
COMMIT;
