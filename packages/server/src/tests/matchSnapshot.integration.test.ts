import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SeededRNG } from "rules";
import { MatchSnapshotRepository } from "../repositories/matchSnapshotRepository";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchService } from "../services/matchService";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import {
  serializeMatchSnapshot,
  MATCH_SNAPSHOT_FORMAT_VERSION,
} from "../persistence/matchSnapshot";
import { createGameRoom, storeTestHooks, type GameRoom } from "../store";
import { configureTestDatabase } from "./testDatabase";

async function run() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const repository = new MatchSnapshotRepository(db);
  const snapshotService = new MatchSnapshotService(repository, { interval: 20 });
  const errors: object[] = [];
  const logger = { info() {}, error: (data: object) => errors.push(data) };
  const matches = new MatchRepository(db);
  const matchService = new MatchService(
    matches,
    logger,
    new MatchActionRepository(db),
    snapshotService,
  );
  const lifecycle = new MatchLifecycle(logger, matchService, snapshotService);
  const matchIds: string[] = [];
  const userIds: string[] = [];
  const prefix = `phase10-test-${randomUUID()}`;
  const dropTriggers = async () => {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS phase10_snapshot_order ON "MatchSnapshot"');
    await db.$executeRawUnsafe("DROP FUNCTION IF EXISTS phase10_snapshot_order()");
    await db.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS phase10_snapshot_failure ON "MatchSnapshot"',
    );
    await db.$executeRawUnsafe("DROP FUNCTION IF EXISTS phase10_snapshot_failure()");
  };
  const initializePlayers = (room: GameRoom) => {
    room.seats = { P1: "one", P2: "two" };
    room.seatIdentities = {
      P1: { userId: userIds[0], username: "Alice", displayName: null },
      P2: { userId: userIds[1], username: "Bob", displayName: null },
    };
    room.state = {
      ...room.state,
      seats: { P1: true, P2: true },
      playersReady: { P1: true, P2: true },
    };
  };
  const prepareTerminal = (room: GameRoom) => {
    room.state = {
      ...room.state,
      phase: "battle",
      pendingRoll: null,
      ruleDeclaration: {
        ...room.state.ruleDeclaration,
        selectedRuleId: "normal_rule",
        setupComplete: true,
      },
      units: Object.fromEntries(
        Object.entries(room.state.units).map(([id, u]) => [
          id,
          u.owner === "P2" ? { ...u, hp: 0, isAlive: false } : u,
        ]),
      ),
    };
  };
  try {
    for (const name of ["Alice", "Bob"])
      userIds.push(
        (
          await db.user.create({
            data: {
              email: `${prefix}-${name}@example.test`,
              profile: { create: { username: `${name}_${randomUUID().slice(0, 8)}` } },
            },
          })
        ).id,
      );
    const match = await matchService.createWaitingMatch({
      roomId: `${prefix}-repository`,
      seed: 37,
      gameMode: "standard",
    });
    matchIds.push(match.id);
    assert.equal(await snapshotService.loadLatestSnapshot(match.id), null);
    assert.equal(await snapshotService.loadLatestSnapshotAtOrBefore(match.id, 10), null);
    const captureRoom = createGameRoom({ seed: 37 });
    captureRoom.matchId = match.id;
    captureRoom.revision = 20;
    const snapshot = serializeMatchSnapshot(captureRoom);
    await Promise.all(Array.from({ length: 8 }, () => snapshotService.persistSnapshot(snapshot)));
    assert.equal(await db.matchSnapshot.count({ where: { matchId: match.id } }), 1);
    const canonical = await repository.findByMatchAndRevision(match.id, 20);
    assert(canonical);
    await snapshotService.persistSnapshot({
      ...snapshot,
      state: Object.fromEntries(Object.entries(snapshot.state).reverse()),
    });
    assert.deepEqual(await repository.findByMatchAndRevision(match.id, 20), canonical);
    for (const change of [
      { state: { ...snapshot.state, turnNumber: 9 } },
      { rngState: { ...snapshot.rngState, state: 99 } },
      { formatVersion: 999 },
    ]) {
      await assert.rejects(
        repository.create({ ...snapshot, ...change } as typeof snapshot),
        /MATCH_SNAPSHOT_CONFLICT/,
      );
      assert.deepEqual(await repository.findByMatchAndRevision(match.id, 20), canonical);
    }
    const contradictory = await Promise.allSettled([
      snapshotService.persistSnapshot({ ...snapshot, revision: 40 }),
      snapshotService.persistSnapshot({
        ...snapshot,
        revision: 40,
        state: { ...snapshot.state, turnNumber: 99 },
      }),
    ]);
    assert.equal(contradictory.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      contradictory.filter(
        (r) => r.status === "rejected" && r.reason.code === "MATCH_SNAPSHOT_CONFLICT",
      ).length,
      1,
    );
    for (const revision of [60, 73])
      await snapshotService.persistSnapshot({ ...snapshot, revision });
    // Timestamps deliberately disagree with revision order.
    await db.matchSnapshot.update({
      where: { matchId_revision: { matchId: match.id, revision: 20 } },
      data: { createdAt: new Date(Date.now() + 60000) },
    });
    assert.equal((await snapshotService.loadLatestSnapshot(match.id))!.revision, 73);
    for (const [query, expected] of [
      [10, null],
      [20, 20],
      [39, 20],
      [40, 40],
      [55, 40],
      [73, 73],
      [100, 73],
    ])
      assert.equal(
        (await snapshotService.loadLatestSnapshotAtOrBefore(match.id, query!))?.revision ?? null,
        expected,
      );
    const loaded = (await snapshotService.loadSnapshot(match.id, 20))!;
    assert.deepEqual(
      Object.keys(loaded.state.units),
      Object.keys(captureRoom.state.units),
      "JSONB round trip preserves rule iteration order",
    );
    const rng = SeededRNG.fromState(loaded.rngState);
    const original = SeededRNG.fromState((captureRoom.rng as SeededRNG).exportState());
    for (let index = 0; index < 50; index++) assert.equal(rng.next(), original.next());
    await db.matchSnapshot.update({
      where: { matchId_revision: { matchId: match.id, revision: 73 } },
      data: { formatVersion: 999 },
    });
    await assert.rejects(
      snapshotService.loadLatestSnapshot(match.id),
      /UNSUPPORTED_SNAPSHOT_VERSION/,
    );
    await db.matchSnapshot.update({
      where: { matchId_revision: { matchId: match.id, revision: 73 } },
      data: { formatVersion: MATCH_SNAPSHOT_FORMAT_VERSION, state: {} },
    });
    await assert.rejects(snapshotService.loadLatestSnapshot(match.id), /MATCH_SNAPSHOT_INVALID/);

    // The trigger fails if a live snapshot is written before its accepted action.
    await db.$executeRawUnsafe(`CREATE FUNCTION phase10_snapshot_order() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NOT EXISTS (SELECT 1 FROM "MatchAction" WHERE "matchId" = NEW."matchId" AND "revision" = NEW."revision") THEN
        RAISE EXCEPTION 'snapshot before action'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(
      'CREATE TRIGGER phase10_snapshot_order BEFORE INSERT ON "MatchSnapshot" FOR EACH ROW EXECUTE FUNCTION phase10_snapshot_order()',
    );
    for (const terminal of [73, 80]) {
      const room = await lifecycle.createRoom({ seed: 54 }, `${prefix}-terminal-${terminal}`);
      matchIds.push(room.matchId!);
      initializePlayers(room);
      assert((await lifecycle.applyAction(room, { type: "startGame" }, "P1")).ok);
      while (room.revision < terminal - 1) {
        if (room.revision === 19) {
          assert(
            !(
              await lifecycle.applyAction(
                room,
                { type: "resolvePendingRoll", player: "P1", pendingRollId: "wrong" },
                "P1",
              )
            ).ok,
          );
          assert.equal(room.revision, 19);
          await lifecycle.drainActions();
          assert.equal(await db.matchSnapshot.count({ where: { matchId: room.matchId! } }), 0);
        }
        lifecycle.recordDraftAction(room, {
          type: "draftBanHero",
          player: "P1",
          heroId: `hero-${room.revision}`,
        });
      }
      prepareTerminal(room);
      assert((await lifecycle.applyAction(room, { type: "endTurn" }, "P1")).ok);
      assert(await lifecycle.drainActions());
      lifecycle.recordAcceptedAction(room);
      assert(await lifecycle.drainActions());
      const rows = await db.matchSnapshot.findMany({
        where: { matchId: room.matchId! },
        orderBy: { revision: "asc" },
      });
      assert.deepEqual(
        rows.map((r) => r.revision),
        [20, 40, 60, terminal],
      );
      assert.equal((await matches.findById(room.matchId!))!.finalRevision, terminal);
      assert.equal((await snapshotService.loadLatestSnapshot(room.matchId!))!.state.phase, "ended");
      assert.equal(
        (await snapshotService.loadLatestSnapshot(room.matchId!))!.state.gameOver!.endedAtRevision,
        terminal,
      );
      const dto = await matchService.getFinishedMatchDetails(room.matchId!);
      assert.equal(dto.status, "FINISHED");
      assert(!("snapshots" in dto));
      assert(!("state" in dto));
      assert(!("rngState" in dto));
    }
    const finalOnlyService = new MatchSnapshotService(repository, { interval: 0 });
    const finalOnlyLifecycle = new MatchLifecycle(logger, matchService, finalOnlyService);
    const finalOnly = await finalOnlyLifecycle.createRoom({}, `${prefix}-final-only`);
    matchIds.push(finalOnly.matchId!);
    initializePlayers(finalOnly);
    await finalOnlyLifecycle.applyAction(finalOnly, { type: "startGame" }, "P1");
    prepareTerminal(finalOnly);
    await finalOnlyLifecycle.applyAction(finalOnly, { type: "endTurn" }, "P1");
    await finalOnlyLifecycle.close();
    assert.equal(await db.matchSnapshot.count({ where: { matchId: finalOnly.matchId! } }), 1);
    assert.equal(
      (await matches.findById(finalOnly.matchId!))!.finalRevision,
      (await finalOnlyService.loadLatestSnapshot(finalOnly.matchId!))!.revision,
    );

    // Real SQL snapshot failure preserves ended gameplay and blocks FINISHED.
    const failed = await lifecycle.createRoom({}, `${prefix}-sql-failure`);
    matchIds.push(failed.matchId!);
    initializePlayers(failed);
    await lifecycle.applyAction(failed, { type: "startGame" }, "P1");
    await lifecycle.drainActions();
    await db.$executeRawUnsafe(`CREATE FUNCTION phase10_snapshot_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."matchId" = '${failed.matchId!}'::uuid THEN RAISE EXCEPTION 'controlled snapshot failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(
      'CREATE TRIGGER phase10_snapshot_failure BEFORE INSERT ON "MatchSnapshot" FOR EACH ROW EXECUTE FUNCTION phase10_snapshot_failure()',
    );
    prepareTerminal(failed);
    assert((await lifecycle.applyAction(failed, { type: "endTurn" }, "P1")).ok);
    assert.equal(await lifecycle.drainActions(failed.matchId!), false);
    assert.equal(failed.state.phase, "ended");
    assert.equal((await matches.findById(failed.matchId!))!.status, "IN_PROGRESS");
    assert(
      await db.matchAction.findUnique({
        where: { matchId_revision: { matchId: failed.matchId!, revision: failed.revision } },
      }),
    );
    assert.equal(await finalOnlyService.loadLatestSnapshot(failed.matchId!), null);
    assert(
      errors.some((data) => (data as { code?: string }).code === "MATCH_SNAPSHOT_WRITE_FAILED"),
    );
    await lifecycle.removeRoom(failed);
    await dropTriggers();

    // Final snapshots in runtime-only test rooms never enter persistence.
    const sandbox = await lifecycle.createRoom({ roomMode: "test" }, `${prefix}-sandbox`);
    lifecycle.recordDraftAction(sandbox, { type: "draftStarted", player: "P1" });
    await lifecycle.drainActions();
    assert.equal(sandbox.matchId, null);
    assert.equal(await db.match.count({ where: { roomId: sandbox.id } }), 0);
    console.log(
      "match snapshots PostgreSQL: races, canonical conflicts, queries, version/payload validation, RNG, action ordering, terminal consistency, interval=0, SQL failure and shutdown passed",
    );
  } finally {
    await dropTriggers();
    await lifecycle.close();
    await db.match.deleteMany({ where: { id: { in: matchIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
    storeTestHooks.reset();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
