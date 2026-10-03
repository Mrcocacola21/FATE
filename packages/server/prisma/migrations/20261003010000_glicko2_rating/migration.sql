-- Historical/current matches remain casual; no automatic rating backfill.
ALTER TABLE "Match" ADD COLUMN "isRated" BOOLEAN NOT NULL DEFAULT false,
                    ADD COLUMN "ratingProcessedAt" TIMESTAMPTZ(3);
CREATE INDEX "Match_isRated_status_ratingProcessedAt_idx"
  ON "Match"("isRated", "status", "ratingProcessedAt");

-- Nullable additions preserve any foundation-era audit rows without fabricating data.
ALTER TABLE "RatingHistory" ADD COLUMN "opponentUserId" UUID,
                            ADD COLUMN "result" "MatchOutcome",
                            ADD COLUMN "ratedGameNumber" INTEGER;
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_opponentUserId_fkey"
  FOREIGN KEY ("opponentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "RatingHistory_userId_ratedGameNumber_key"
  ON "RatingHistory"("userId", "ratedGameNumber");
CREATE INDEX "RatingHistory_opponentUserId_idx" ON "RatingHistory"("opponentUserId");

-- A per-player period number records commit order, even with equal millisecond timestamps.
ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_ratedGameNumber_check"
  CHECK ("ratedGameNumber" IS NULL OR "ratedGameNumber" > 0);
