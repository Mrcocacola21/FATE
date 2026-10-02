-- Legacy anonymous participants remain nullable. PostgreSQL allows multiple NULLs.
-- Existing duplicate non-null identities cause migration to fail without changing data.
CREATE UNIQUE INDEX "MatchParticipant_matchId_userId_key" ON "MatchParticipant"("matchId", "userId");
