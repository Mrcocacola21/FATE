CREATE TYPE "AuditEventType" AS ENUM ('USER_BLOCKED', 'USER_UNBLOCKED', 'USER_ROLE_CHANGED', 'MATCH_INTERRUPTED');
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM');

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventType" "AuditEventType" NOT NULL,
  "actorType" "AuditActorType" NOT NULL,
  "actorUserId" UUID,
  "actorRole" "UserRole",
  "targetUserId" UUID,
  "matchId" UUID,
  "reason" VARCHAR(500),
  "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_actor_check" CHECK (
    ("actorType" = 'SYSTEM' AND "actorUserId" IS NULL AND "actorRole" IS NULL) OR
    ("actorType" = 'USER' AND "actorUserId" IS NOT NULL AND "actorRole" IS NOT NULL)
  ),
  CONSTRAINT "AuditLog_resource_check" CHECK (
    ("eventType" = 'MATCH_INTERRUPTED' AND "matchId" IS NOT NULL AND "targetUserId" IS NULL) OR
    ("eventType" <> 'MATCH_INTERRUPTED' AND "targetUserId" IS NOT NULL AND "matchId" IS NULL)
  ),
  CONSTRAINT "AuditLog_metadata_size" CHECK (octet_length("metadata"::text) <= 2048)
);

CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt", "id");
CREATE INDEX "AuditLog_eventType_createdAt_id_idx" ON "AuditLog"("eventType", "createdAt", "id");
CREATE INDEX "AuditLog_actorUserId_createdAt_id_idx" ON "AuditLog"("actorUserId", "createdAt", "id");
CREATE INDEX "AuditLog_targetUserId_createdAt_id_idx" ON "AuditLog"("targetUserId", "createdAt", "id");
CREATE INDEX "AuditLog_matchId_createdAt_id_idx" ON "AuditLog"("matchId", "createdAt", "id");
