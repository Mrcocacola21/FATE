-- Who may invite a player into their lobby. The invites themselves live in server memory.
CREATE TYPE "LobbyInvitePolicy" AS ENUM ('EVERYONE', 'FRIENDS', 'NOBODY');

ALTER TABLE "Profile" ADD COLUMN "lobbyInvites" "LobbyInvitePolicy" NOT NULL DEFAULT 'EVERYONE';
