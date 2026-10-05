import assert from "node:assert/strict";
import test from "node:test";
import { AdminService } from "../services/adminService";
import type { AdminRepository } from "../repositories/adminRepository";
import { assertDocumentedResponse } from "./assertDocumentedResponse";

test("admin user detail derives canonical per-mode ranks with the existing rating domain", async () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const repository = {
    getUser: async () => ({
      id: "user",
      role: "USER",
      blockedAt: null,
      blockedReason: null,
      createdAt: now,
      updatedAt: now,
      profile: { username: "max", displayName: "Max" },
      _count: { matchParticipants: 12 },
      ratings: [
        { gameMode: "standard", rating: 1800 },
        { gameMode: "draft", rating: 900 },
        { gameMode: "classic", rating: 2050 },
      ].map((r) => ({
        ...r,
        ratingDeviation: 50,
        volatility: 0.06,
        ratedGames: 10,
        updatedAt: now,
      })),
    }),
  } as unknown as AdminRepository;
  const { user } = await new AdminService(repository, () => {}).getUser("user", "MODERATOR");
  assert.deepEqual(
    user.ratings.map((r) => [r.gameMode, r.rating, r.rankTier]),
    [
      ["standard", 1800, "BLACK_MOON"],
      ["draft", 900, "HALF"],
      ["classic", 2050, "DESTINY"],
    ],
  );
  assert.equal(user.matchCount, 12);
  assertDocumentedResponse("AdminUser", JSON.parse(JSON.stringify({ user })));
  assert.equal("passwordHash" in user, false);
});
