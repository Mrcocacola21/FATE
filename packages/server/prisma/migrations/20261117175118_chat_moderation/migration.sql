-- CreateEnum
CREATE TYPE "DirectMessagePolicy" AS ENUM ('FRIENDS', 'NOBODY');

-- CreateEnum
CREATE TYPE "ChatReportReason" AS ENUM ('ABUSE', 'SPAM', 'CHEATING', 'OTHER');

-- CreateEnum
CREATE TYPE "ChatReportSource" AS ENUM ('MATCH', 'SPECTATORS', 'DIRECT');

-- CreateEnum
CREATE TYPE "ChatReportStatus" AS ENUM ('OPEN', 'MUTED', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'CHAT_MUTED';
ALTER TYPE "AuditEventType" ADD VALUE 'CHAT_UNMUTED';
ALTER TYPE "AuditEventType" ADD VALUE 'CHAT_REPORT_RESOLVED';
ALTER TYPE "AuditEventType" ADD VALUE 'CHAT_REPORT_VIEWED';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "directMessages" "DirectMessagePolicy" NOT NULL DEFAULT 'FRIENDS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "chatMuteReason" VARCHAR(500),
ADD COLUMN     "chatMutedUntil" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "ChatReport" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporterId" UUID NOT NULL,
    "reportedId" UUID NOT NULL,
    "source" "ChatReportSource" NOT NULL,
    "messageKey" VARCHAR(64) NOT NULL,
    "roomId" VARCHAR(64),
    "matchId" UUID,
    "body" VARCHAR(1000) NOT NULL,
    "context" JSONB NOT NULL,
    "reason" "ChatReportReason" NOT NULL,
    "comment" VARCHAR(300),
    "status" "ChatReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),
    "resolvedById" UUID,

    CONSTRAINT "ChatReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatReport_status_createdAt_id_idx" ON "ChatReport"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ChatReport_messageKey_status_idx" ON "ChatReport"("messageKey", "status");

-- CreateIndex
CREATE INDEX "ChatReport_reportedId_status_idx" ON "ChatReport"("reportedId", "status");

-- CreateIndex
CREATE INDEX "ChatReport_reporterId_createdAt_idx" ON "ChatReport"("reporterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReport_reporterId_messageKey_key" ON "ChatReport"("reporterId", "messageKey");

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
