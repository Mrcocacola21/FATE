CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');
ALTER TABLE "User"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "blockedAt" TIMESTAMPTZ(3),
  ADD COLUMN "blockedReason" VARCHAR(500);
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_blockedAt_idx" ON "User"("blockedAt");
CREATE INDEX "User_createdAt_id_idx" ON "User"("createdAt", "id");
CREATE INDEX "Match_createdAt_id_idx" ON "Match"("createdAt", "id");
CREATE INDEX "Match_finishedAt_id_idx" ON "Match"("finishedAt", "id");
CREATE INDEX "Match_gameMode_isRated_createdAt_idx" ON "Match"("gameMode", "isRated", "createdAt");
