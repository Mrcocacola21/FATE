CREATE TYPE "MatchOutcome" AS ENUM ('WIN', 'LOSS', 'DRAW');
ALTER TABLE "Match" ADD COLUMN "loserUserId" UUID,
  ADD COLUMN "loserSeat" "MatchSeat",
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "turnCount" INTEGER;
ALTER TABLE "MatchParticipant" ADD COLUMN "outcome" "MatchOutcome",
  ADD COLUMN "resultData" JSONB;
CREATE INDEX "Match_loserUserId_idx" ON "Match"("loserUserId");
ALTER TABLE "Match" ADD CONSTRAINT "Match_loserUserId_fkey"
  FOREIGN KEY ("loserUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
