-- Online status: who may see it, and when the player was last connected.
CREATE TYPE "PresenceVisibility" AS ENUM ('EVERYONE', 'FRIENDS', 'NOBODY');

ALTER TABLE "Profile"
  ADD COLUMN "presenceVisibility" "PresenceVisibility" NOT NULL DEFAULT 'EVERYONE',
  ADD COLUMN "lastSeenAt" TIMESTAMPTZ(3);
