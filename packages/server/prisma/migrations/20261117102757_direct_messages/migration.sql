-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "senderId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "userLowId" UUID NOT NULL,
    "userHighId" UUID NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMPTZ(3),

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectMessage_userLowId_userHighId_createdAt_idx" ON "DirectMessage"("userLowId", "userHighId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_recipientId_readAt_idx" ON "DirectMessage"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "DirectMessage_createdAt_idx" ON "DirectMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
