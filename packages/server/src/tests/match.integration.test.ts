import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import WebSocket from "ws";
import { buildServer } from "../index";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchService } from "../services/matchService";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { getGameRoom, storeTestHooks, type GameRoom } from "../store";
import { enqueueRoomCommand, fateRoomKey } from "../roomQueue";
import { wsTestHooks } from "../ws";
import { configureTestDatabase } from "./testDatabase";

type Message = {
  type: string;
  code?: string;
  resumeToken?: string;
  meta?: { ready?: { P1: boolean; P2: boolean }; gameMode?: string };
};
async function connect(url: string) {
  const socket = new WebSocket(url);
  const messages: Message[] = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString()) as Message));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return { socket, messages };
}
async function until<T>(
  get: () => Promise<T | null | undefined | false> | T | null | undefined | false,
): Promise<T> {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const result = await get();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  throw new Error("Timed out waiting for integration state");
}
function victoryFixture(room: GameRoom) {
  room.state = {
    ...room.state,
    phase: "battle",
    pendingRoll: null,
    currentPlayer: "P1",
    ruleDeclaration: {
      ...room.state.ruleDeclaration,
      selectedRuleId: "normal_rule",
      setupComplete: true,
    },
    units: Object.fromEntries(
      Object.entries(room.state.units).map(([id, unit]) => [
        id,
        unit.owner === "P2" ? { ...unit, hp: 0, isAlive: false } : unit,
      ]),
    ),
  };
}

async function run() {
  const testUrl = configureTestDatabase();
  process.env.LOG_LEVEL = "silent";
  process.env.ENABLE_TEST_ROOMS = "true";
  process.env.NODE_ENV = "test";
  process.env.JWT_ACCESS_SECRET = "phase6-db-access-01234567890123456789";
  process.env.JWT_REFRESH_SECRET = "phase6-db-refresh-01234567890123456789";
  process.env.AUTH_TRUSTED_ORIGINS = "http://localhost:5173";
  const database = new PrismaClient({ datasources: { db: { url: testUrl } } });
  const repository = new MatchRepository(database);
  const service = new MatchService(repository);
  const logger = { info: () => undefined, error: () => undefined };
  const lifecycle = new MatchLifecycle(logger, service);
  const prefix = `phase5-test-${randomUUID()}`;
  const sockets: WebSocket[] = [];
  const server = await buildServer({ matchPersistence: service });
  let userId: string | undefined;
  storeTestHooks.reset();
  wsTestHooks.resetWsStateForTests();
  const extraMatchIds: string[] = [];
  const accountIds: string[] = [];
  try {
    const register = async (name: string) => {
      const response = await server.inject({ method: "POST", url: "/api/auth/register",
        headers: { origin: "http://localhost:5173" },
        payload: { email: `${prefix}-${name}@example.test`, username: `${name}_${randomUUID().slice(0, 8)}`, password: "Test-password-123!" } });
      assert.equal(response.statusCode, 201, response.body);
      const credentials = response.json() as { accessToken: string; user: { id: string } };
      accountIds.push(credentials.user.id);
      await database.profile.update({ where: { userId: credentials.user.id }, data: { displayName: name } });
      return credentials;
    };
    const alice = await register("Alice"), bob = await register("Bob");
    // Unique room creation is enforced by PostgreSQL, even outside runtime serialization.
    const input = { roomId: `${prefix}-unique`, gameMode: "standard", seed: 123 };
    const created = await Promise.all(
      Array.from({ length: 6 }, () => service.createWaitingMatch(input)),
    );
    assert(created.every((match) => match.id === created[0].id));
    assert.equal(await database.match.count({ where: { roomId: input.roomId } }), 1);
    const id = created[0].id;
    await Promise.all(
      Array.from({ length: 6 }, () =>
        service.syncParticipant(id, {
          seat: "P1",
          displayNameSnapshot: "Competitor",
          userId: null,
        }),
      ),
    );
    assert.equal((await repository.findParticipants(id)).length, 1);
    await service.syncParticipant(id, { seat: "P1", userId: alice.user.id, displayNameSnapshot: "Alice" });
    await assert.rejects(service.syncParticipant(id, { seat: "P2", userId: alice.user.id, displayNameSnapshot: "Duplicate User" }),
      (error: unknown) => (error as { code?: string }).code === "P2002");
    assert.equal((await repository.findParticipants(id)).length, 1);
    await assert.rejects(
      database.matchParticipant.create({
        data: {
          matchId: id,
          seat: "P1",
          displayNameSnapshot: "Duplicate",
        },
      }),
      (error: unknown) => (error as { code?: string }).code === "P2002",
    );

    // Nullable identity preserves participant records when a genuinely linked User is removed.
    const user = await database.user.create({ data: { email: `${prefix}@example.test` } });
    userId = user.id;
    await service.syncParticipant(id, { seat: "P2", displayNameSnapshot: "Verified", userId });
    await database.user.delete({ where: { id: userId } });
    userId = undefined;
    assert.equal(
      (await repository.findParticipants(id)).find((p) => p.seat === "P2")?.userId,
      null,
    );

    const startedAt = new Date();
    const start = {
      gameMode: "classic",
      startedAt,
      participants: [
        { seat: "P1" as const, displayNameSnapshot: "Final P1", userId: null },
        { seat: "P2" as const, displayNameSnapshot: "Final P2", userId: null },
      ],
    };
    await Promise.all([service.markStarted(id, start), service.markStarted(id, start)]);
    assert.equal((await repository.findById(id))?.startedAt?.getTime(), startedAt.getTime());
    assert.equal((await repository.findById(id))?.gameMode, "classic");
    await service.syncParticipant(id, {
      seat: "P1",
      displayNameSnapshot: "Intruder",
      userId: null,
    });
    assert.equal((await repository.findParticipants(id))[0].displayNameSnapshot, "Final P1");
    const result = {
      finishedAt: new Date(),
      finalRevision: 19,
      winnerSeat: "P1" as const,
      winnerUserId: null,
      loserSeat: "P2" as const,
      loserUserId: null,
      turnCount: 7,
      participants: [
        { seat: "P1" as const, userId: null, outcome: "WIN" as const, resultData: { version: 1 as const, remainingUnits: 4, remainingHealth: 12 } },
        { seat: "P2" as const, userId: null, outcome: "LOSS" as const, resultData: { version: 1 as const, remainingUnits: 0, remainingHealth: 0 } },
      ],
      finishReason: "allEnemyUnitsDefeated",
    };
    await Promise.all([service.finalizeMatch(id, result), service.finalizeMatch(id, result)]);
    await assert.rejects(service.finalizeMatch(id, { ...result, winnerSeat: "P2" }), /MATCH_RESULT_CONFLICT/);
    await assert.rejects(service.markStarted(id, start), /Invalid/);
    await assert.rejects(service.markCancelled(id, new Date()), /waiting/);
    assert.equal((await repository.findById(id))?.status, "FINISHED");
    assert.equal(
      (await repository.findById(id))?.finishedAt?.getTime(),
      result.finishedAt.getTime(),
    );
    assert.equal((await repository.findParticipants(id)).length, 2);
    const cancelled = await service.createWaitingMatch({
      roomId: `${prefix}-cancelled`,
      gameMode: "standard",
      seed: 2,
    });
    await Promise.all([
      service.markCancelled(cancelled.id, new Date()),
      service.markCancelled(cancelled.id, new Date()),
    ]);
    assert.equal((await repository.findById(cancelled.id))?.status, "CANCELLED");
    await assert.rejects(service.markStarted(cancelled.id, start), /Invalid/);
    await assert.rejects(
      service.createWaitingMatch({ roomId: `${prefix}-cancelled`, gameMode: "standard", seed: 2 }),
      /already linked/,
    );

    // Run the real HTTP and WebSocket room flow against the real repository/service/database.
    const address = await server.listen({ port: 0, host: "127.0.0.1" });
    const forgedCreator = await server.inject({
      method: "POST",
      url: "/rooms",
      payload: { seed: 876, gameMode: "standard", userId: randomUUID() },
    });
    assert.equal(forgedCreator.statusCode, 400);
    assert.equal(forgedCreator.json().error.code, "VALIDATION_ERROR");
    const response = await server.inject({
      method: "POST", url: "/rooms", payload: { seed: 876, gameMode: "standard" },
    });
    assert.equal(response.statusCode, 201);
    const actualRoomId: string = response.json().roomId;
    const room = getGameRoom(actualRoomId)!;
    assert(room.matchId && room.matchId !== room.id);
    extraMatchIds.push(room.matchId);
    const match = await repository.findById(room.matchId);
    assert.equal(match?.status, "WAITING");
    assert.equal(match?.roomId, actualRoomId);
    assert.equal(match?.seed, room.seed);
    assert.equal(match?.gameMode, "standard");
    assert.equal(match?.createdById, null);
    assert.equal(
      (await server.inject({ url: "/rooms" }))
        .json()
        .some((r: { id: string }) => r.id === actualRoomId),
      true,
    );

    const legacy = await server.inject({
      method: "POST",
      url: "/api/games",
      payload: { seed: 987, gameMode: "classic" },
    });
    assert.equal(legacy.statusCode, 201);
    const legacyRoom = getGameRoom(legacy.json().gameId)!;
    extraMatchIds.push(legacyRoom.matchId!);
    assert.equal((await repository.findById(legacyRoom.matchId!))?.roomId, legacyRoom.id);
    assert.equal((await repository.findById(legacyRoom.matchId!))?.seed, 987);
    assert.equal((await repository.findById(legacyRoom.matchId!))?.gameMode, "classic");

    const wsUrl = address.replace("http:", "ws:") + "/ws";
    const p1 = await connect(wsUrl);
    sockets.push(p1.socket);
    const p2 = await connect(wsUrl);
    sockets.push(p2.socket);
    const spectator = await connect(wsUrl);
    sockets.push(spectator.socket);
    p1.socket.send(
      JSON.stringify({
        type: "joinRoom",
        mode: "join",
        roomId: actualRoomId,
        role: "P1",
        name: "Alice",
        accessToken: alice.accessToken,
        userId: randomUUID(),
      }),
    );
    p2.socket.send(
      JSON.stringify({
        type: "joinRoom",
        mode: "join",
        roomId: actualRoomId,
        role: "P2",
        name: "Bob",
        accessToken: bob.accessToken,
      }),
    );
    spectator.socket.send(
      JSON.stringify({
        type: "joinRoom",
        mode: "join",
        roomId: actualRoomId,
        role: "spectator",
        name: "Observer",
      }),
    );
    const ack = await until(() => p1.messages.find((m) => m.type === "joinAck"));
    await until(() => p2.messages.find((m) => m.type === "joinAck"));
    await until(() => spectator.messages.find((m) => m.type === "joinAck"));
    let participants = await repository.findParticipants(room.matchId);
    assert.deepEqual(
      participants.map((p) => [p.seat, p.displayNameSnapshot, p.userId]),
      [
        ["P1", "Alice", alice.user.id],
        ["P2", "Bob", bob.user.id],
      ],
    );
    const participantId = participants[0].id;

    p1.socket.send(JSON.stringify({ type: "startGame" }));
    await until(() => p1.messages.find((m) => m.type === "error" && m.code === "not_ready"));
    assert.equal((await repository.findById(room.matchId))?.status, "WAITING");
    assert.equal(await database.matchAction.count({ where: { matchId: room.matchId } }), 0, "rejected start and lobby joins are not journal actions");
    p1.socket.send(JSON.stringify({ type: "setGameMode", mode: "classic" }));
    await until(async () => (await repository.findById(room.matchId!))?.gameMode === "classic");

    p1.socket.close();
    await until(() => wsTestHooks.hasSeatGraceToken(ack.resumeToken!));
    const resumed = await connect(wsUrl);
    sockets.push(resumed.socket);
    resumed.socket.send(
      JSON.stringify({
        type: "joinRoom",
        mode: "join",
        roomId: actualRoomId,
        role: "P1",
        name: "Alice",
        resumeToken: ack.resumeToken,
        accessToken: alice.accessToken,
      }),
    );
    await until(() => resumed.messages.find((m) => m.type === "joinAck"));
    participants = await repository.findParticipants(room.matchId);
    assert.equal(participants.length, 2);
    assert.equal(participants[0].id, participantId);
    resumed.socket.send(JSON.stringify({ type: "setReady", ready: true }));
    p2.socket.send(JSON.stringify({ type: "setReady", ready: true }));
    await until(() =>
      resumed.messages.find((m) => m.type === "roomState" && m.meta?.ready?.P1 && m.meta.ready.P2),
    );
    resumed.socket.send(JSON.stringify({ type: "startGame" }));
    await until(async () => (await repository.findById(room.matchId!))?.status === "IN_PROGRESS");
    assert((await repository.findById(room.matchId))?.startedAt);
    assert.equal(room.state.phase, "lobby", "initiative is a started match before placement");
    assert(room.state.pendingRoll);
    await until(async () => (await database.matchAction.count({ where: { matchId: room.matchId! } })) === room.revision);
    const countBeforeSpectator = await database.matchAction.count({ where: { matchId: room.matchId } });
    spectator.socket.send(JSON.stringify({ type: "action", action: { type: "endTurn" } }));
    await until(() => spectator.messages.find((message) => message.type === "actionResult"));
    const countAfterSpectator = await database.matchAction.count({ where: { matchId: room.matchId } });
    assert.equal(countAfterSpectator, countBeforeSpectator, "spectator command cannot append an action");
    assert.equal((await server.inject({ url: `/api/matches/${room.matchId}/actions`, headers: { authorization: `Bearer ${alice.accessToken}` } })).statusCode, 409);
    const pending = room.state.pendingRoll!;
    const acting = pending.player === "P1" ? resumed : p2;
    acting.socket.send(JSON.stringify({ type: "resolvePendingRoll", pendingRollId: pending.id }));
    const revision = room.revision;
    await until(() => room.revision > revision);

    await enqueueRoomCommand(fateRoomKey(room.id), () => victoryFixture(room));
    resumed.socket.send(JSON.stringify({ type: "action", action: { type: "endTurn" } }));
    const finished = await until(async () => {
      const m = await repository.findById(room.matchId!);
      return m?.status === "FINISHED" ? m : null;
    });
    assert.equal(finished.winnerSeat, "P1");
    assert.equal(finished.winnerUserId, alice.user.id);
    assert.equal(finished.loserUserId, bob.user.id);
    assert.equal(finished.loserSeat, "P2");
    assert.equal(finished.durationMs, finished.finishedAt!.getTime() - finished.startedAt!.getTime());
    assert.equal(finished.turnCount, room.state.gameOver!.endedAtTurn);
    assert.deepEqual((await repository.findParticipants(room.matchId)).map((p) => p.outcome), ["WIN", "LOSS"]);
    const detail = await server.inject({ url: `/api/matches/${room.matchId}` });
    assert.equal(detail.statusCode, 200, detail.body);
    assert.equal(detail.json().winner.userId, alice.user.id);
    assert.equal(detail.json().loser.userId, bob.user.id);
    const actionsResponse = await server.inject({ url: `/api/matches/${room.matchId}/actions`, headers: { authorization: `Bearer ${alice.accessToken}` } });
    assert.equal(actionsResponse.statusCode, 200, actionsResponse.body);
    const journal = await database.matchAction.findMany({ where: { matchId: room.matchId }, orderBy: { revision: "asc" } });
    assert.equal(journal.length, 6, "mode, two readiness actions, start, roll and terminal turn; reconnect appends nothing");
    assert.equal(new Set(journal.map((action) => action.revision)).size, journal.length);
    assert.equal(journal[0].actorUserId, alice.user.id);
    assert.equal(journal[0].actorSeat, "P1");
    const initiativeAction = journal.find((action) => action.actionType === "resolvePendingRoll")!;
    assert.equal(initiativeAction.actorUserId, pending.player === "P1" ? alice.user.id : bob.user.id);
    assert.equal(initiativeAction.actorSeat, pending.player);
    assert.deepEqual(actionsResponse.json().actions.map((action: { revision: number }) => action.revision), journal.map((action) => action.revision));
    for (const secret of [alice.accessToken, bob.accessToken, ack.resumeToken!, "connId", "passwordHash", "email", "pendingRollId"])
      assert(!actionsResponse.body.includes(secret), secret);
    await database.profile.update({ where: { userId: alice.user.id }, data: { displayName: "Renamed" } });
    assert.equal((await server.inject({ url: `/api/matches/${room.matchId}` })).json().winner.displayName, "Alice");
    assert.equal(finished.finishReason, "allEnemyUnitsDefeated");
    assert.equal(finished.finalRevision, room.revision);
    assert.equal(finished.finalRevision, room.state.gameOver?.endedAtRevision);
    assert(finished.finishedAt);
    p2.socket.send(JSON.stringify({ type: "leaveRoom" }));
    await until(() => p2.messages.find((m) => m.type === "leftRoom"));
    assert.equal((await repository.findParticipants(room.matchId)).length, 2);
    assert((await database.matchAction.count({ where: { matchId: room.matchId } })) > 0);
    assert.equal((await database.matchAction.findFirst({ where: { matchId: room.matchId }, orderBy: { revision: "desc" } }))?.revision, finished.finalRevision);
    assert.equal(await database.matchSnapshot.count({ where: { matchId: room.matchId } }), 1);
    assert.equal((await database.matchSnapshot.findFirstOrThrow({ where: { matchId: room.matchId }, orderBy: { revision: "desc" } })).revision, finished.finalRevision);
    for (const field of ["snapshots", "rngState", "knowledge", "lastKnownPositions"]) assert(!detail.body.includes(field), field);

    const beforeSandbox = await database.match.count();
    const sandbox = await server.inject({
      method: "POST",
      url: "/rooms",
      payload: { roomMode: "test" },
    });
    assert.equal(sandbox.statusCode, 201);
    assert.equal(getGameRoom(sandbox.json().roomId)?.matchId, null);
    assert.equal(await database.match.count(), beforeSandbox);

    const creator = await connect(wsUrl);
    await database.profile.update({ where: { userId: alice.user.id }, data: { displayName: "Creator" } });
    sockets.push(creator.socket);
    const wsRoomId = `${prefix}-ws-created`;
    creator.socket.send(
      JSON.stringify({
        type: "joinRoom",
        mode: "create",
        roomId: wsRoomId,
        role: "P1",
        name: "Creator",
        accessToken: alice.accessToken,
      }),
    );
    await until(() => creator.messages.find((m) => m.type === "joinAck"));
    assert.equal((await repository.findByRoomId(wsRoomId))?.status, "WAITING");
    assert.equal((await repository.findByRoomId(wsRoomId))?.createdById, alice.user.id);
    assert.equal(
      (await repository.findParticipants(getGameRoom(wsRoomId)!.matchId!))[0].displayNameSnapshot,
      "Creator",
    );

    // Cleanup closes removed waiting/active rooms neutrally, retaining diagnostic history.
    const waitingRoom = await lifecycle.createRoom({}, `${prefix}-ttl`);
    waitingRoom.lastActivityAt = 0;
    const playing = await lifecycle.createRoom({}, `${prefix}-active-ttl`);
    playing.seats = { P1: "a", P2: "b" };
    playing.seatIdentities = {
      P1: { userId: alice.user.id, username: "Alice", displayName: null },
      P2: { userId: bob.user.id, username: "Bob", displayName: null },
    };
    playing.state = {
      ...playing.state,
      seats: { P1: true, P2: true },
      playersReady: { P1: true, P2: true },
    };
    await lifecycle.applyAction(playing, { type: "startGame" }, "P1");
    playing.lastActivityAt = 0;
    await lifecycle.cleanup({
      now: Date.now(),
      roomTtlMs: 1000,
      activeRoomIds: wsTestHooks.getActiveFateRoomIds(),
    });
    assert.equal((await repository.findById(waitingRoom.matchId!))?.status, "CANCELLED");
    const expired = await repository.findById(playing.matchId!);
    assert.equal(expired?.status, "CANCELLED");
    assert.equal(expired?.finishReason, "SERVER_ROOM_EXPIRED");
    assert.equal(expired?.winnerUserId, null);
    assert.equal(expired?.finalRevision, null);
    assert((await repository.findParticipants(playing.matchId!)).every(p => p.outcome === null));
    console.log(
      "match PostgreSQL service, concurrency, HTTP and WebSocket integration tests passed",
    );
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
    await lifecycle.close();
    wsTestHooks.resetWsStateForTests();
    storeTestHooks.reset();
    await database.match.deleteMany({
      where: { OR: [{ roomId: { startsWith: prefix } }, { id: { in: extraMatchIds } }] },
    });
    if (userId) await database.user.deleteMany({ where: { id: userId } });
    await database.user.deleteMany({ where: { id: { in: accountIds } } });
    await database.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
