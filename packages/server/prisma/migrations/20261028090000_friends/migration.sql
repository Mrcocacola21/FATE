-- Friends: one row per pair of players (pending request or accepted friendship), and blocks.
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');
CREATE TYPE "FriendRequestPolicy" AS ENUM ('EVERYONE', 'NOBODY');

ALTER TABLE "Profile" ADD COLUMN "friendRequests" "FriendRequestPolicy" NOT NULL DEFAULT 'EVERYONE';

CREATE TABLE "Friendship" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requesterId" UUID NOT NULL,
    "addresseeId" UUID NOT NULL,
    "userLowId" UUID NOT NULL,
    "userHighId" UUID NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id"),
    -- The sorted pair is exactly the two participants, and nobody befriends themselves.
    CONSTRAINT "Friendship_pair_check" CHECK (
        "userLowId" < "userHighId"
        AND "requesterId" <> "addresseeId"
        AND "userLowId" = LEAST("requesterId", "addresseeId")
        AND "userHighId" = GREATEST("requesterId", "addresseeId")
    ),
    CONSTRAINT "Friendship_accepted_check" CHECK (("status" = 'ACCEPTED') = ("acceptedAt" IS NOT NULL))
);

CREATE TABLE "UserBlock" (
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId", "blockedId"),
    CONSTRAINT "UserBlock_self_check" CHECK ("blockerId" <> "blockedId")
);

CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");
CREATE UNIQUE INDEX "Friendship_userLowId_userHighId_key" ON "Friendship"("userLowId", "userHighId");
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
