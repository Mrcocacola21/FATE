import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { configureTestDatabase } from "./testDatabase";
import { createReplayFixture } from "./replayTestSupport";
import { ReplayService } from "../services/replayService";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchSnapshotRepository } from "../repositories/matchSnapshotRepository";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { normalizeSnapshotState } from "../persistence/matchSnapshot";
import { getGameRoom, createGameRoomWithId, storeTestHooks } from "../store";

async function run() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const matchIds: string[] = [];
  const service = new ReplayService(
    new MatchRepository(db),
    new MatchActionRepository(db),
    new MatchSnapshotService(new MatchSnapshotRepository(db), { interval: 20 }),
  );
  const fixture = createReplayFixture("classic", true);
  const persist = async (withSnapshots: boolean) => {
    const id = randomUUID();
    matchIds.push(id);
    await db.match.create({
      data: {
        ...fixture.match,
        id,
        roomId: `phase11-test-${id}`,
        initialConfig: fixture.match.initialConfig as Prisma.InputJsonObject,
      },
    });
    await db.matchAction.createMany({
      data: fixture.actions.map((row) => ({
        ...row,
        id: randomUUID(),
        matchId: id,
        actionPayload: row.actionPayload as Prisma.InputJsonObject,
        events: row.events as Prisma.InputJsonArray,
      })),
    });
    if (withSnapshots)
      await db.matchSnapshot.createMany({
        data: [20, 40, 60, fixture.match.finalRevision!].map((revision) => {
          const row = fixture.history.get(revision)!;
          return {
            ...row,
            id: randomUUID(),
            matchId: id,
            state: row.state as Prisma.InputJsonObject,
            rngState: row.rngState as Prisma.InputJsonObject,
          };
        }),
      });
    return id;
  };
  try {
    const noSnapshots = await persist(false);
    assert.equal(getGameRoom(`phase11-test-${noSnapshots}`), undefined);
    const initialResult = await service.reconstructFinalState(noSnapshots);
    assert.equal(initialResult.base.type, "initial");
    assert.equal(initialResult.actionsApplied, fixture.match.finalRevision);
    assert.deepEqual(
      normalizeSnapshotState(initialResult.state),
      normalizeSnapshotState(fixture.room.state),
    );
    assert.equal((await service.validateFinalDeterminism(noSnapshots)).deterministic, null);
    const id = await persist(true);
    const before = await db.match.findUniqueOrThrow({
      where: { id },
      include: { participants: true },
    });
    const counts = await Promise.all([
      db.matchAction.count({ where: { matchId: id } }),
      db.matchSnapshot.count({ where: { matchId: id } }),
      db.rating.count(),
      db.ratingHistory.count(),
    ]);
    // A real DB transaction with a read-only PostgreSQL guard proves absence of hidden writes.
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const readonly = new ReplayService(
        new MatchRepository(tx as PrismaClient),
        new MatchActionRepository(tx as PrismaClient),
        new MatchSnapshotService(new MatchSnapshotRepository(tx as PrismaClient), { interval: 20 }),
      );
      assert.equal((await readonly.validateFinalDeterminism(id)).deterministic, true);
    });
    for (const [target, base] of [
      [10, 0],
      [20, 20],
      [40, 40],
      [55, 40],
      [73, 60],
    ]) {
      const result = await service.reconstructAtRevision(id, target);
      assert.equal(result.base.revision, base);
      assert.equal(result.actionsApplied, target - base);
      const expected = fixture.history.get(target)!;
      assert.deepEqual(result.rngState, expected.rngState);
    }
    const exact = await service.reconstructFinalState(id);
    assert.equal(exact.actionsApplied, 0);
    assert.equal(exact.verification, "checkpoint_loaded");
    assert.equal(
      (await service.validateFinalDeterminism(id)).actionsApplied,
      fixture.match.finalRevision,
    );
    const [one, two] = await Promise.all([
      service.reconstructAtRevision(id, 73),
      service.reconstructAtRevision(id, 73),
    ]);
    assert.deepEqual(one, two);
    createGameRoomWithId(before.roomId!, { seed: 999, gameMode: "draft" });
    getGameRoom(before.roomId!)!.state.turnNumber = 9999;
    assert.deepEqual(await service.reconstructAtRevision(id, 73), one);
    assert.deepEqual(
      await db.match.findUniqueOrThrow({ where: { id }, include: { participants: true } }),
      before,
    );
    assert.deepEqual(
      await Promise.all([
        db.matchAction.count({ where: { matchId: id } }),
        db.matchSnapshot.count({ where: { matchId: id } }),
        db.rating.count(),
        db.ratingHistory.count(),
      ]),
      counts,
    );
    // Corruption fixtures are explicit writes by the test, never by ReplayService.
    const finalRevision = fixture.match.finalRevision!;
    const finalKey = { matchId_revision: { matchId: id, revision: finalRevision } };
    await db.matchSnapshot.update({
      where: finalKey,
      data: { rngState: { algorithm: "lcg32-numerical-recipes-v1", state: 999 } },
    });
    await assert.rejects(service.validateFinalDeterminism(id), /REPLAY_RNG_MISMATCH/);
    await db.matchSnapshot.update({
      where: finalKey,
      data: {
        rngState: fixture.history.get(finalRevision)!.rngState as Prisma.InputJsonObject,
        state: {
          ...(fixture.history.get(finalRevision)!.state as Prisma.JsonObject),
          turnNumber: 999,
        },
      },
    });
    await assert.rejects(service.validateFinalDeterminism(id), /REPLAY_FINAL_STATE_MISMATCH/);
    await db.matchSnapshot.update({ where: finalKey, data: { formatVersion: 99 } });
    await assert.rejects(service.reconstructFinalState(id), /UNSUPPORTED_SNAPSHOT_VERSION/);
    await db.matchAction.delete({ where: { matchId_revision: { matchId: id, revision: 41 } } });
    await assert.rejects(service.reconstructAtRevision(id, 55), /REPLAY_ACTION_GAP/);
    await db.matchAction.update({
      where: { matchId_revision: { matchId: id, revision: 61 } },
      data: { actionPayload: {} },
    });
    await assert.rejects(service.reconstructAtRevision(id, 73), /INVALID_ACTION_LOG/);
    await db.match.update({ where: { id: noSnapshots }, data: { initialConfig: Prisma.DbNull } });
    await assert.rejects(service.reconstructFinalState(noSnapshots), /MATCH_NOT_REPLAYABLE/);
    // Legacy with a sufficient battle checkpoint remains reconstructable.
    await db.match.update({ where: { id }, data: { initialConfig: Prisma.DbNull } });
    assert.equal((await service.reconstructAtRevision(id, 60)).base.revision, 60);
    console.log(
      "replay PostgreSQL: real durable history, initial/snapshots/ranges, read-only SQL guard, unchanged match/actions/snapshots/ratings, full independent validation, RNG, concurrent calls, live-room isolation and corruption passed",
    );
  } finally {
    await db.match.deleteMany({ where: { id: { in: matchIds } } });
    await db.$disconnect();
    storeTestHooks.reset();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
