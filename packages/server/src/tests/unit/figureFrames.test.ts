import assert from "node:assert/strict";
import test from "node:test";
import { FIGURE_FRAME_IDS } from "rules";
import { profilePatchSchema } from "../../profile/schemas";
import { toOwnProfileDto } from "../../profile/dto";
import type { ProfileWithOwner } from "../../repositories/profileRepository";
import { ConnectionIdentityService } from "../../auth/connectionIdentity";
import type { TokenService } from "../../auth/tokens";
import type { UserRepository } from "../../repositories/userRepository";

const profile = (figureFrame: string | null): ProfileWithOwner => ({
  userId: "00000000-0000-4000-8000-000000000001",
  username: "player_one",
  displayName: null,
  avatarUrl: null,
  preferredLanguage: "en",
  preferredTheme: "dark",
  friendRequests: "EVERYONE",
  presenceVisibility: "EVERYONE",
  lobbyInvites: "EVERYONE",
  directMessages: "FRIENDS",
  figureFrame,
  lastSeenAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "p@example.com",
    createdAt: new Date(0),
  },
});

test("the profile accepts every known frame or none, and nothing else", () => {
  for (const frame of FIGURE_FRAME_IDS)
    assert.equal(profilePatchSchema.parse({ figureFrame: frame }).figureFrame, frame);
  assert.equal(profilePatchSchema.parse({ figureFrame: null }).figureFrame, null);
  assert.equal(profilePatchSchema.safeParse({ figureFrame: "golden-dragon" }).success, false);
  assert.equal(profilePatchSchema.safeParse({ figureFrame: 7 }).success, false);
});

test("the own profile reports a stored frame and drops one that is no longer offered", () => {
  assert.equal(toOwnProfileDto(profile("arcane")).figureFrame, "arcane");
  assert.equal(toOwnProfileDto(profile("retired-frame")).figureFrame, null);
  assert.equal(toOwnProfileDto(profile(null)).figureFrame, null);
});

test("a verified connection carries the player's frame into the room", async () => {
  const tokens = { verifyAccessToken: () => ({ sub: "u1" }) } as unknown as TokenService;
  const users = (frame: string | null) =>
    ({
      findAccountById: async () => ({
        id: "u1",
        role: "USER",
        blockedAt: null,
        profile: { ...profile(frame), userId: "u1" },
      }),
    }) as unknown as Pick<UserRepository, "findAccountById">;
  const framed = await new ConnectionIdentityService(tokens, users("moon-gold")).verify("token");
  assert.equal(framed?.figureFrame, "moon-gold");
  const unknown = await new ConnectionIdentityService(tokens, users("retired-frame")).verify(
    "token",
  );
  assert.equal(unknown?.figureFrame, null);
});
