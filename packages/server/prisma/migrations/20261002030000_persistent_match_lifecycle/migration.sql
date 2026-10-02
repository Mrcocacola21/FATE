-- Preserve existing matches and all user/auth data; unlinked results remain nullable.
ALTER TABLE "Match" ADD COLUMN "winnerSeat" "MatchSeat";
