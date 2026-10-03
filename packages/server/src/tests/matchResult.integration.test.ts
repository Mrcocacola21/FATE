import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { buildServer } from "../index";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchService } from "../services/matchService";
import { extractPersistentMatchResult, type FinishedMatchInput } from "../persistence/matchResult";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { storeTestHooks } from "../store";
import { configureTestDatabase } from "./testDatabase";

async function run() {
  const url = configureTestDatabase();
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  const db = new PrismaClient({ datasources: { db: { url } } });
  const repo = new MatchRepository(db);
  const logs: object[] = [];
  const logger = { info() {}, error: (data: object) => logs.push(data) };
  const service = new MatchService(repo, logger);
  const prefix = `phase7-test-${randomUUID()}`;
  const users: string[] = [];
  const ids: string[] = [];
  const server = await buildServer({ matchPersistence: service });
  let lifecycle: MatchLifecycle | undefined;
  // Owned trigger runs only for this test's deliberately marked second participant.
  const dropTrigger = async () => {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS phase7_result_failure ON "MatchParticipant"');
    await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS phase7_result_failure()');
  };
  try {
    for (const name of ["Alice", "Bob"])
      users.push((await db.user.create({ data: { email: `${prefix}-${name}@example.test`, passwordHash: "private-password-hash",
        profile: { create: { username: `${name}_${randomUUID().slice(0, 8)}`, displayName: name } } } })).id);
    const startedAt = new Date("2026-10-02T12:00:00Z");
    const finishedAt = new Date("2026-10-02T12:03:00Z");
    const summary = { version: 1 as const, remainingUnits: 2, remainingHealth: 9 };
    const makeResult = (winner: "P1" | "P2" = "P1", legacy = false): FinishedMatchInput => {
      const loser = winner === "P1" ? "P2" : "P1";
      const userId = (seat: "P1" | "P2") => legacy ? null : users[seat === "P1" ? 0 : 1];
      return { finishedAt, finalRevision: 29, winnerSeat: winner, loserSeat: loser,
        winnerUserId: userId(winner), loserUserId: userId(loser), finishReason: "allEnemyUnitsDefeated", turnCount: 9,
        participants: (["P1", "P2"] as const).map((seat) => ({ seat, userId: userId(seat), outcome: seat === winner ? "WIN" : "LOSS",
          resultData: seat === winner ? summary : { version: 1, remainingUnits: 0, remainingHealth: 0 } })) };
    };
    const create = async (legacy = false, start = true) => {
      const { id } = await service.createWaitingMatch({ roomId: `${prefix}-${ids.length}`, seed: 7, gameMode: "standard" });
      ids.push(id);
      if (start) await service.markStarted(id, { startedAt, gameMode: "standard",
        participants: (["P1", "P2"] as const).map((seat) => ({ seat, userId: legacy ? null : users[seat === "P1" ? 0 : 1], displayNameSnapshot: seat === "P1" ? "Historical Alice" : "Historical Bob" })) });
      return id;
    };
    const id = await create();
    const result = makeResult();
    // Concurrent retries with fresh clocks return the first committed canonical result.
    const outputs = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      service.finalizeMatch(id, { ...result, finishedAt: new Date(finishedAt.getTime() + index * 1000) })));
    outputs.forEach((dto) => assert.deepEqual(dto, outputs[0]));
    const canonical = await repo.findByIdWithParticipants(id);
    assert(canonical);
    assert.equal(canonical.durationMs, canonical.finishedAt!.getTime() - startedAt.getTime());
    assert.equal(canonical.finalRevision, 29);
    assert.equal(canonical.turnCount, 9);
    assert.deepEqual(canonical.participants.map((p) => p.seat).sort(), ["P1", "P2"]);
    assert.deepEqual(canonical.participants.map((p) => p.outcome).sort(), ["LOSS", "WIN"]);
    for (const changed of [
      makeResult("P2"), { ...result, finalRevision: 30 }, { ...result, turnCount: 10 },
      { ...result, finishReason: "unknown" }, { ...result, winnerUserId: users[1] },
      { ...result, loserUserId: users[0] },
      { ...result, participants: result.participants.map((p) => ({ ...p, resultData: { ...p.resultData, remainingHealth: p.resultData.remainingHealth + 1 } })) },
      { ...result, participants: result.participants.map((p) => ({ ...p, outcome: "DRAW" as const })) },
    ]) {
      await assert.rejects(service.finalizeMatch(id, changed), /MATCH_RESULT_CONFLICT/);
      assert.deepEqual(await repo.findByIdWithParticipants(id), canonical);
    }
    const racingId = await create();
    const conflicting = await Promise.allSettled([service.finalizeMatch(racingId, makeResult()), service.finalizeMatch(racingId, makeResult("P2"))]);
    assert.equal(conflicting.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(conflicting.filter((r) => r.status === "rejected" && r.reason.code === "MATCH_RESULT_CONFLICT").length, 1);
    for (const winner of ["P1", "P2"] as const) {
      const winId = await create();
      const dto = await service.finalizeMatch(winId, makeResult(winner));
      assert.equal(dto.winner!.seat, winner);
      assert.equal(dto.winner!.userId, users[winner === "P1" ? 0 : 1]);
      assert.equal(dto.durationMs, 180000);
    }
    const drawId = await create();
    const draw: FinishedMatchInput = { ...result, winnerSeat: null, loserSeat: null, winnerUserId: null, loserUserId: null,
      finishReason: "chessMutualKingDefeat", participants: result.participants.map((p) => ({ ...p, outcome: "DRAW" })) };
    const drawDto = await service.finalizeMatch(drawId, draw);
    assert.equal(drawDto.winner, null);
    assert.equal(drawDto.loser, null);
    assert(drawDto.participants.every((p) => p.outcome === "DRAW"));
    assert.deepEqual(await service.finalizeMatch(drawId, { ...draw, finishedAt: new Date() }), drawDto);
    const legacyId = await create(true);
    await db.match.update({ where: { id: legacyId }, data: { startedAt: null } });
    const legacy = await service.finalizeMatch(legacyId, makeResult("P2", true));
    assert.equal(legacy.winner!.userId, null);
    assert.equal(legacy.loser!.userId, null);
    assert.equal(legacy.durationMs, null);
    assert(logs.some((entry) => (entry as { event?: string }).event === "match:missing_started_at"));
    const invalidId = await create();
    await assert.rejects(service.finalizeMatch(invalidId, { ...result, winnerUserId: randomUUID() }), /MATCH_RESULT_INVALID/);
    await assert.rejects(service.finalizeMatch(invalidId, { ...result, finishedAt: new Date(startedAt.getTime() - 1) }), /MATCH_RESULT_INVALID/);
    assert.equal((await repo.findById(invalidId))!.status, "IN_PROGRESS");
    assert((await repo.findParticipants(invalidId)).every((p) => p.outcome === null));
    const waitingId = await create(false, false);
    await assert.rejects(service.finalizeMatch(waitingId, result), /MATCH_INVALID_TRANSITION/);
    const cancelledId = await create(false, false);
    await service.markCancelled(cancelledId, new Date());
    await assert.rejects(service.finalizeMatch(cancelledId, result), /MATCH_INVALID_TRANSITION/);
    assert.equal((await repo.findById(cancelledId))!.durationMs, null);

    // Fail the actual second participant SQL statement, after Match and P1 updates.
    const rollbackId = await create();
    await db.matchParticipant.update({ where: { matchId_seat: { matchId: rollbackId, seat: "P2" } }, data: { displayNameSnapshot: "phase7-rollback" } });
    await db.$executeRawUnsafe(`CREATE FUNCTION phase7_result_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."displayNameSnapshot" = 'phase7-rollback' AND NEW.outcome IS NOT NULL THEN
        RAISE EXCEPTION 'phase7 controlled result write failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER phase7_result_failure BEFORE UPDATE ON "MatchParticipant" FOR EACH ROW EXECUTE FUNCTION phase7_result_failure()');
    await assert.rejects(service.finalizeMatch(rollbackId, result));
    const rolledBack = await repo.findByIdWithParticipants(rollbackId);
    assert.equal(rolledBack!.status, "IN_PROGRESS");
    for (const key of ["finishedAt", "winnerSeat", "winnerUserId", "loserSeat", "loserUserId", "durationMs", "finalRevision", "turnCount", "finishReason"] as const)
      assert.equal(rolledBack![key], null);
    assert(rolledBack!.participants.every((p) => p.outcome === null && p.resultData === null));
    await dropTrigger();
    await service.finalizeMatch(rollbackId, result);

    // Public endpoint: explicit keys, historical identity, no unsafe JSON echo.
    await db.profile.update({ where: { userId: users[0] }, data: { displayName: "New Alice" } });
    await db.matchParticipant.update({ where: { matchId_seat: { matchId: id, seat: "P1" } }, data: { resultData: { ...summary, resumeToken: "private-resume", hiddenState: { secret: "private-state" } } } });
    const response = await server.inject({ url: `/api/matches/${id}` });
    assert.equal(response.statusCode, 200, response.body);
    const dto = response.json();
    assert.equal(dto.winner.displayName, "Historical Alice");
    assert.deepEqual(Object.keys(dto).sort(), ["id", "status", "matchType", "gameMode", "createdAt", "startedAt", "finishedAt", "durationMs", "finalRevision", "turnCount", "finishReason", "winner", "loser", "participants"].sort());
    for (const p of dto.participants) assert.deepEqual(Object.keys(p).sort(), ["seat", "userId", "displayName", "outcome", "resultData", "username", "avatarUrl"].sort());
    assert.deepEqual(dto.participants[0].resultData, summary);
    for (const secret of ["email", "passwordHash", "private-", "AuthSession", "refreshToken", "connId", "resumeToken", "hiddenState", "actions", "snapshots", "preferredLanguage", "seed"])
      assert(!response.body.includes(secret), secret);
    for (const unfinishedId of [waitingId, invalidId, cancelledId]) {
      const unfinished = await server.inject({ url: `/api/matches/${unfinishedId}` });
      assert.equal(unfinished.statusCode, 409);
      assert.equal(unfinished.json().error.code, "MATCH_NOT_FINISHED");
    }
    const missing = await server.inject({ url: `/api/matches/${randomUUID()}` });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "MATCH_NOT_FOUND");
    const malformed = await server.inject({ url: "/api/matches/not-a-uuid" });
    assert.equal(malformed.statusCode, 400);
    assert.equal(malformed.json().error.code, "INVALID_REQUEST");
    // Historical finished rows remain readable, without fabricated outcome/summary.
    const historical = await create(true, false);
    await db.match.update({ where: { id: historical }, data: { status: "FINISHED", finishedAt, winnerSeat: "P1" } });
    assert.equal((await server.inject({ url: `/api/matches/${historical}` })).statusCode, 200);

    // Real PostgreSQL write failure after a terminal action: retain memory and retry the captured event.
    const runtimeService = {
      createWaitingMatch: service.createWaitingMatch.bind(service), syncParticipant: service.syncParticipant.bind(service),
      removeWaitingParticipant: service.removeWaitingParticipant.bind(service), updateWaitingGameMode: service.updateWaitingGameMode.bind(service),
      markStarted: service.markStarted.bind(service), markCancelled: service.markCancelled.bind(service), finalizeMatch: service.finalizeMatch.bind(service),
      appendAcceptedAction: service.appendAcceptedAction.bind(service),
      appendMatchSnapshot: service.appendMatchSnapshot.bind(service),
    };
    lifecycle = new MatchLifecycle(logger, runtimeService);
    const room = await lifecycle.createRoom({}, `${prefix}-runtime`);
    ids.push(room.matchId!);
    room.seats = { P1: "one", P2: "two" };
    room.seatIdentities = { P1: { userId: users[0], username: "Alice", displayName: null }, P2: { userId: users[1], username: "Bob", displayName: null } };
    room.state = { ...room.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
    assert((await lifecycle.applyAction(room, { type: "startGame" }, "P1")).ok);
    await db.matchParticipant.update({ where: { matchId_seat: { matchId: room.matchId!, seat: "P2" } }, data: { displayNameSnapshot: "phase7-rollback" } });
    await db.$executeRawUnsafe(`CREATE FUNCTION phase7_result_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."displayNameSnapshot" = 'phase7-rollback' AND NEW.outcome IS NOT NULL THEN
        RAISE EXCEPTION 'phase7 controlled result write failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER phase7_result_failure BEFORE UPDATE ON "MatchParticipant" FOR EACH ROW EXECUTE FUNCTION phase7_result_failure()');
    room.state = { ...room.state, phase: "battle", pendingRoll: null,
      ruleDeclaration: { ...room.state.ruleDeclaration, selectedRuleId: "normal_rule", setupComplete: true },
      units: Object.fromEntries(Object.entries(room.state.units).map(([unitId, u]) => [unitId, u.owner === "P2" ? { ...u, hp: 0, isAlive: false } : u])) };
    assert((await lifecycle.applyAction(room, { type: "endTurn" }, "P1")).ok);
    await lifecycle.drainActions(room.matchId!);
    assert.equal(room.state.phase, "ended");
    assert.equal((await repo.findById(room.matchId!))!.status, "IN_PROGRESS");
    const revision = room.revision;
    await dropTrigger();
    await lifecycle.retryPending();
    const stored = (await repo.findById(room.matchId!))!;
    assert.equal(stored.status, "FINISHED");
    assert.equal(stored.finalRevision, revision);
    assert.equal(room.revision, revision);
    const publicDetails = await service.getFinishedMatchDetails(room.matchId!);
    // Current profile navigation metadata is read-only and is not part of the canonical persisted result.
    const canonicalDetails = { ...publicDetails, participants: publicDetails.participants.map(({ username: _username, avatarUrl: _avatarUrl, ...participant }) => participant) };
    assert.deepEqual(await service.finalizeMatch(room.matchId!, extractPersistentMatchResult(room, new Date())), canonicalDetails);
    // Exercise the actual accepted chess terminal action, whose GameOver is null.
    const chessRoom = await lifecycle.createRoom({}, `${prefix}-chess-runtime`);
    ids.push(chessRoom.matchId!);
    chessRoom.seats = { P1: "one", P2: "two" };
    chessRoom.seatIdentities = room.seatIdentities;
    chessRoom.state = { ...chessRoom.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
    assert((await lifecycle.applyAction(chessRoom, { type: "startGame" }, "P1")).ok);
    const kings = { P1: Object.values(chessRoom.state.units).find((u) => u.owner === "P1")!.id,
      P2: Object.values(chessRoom.state.units).find((u) => u.owner === "P2")!.id };
    chessRoom.state = { ...chessRoom.state, phase: "battle", pendingRoll: null,
      ruleDeclaration: { ...chessRoom.state.ruleDeclaration, selectedRuleId: "chess_party", setupComplete: true, ruleData: { chessParty: { kings } } },
      units: Object.fromEntries(Object.entries(chessRoom.state.units).map(([unitId, u]) => [unitId,
        unitId === kings.P1 || unitId === kings.P2 ? { ...u, hp: 0, isAlive: false } : u])) };
    assert((await lifecycle.applyAction(chessRoom, { type: "endTurn" }, "P1")).ok);
    await lifecycle.drainActions(chessRoom.matchId!);
    assert.equal(chessRoom.state.phase, "ended");
    assert.equal(chessRoom.state.gameOver, null);
    const chessDetail = (await server.inject({ url: `/api/matches/${chessRoom.matchId}` })).json();
    assert.equal(chessDetail.finishReason, "chessMutualKingDefeat");
    assert.equal(chessDetail.winner, null);
    assert.equal(chessDetail.loser, null);
    assert.equal(chessDetail.finalRevision, chessRoom.revision);
    assert(chessDetail.participants.every((p: { outcome: string }) => p.outcome === "DRAW"));
    const p2Room = await lifecycle.createRoom({}, `${prefix}-p2-runtime`);
    ids.push(p2Room.matchId!);
    p2Room.seats = { P1: "one", P2: "two" };
    p2Room.seatIdentities = room.seatIdentities;
    p2Room.state = { ...p2Room.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
    assert((await lifecycle.applyAction(p2Room, { type: "startGame" }, "P1")).ok);
    p2Room.state = { ...p2Room.state, phase: "battle", pendingRoll: null, currentPlayer: "P2",
      ruleDeclaration: { ...p2Room.state.ruleDeclaration, selectedRuleId: "normal_rule", setupComplete: true },
      units: Object.fromEntries(Object.entries(p2Room.state.units).map(([unitId, u]) => [unitId,
        u.owner === "P1" ? { ...u, hp: 0, isAlive: false } : u])) };
    assert((await lifecycle.applyAction(p2Room, { type: "endTurn" }, "P2")).ok);
    await lifecycle.drainActions(p2Room.matchId!);
    assert.equal(p2Room.state.phase, "ended");
    const p2Detail = (await server.inject({ url: `/api/matches/${p2Room.matchId}` })).json();
    assert.equal(p2Detail.winner.seat, "P2");
    assert.equal(p2Detail.winner.userId, users[1]);
    assert.equal(p2Detail.loser.userId, users[0]);
    assert.equal(await db.matchAction.count({ where: { matchId: { in: ids } } }), 6);
    assert.equal(await db.matchSnapshot.count({ where: { matchId: { in: ids } } }), 3);
    for (const completed of [room, chessRoom, p2Room]) {
      const snapshot = await db.matchSnapshot.findFirstOrThrow({ where: { matchId: completed.matchId! }, orderBy: { revision: "desc" } });
      assert.equal(snapshot.revision, (await repo.findById(completed.matchId!))!.finalRevision);
      assert.equal((snapshot.state as { phase: string }).phase, "ended");
    }
    assert.equal(await db.ratingHistory.count({ where: { matchId: { in: ids } } }), 0);
    // SetNull preserves the result and historical names when an account is removed.
    await db.user.delete({ where: { id: users[0] } });
    const deleted = (await server.inject({ url: `/api/matches/${id}` })).json();
    assert.equal(deleted.winner.userId, null);
    assert.equal(deleted.winner.displayName, "Historical Alice");
    console.log("match results PostgreSQL atomicity, rollback, races, conflicts, legacy, HTTP safety and runtime retry tests passed");
  } finally {
    await dropTrigger();
    await lifecycle?.close();
    await server.close();
    await db.match.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
    storeTestHooks.reset();
  }
}
run().catch((error) => { console.error(error); process.exit(1); });
