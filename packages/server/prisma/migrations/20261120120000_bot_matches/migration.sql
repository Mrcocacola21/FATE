-- A match against the server bot keeps its difficulty; NULL for matches between players.
ALTER TABLE "Match" ADD COLUMN "botDifficulty" VARCHAR(20);
