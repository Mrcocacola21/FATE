import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Prisma, PrismaClient } from "@prisma/client";
import { makeReplayView } from "rules";
import { configureTestDatabase } from "./testDatabase";
import { createReplayFixture } from "./replayTestSupport";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchSnapshotRepository } from "../repositories/matchSnapshotRepository";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { ReplayService } from "../services/replayService";
import { ReplayQueryService } from "../services/replayQueryService";
import { replayRoutes } from "../routes/replayRoutes";
import { deserializeMatchSnapshot } from "../persistence/matchSnapshot";

async function run() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const fixture = createReplayFixture("classic", true);
  const id = fixture.match.id;
  try {
    await db.match.create({
      data: {
        ...fixture.match,
        initialConfig: fixture.match.initialConfig as Prisma.InputJsonObject,
        participants: {
          create: (["P1", "P2"] as const).map((seat) => ({
            seat,
            displayNameSnapshot: `Historical ${seat}`,
            outcome: seat === fixture.match.winnerSeat ? "WIN" : "LOSS",
          })),
        },
      },
    });
    await db.matchAction.createMany({
      data: fixture.actions.map((row) => ({
        ...row,
        actionPayload: row.actionPayload as Prisma.InputJsonObject,
        events: row.events as Prisma.InputJsonArray,
      })),
    });
    await db.matchSnapshot.createMany({
      data: [20, 40, 60, fixture.match.finalRevision!].map((n) => {
        const row = fixture.history.get(n)!;
        return {
          ...row,
          state: row.state as Prisma.InputJsonObject,
          rngState: row.rngState as Prisma.InputJsonObject,
        };
      }),
    });
    const read = async () => ({
      match: await db.match.findUniqueOrThrow({ where: { id }, include: { participants: true } }),
      actions: await db.matchAction.findMany({
        where: { matchId: id },
        orderBy: { revision: "asc" },
      }),
      snapshots: await db.matchSnapshot.findMany({
        where: { matchId: id },
        orderBy: { revision: "asc" },
      }),
      ratings: await db.rating.count(),
      ratingHistory: await db.ratingHistory.count(),
    });
    const before = await read();
    // Real HTTP handlers under PostgreSQL READ ONLY: any accidental persistence fails.
    await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const database = tx as PrismaClient;
        const matches = new MatchRepository(database),
          actions = new MatchActionRepository(database);
        const engine = new ReplayService(
          matches,
          actions,
          new MatchSnapshotService(new MatchSnapshotRepository(database), { interval: 20 }),
        );
        const server = Fastify({ logger: false });
        await server.register(replayRoutes, {
          prefix: "/api",
          replayQuery: new ReplayQueryService(matches, actions, engine),
          identity: {
            verify: async () => ({ userId: randomUUID(), username: "Reader", displayName: null }),
          },
        });
        const get = (suffix: string) =>
          server.inject({
            url: `/api/matches/${id}/replay${suffix}`,
            headers: { authorization: "Bearer local-test" },
          });
        try {
          const metadata = await get("");
          assert.equal(metadata.statusCode, 200, metadata.body);
          assert.equal(metadata.json().participants[0].displayName, "Historical P1");
          for (const revision of [0, 10, 55, 73, fixture.match.finalRevision!]) {
            const result = await get(`/state?revision=${revision}`);
            assert.equal(result.statusCode, 200, result.body);
            const expected =
              revision === 0
                ? fixture.initialState
                : deserializeMatchSnapshot(fixture.history.get(revision)!).state;
            assert.deepEqual(
              result.json().state,
              JSON.parse(JSON.stringify(makeReplayView(expected))),
            );
          }
          assert.equal((await engine.reconstructAtRevision(id, 55)).base.revision, 40);
        } finally {
          await server.close();
        }
      },
      { timeout: 30000 },
    );
    assert.deepEqual(await read(), before);
    console.log(
      "Replay API PostgreSQL integration passed: real timeline/checkpoints and HTTP in READ ONLY transaction; all persisted rows unchanged",
    );
  } finally {
    await db.match.deleteMany({ where: { id } });
    await db.$disconnect();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
