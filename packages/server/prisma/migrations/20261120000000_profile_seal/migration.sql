-- The wax seal a player stamps to accept a rated match; null stamps the default.
ALTER TABLE "Profile" ADD COLUMN "seal" VARCHAR(32);
