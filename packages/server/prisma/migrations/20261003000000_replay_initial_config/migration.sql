-- Nullable: existing matches cannot safely infer their original lobby configuration.
ALTER TABLE "Match" ADD COLUMN "initialConfig" JSONB;
