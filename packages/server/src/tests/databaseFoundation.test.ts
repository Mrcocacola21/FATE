import assert from "node:assert/strict";
import type { Match, PrismaClient, User } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import { MatchRepository, UserRepository } from "../repositories";

const now = new Date("2026-01-01T00:00:00.000Z");

async function testDatabaseRequiresConfigurationOnlyWhenRequested() {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    assert.throws(
      () => getDatabaseClient(),
      /DATABASE_URL is required when database access is requested/,
    );
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
}

async function testUserRepositoryDelegatesTypedQueries() {
  const user: User = {
    id: "1a3a1eb5-5df2-49ab-b3f2-f75ebf434999",
    email: "player@example.com",
    passwordHash: null,
    createdAt: now,
    updatedAt: now,
  };
  const calls: Array<{ method: string; args: unknown }> = [];
  const database = {
    user: {
      findUnique: async (args: unknown) => {
        calls.push({ method: "findUnique", args });
        return user;
      },
      create: async (args: unknown) => {
        calls.push({ method: "create", args });
        return user;
      },
    },
  } as unknown as PrismaClient;
  const repository = new UserRepository(database);

  assert.equal(await repository.findById(user.id), user);
  assert.equal(await repository.findByEmail(user.email), user);
  assert.equal(
    await repository.create({
      email: user.email,
      profile: { username: "player", displayName: "Player" },
    }),
    user,
  );
  assert.deepEqual(calls, [
    { method: "findUnique", args: { where: { id: user.id } } },
    { method: "findUnique", args: { where: { email: user.email } } },
    {
      method: "create",
      args: {
        data: {
          email: user.email,
          passwordHash: undefined,
          profile: {
            create: { username: "player", displayName: "Player" },
          },
        },
      },
    },
  ]);
}

async function testMatchRepositoryDelegatesTypedQueries() {
  const match: Match = {
    initialConfig: null,
    id: "a55a588d-5d05-4303-a0d7-f19e3d9e9a1f",
    roomId: "room-1",
    status: "WAITING",
    gameMode: "standard",
    seed: 42,
    createdById: null,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    winnerUserId: null,
    winnerSeat: null,
    loserSeat: null,
    loserUserId: null,
    durationMs: null,
    turnCount: null,
    finishReason: null,
    finalRevision: null,
    updatedAt: now,
  };
  const calls: Array<{ method: string; args: unknown }> = [];
  const database = {
    match: {
      findUnique: async (args: unknown) => {
        calls.push({ method: "findUnique", args });
        return match;
      },
      create: async (args: unknown) => {
        calls.push({ method: "create", args });
        return match;
      },
    },
  } as unknown as PrismaClient;
  const repository = new MatchRepository(database);

  assert.equal(await repository.findById(match.id), match);
  assert.equal(
    await repository.create({ roomId: "room-1", gameMode: "standard", seed: 42 }),
    match,
  );
  assert.deepEqual(calls, [
    { method: "findUnique", args: { where: { id: match.id } } },
    {
      method: "create",
      args: {
        data: {
          roomId: "room-1",
          status: undefined,
          gameMode: "standard",
          seed: 42,
          createdById: undefined,
        },
      },
    },
  ]);
}

async function run() {
  await testDatabaseRequiresConfigurationOnlyWhenRequested();
  await testUserRepositoryDelegatesTypedQueries();
  await testMatchRepositoryDelegatesTypedQueries();
  console.log("database foundation tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
