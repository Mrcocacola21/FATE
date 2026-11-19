import assert from "node:assert/strict";
import test from "node:test";
import { SEAL_IDS } from "rules";
import { profilePatchSchema } from "../../profile/schemas";
import { toOwnProfileDto } from "../../profile/dto";
import type { ProfileWithOwner } from "../../repositories/profileRepository";
import { ConnectionIdentityService } from "../../auth/connectionIdentity";
import type { TokenService } from "../../auth/tokens";
import type { UserRepository } from "../../repositories/userRepository";

const profile = (seal: string | null): ProfileWithOwner => ({
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
  figureFrame: null,
  seal,
  lastSeenAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    email: "p@example.com",
    createdAt: new Date(0),
  },
});

test("the profile accepts every known seal or the default, and nothing else", () => {
  for (const seal of SEAL_IDS) assert.equal(profilePatchSchema.parse({ seal }).seal, seal);
  assert.equal(profilePatchSchema.parse({ seal: null }).seal, null);
  assert.equal(profilePatchSchema.safeParse({ seal: "golden-dragon" }).success, false);
  assert.equal(profilePatchSchema.safeParse({ seal: 7 }).success, false);
});

test("the own profile reports a stored seal and drops one that is no longer offered", () => {
  assert.equal(toOwnProfileDto(profile("serpent")).seal, "serpent");
  assert.equal(toOwnProfileDto(profile("retired-seal")).seal, null);
  assert.equal(toOwnProfileDto(profile(null)).seal, null);
});

test("a verified connection carries the player's seal into matchmaking", async () => {
  const tokens = { verifyAccessToken: () => ({ sub: "u1" }) } as unknown as TokenService;
  const users = (seal: string | null) =>
    ({
      findAccountById: async () => ({
        id: "u1",
        role: "USER",
        blockedAt: null,
        profile: { ...profile(seal), userId: "u1" },
      }),
    }) as unknown as Pick<UserRepository, "findAccountById">;
  assert.equal(
    (await new ConnectionIdentityService(tokens, users("night-pact")).verify("t"))?.seal,
    "night-pact",
  );
  assert.equal(
    (await new ConnectionIdentityService(tokens, users("retired-seal")).verify("t"))?.seal,
    null,
  );
});
