import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, type MatchAction, type PrismaClient } from "@prisma/client";
import { MatchActionRepository, MatchActionConflict } from "../repositories/matchActionRepository";
import { MatchActionQueue } from "../persistence/matchActionQueue";
import { toPersistedAction, toPersistedEvents, type AcceptedActionRecord } from "../persistence/acceptedAction";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { MatchActionService, toActionHistoryDto } from "../services/matchActionService";
import { buildServer } from "../index";
import { MemoryMatchPersistence, testIdentityService, testAccessToken } from "./matchTestSupport";
import { createGameRoom, storeTestHooks } from "../store";
import type { DetailedMatch } from "../repositories/matchRepository";

const logs: object[] = [];
const logger = { info() {}, error: (data: object) => logs.push(data) };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
function record(matchId = randomUUID(), revision = 1): AcceptedActionRecord {
  return { matchId, revision, actorSeat: "P1", actorUserId: randomUUID(), actionType: "endTurn",
    actionPayload: { type: "endTurn" }, events: [], createdAt: new Date() };
}
function row(input: AcceptedActionRecord): MatchAction {
  return { ...input, id: randomUUID(), actionPayload: input.actionPayload as Prisma.JsonObject,
    events: input.events as Prisma.JsonArray };
}
function dbError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("controlled database error", { code, clientVersion: "6.19.0" });
}

async function queueTests() {
  const first = record();
  const gate = deferred();
  const entered = deferred();
  const writes: string[] = [];
  const queue = new MatchActionQueue({ appendAcceptedAction: async (action) => {
    if (action.matchId === first.matchId && action.revision === 1) { entered.resolve(); await gate.promise; }
    writes.push(`${action.matchId}:${action.revision}`);
  } }, logger);
  queue.enqueue(first, "room-a");
  queue.enqueue({ ...first, revision: 2 }, "room-a");
  await entered.promise;
  const other = record();
  queue.enqueue(other, "room-b");
  assert(await queue.drain(other.matchId));
  assert.deepEqual(writes, [`${other.matchId}:1`], "another match persists independently");
  assert.equal(queue.pendingCount, 2);
  gate.resolve();
  assert(await queue.drain());
  assert.deepEqual(writes.slice(1), [`${first.matchId}:1`, `${first.matchId}:2`]);
  assert.equal(queue.activeMatches, 0);
  assert.equal(queue.pendingCount, 0);

  let attempts = 0;
  const retry = new MatchActionQueue({ appendAcceptedAction: async () => {
    if (++attempts < 3) throw dbError("P1001");
  } }, logger, { backoffMs: 0 });
  retry.enqueue(first, "room");
  assert(await retry.drain());
  assert.equal(attempts, 3);
  for (const failure of [dbError("P2003"), dbError("P1001"), new MatchActionConflict()]) {
    attempts = 0;
    const broken = new MatchActionQueue({ appendAcceptedAction: async () => { attempts++; throw failure; } }, logger, { backoffMs: 0 });
    broken.enqueue(first, "room");
    broken.enqueue({ ...first, revision: 2 }, "room");
    assert.equal(await broken.drain(first.matchId), false);
    assert.equal(attempts, failure instanceof Prisma.PrismaClientKnownRequestError && failure.code === "P1001" ? 3 : 1);
    broken.release(first.matchId);
    assert.equal(broken.failed(first.matchId), false);
  }
  const slow = deferred();
  const bounded = new MatchActionQueue({ appendAcceptedAction: () => slow.promise }, logger, { maxPending: 1, drainTimeoutMs: 1 });
  bounded.enqueue(first, "room");
  await Promise.resolve();
  assert.equal(await bounded.drain(), false, "bounded shutdown reports a stalled write");
  bounded.enqueue({ ...first, revision: 2 }, "room");
  assert(bounded.failed(first.matchId));
  slow.resolve();
  await bounded.drain();
  assert.equal(bounded.activeMatches, 0);
}

async function repositoryTests() {
  let canonical: MatchAction | null = null;
  let reads = 0;
  const input = record();
  const repository = new MatchActionRepository({ matchAction: {
    create: async ({ data }: { data: AcceptedActionRecord }) => {
      if (canonical) throw dbError("P2002");
      canonical = row(data);
      return canonical;
    },
    findUnique: async () => { reads++; return canonical; },
    findMany: async (args: unknown) => { assert.deepEqual(args, {
      where: { matchId: input.matchId, revision: { gt: 5 } }, orderBy: { revision: "asc" }, take: 11,
    }); return []; },
  } } as unknown as PrismaClient);
  await repository.appendAcceptedAction(input);
  assert.equal(reads, 0, "ordinary append performs no history read");
  await repository.appendAcceptedAction({ ...input, createdAt: new Date(0) });
  const original = structuredClone(canonical);
  for (const change of [
    { actionType: "move" }, { actorSeat: "P2" as const }, { actorUserId: randomUUID() },
    { actionPayload: { type: "endTurn", different: true } }, { events: [{ type: "different" }] },
  ]) await assert.rejects(repository.appendAcceptedAction({ ...input, ...change }), MatchActionConflict);
  assert.deepEqual(canonical, original);
  await repository.findByMatchIdOrdered(input.matchId, 5, 11);
}

async function runtimeTests() {
  const memory = new MemoryMatchPersistence();
  const lifecycle = new MatchLifecycle(logger, memory);
  const room = await lifecycle.createRoom();
  room.seats = { P1: "one", P2: "two" };
  room.seatIdentities = {
    P1: { userId: randomUUID(), username: "Alice", displayName: null },
    P2: { userId: randomUUID(), username: "Bob", displayName: null },
  };
  room.state = { ...room.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
  const blocked = deferred();
  const append = memory.appendAcceptedAction.bind(memory);
  memory.appendAcceptedAction = async (action) => { await blocked.promise; await append(action); };
  assert((await lifecycle.applyAction(room, { type: "startGame" }, "P1")).ok);
  assert(room.state.pendingRoll, "accepted state is visible while DB write remains blocked");
  assert.equal(memory.actions.size, 0);
  assert.equal(lifecycle.actionQueue.pendingCount, 1);
  const firstRoll = room.state.pendingRoll!;
  assert(!(await lifecycle.applyAction(room, { type: "resolvePendingRoll", pendingRollId: "wrong", player: firstRoll.player }, firstRoll.player)).ok);
  assert.equal(lifecycle.actionQueue.pendingCount, 1);
  const forged = { type: "resolvePendingRoll" as const, pendingRollId: firstRoll.id, player: firstRoll.player === "P1" ? "P2" as const : "P1" as const };
  assert((await lifecycle.applyAction(room, forged, firstRoll.player)).ok);
  const previousLimit = process.env.MAX_LOG_EVENTS;
  process.env.MAX_LOG_EVENTS = "1";
  try {
    for (const type of ["draftStarted", "draftBanHero", "draftPickHero"] as const)
      lifecycle.recordDraftAction(room, { type, player: "P1", heroId: type === "draftStarted" ? undefined : "hero" });
    assert.equal(room.actionLog.length, 1);
    blocked.resolve();
    assert(await lifecycle.drainActions(room.matchId!));
    assert.equal(memory.actions.size, 5, "durable history survives runtime truncation");
    const roll = [...memory.actions.values()].find((a) => a.actionType === "resolvePendingRoll")!;
    assert.equal(roll.actorUserId, room.seatIdentities[firstRoll.player]!.userId);
    assert.equal(roll.actorSeat, firstRoll.player);
    assert.equal(roll.actionPayload.player, firstRoll.player);
    assert(roll.events.length > 0, "authoritative roll results are retained");
    const revision = room.revision;
    lifecycle.recordAcceptedAction(room);
    await lifecycle.drainActions();
    assert.equal(memory.actions.size, 5, "equivalent duplicate callback is idempotent");
    assert.equal(room.revision, revision);
    const sandbox = createGameRoom({ roomMode: "test" });
    lifecycle.recordDraftAction(sandbox, { type: "draftStarted", player: "P1" });
    assert.equal(sandbox.actionLog.length, 1);
    assert.equal(memory.actions.size, 5);
    room.state = { ...room.state, phase: "battle", pendingRoll: null,
      ruleDeclaration: { ...room.state.ruleDeclaration, selectedRuleId: "normal_rule", setupComplete: true },
      units: Object.fromEntries(Object.entries(room.state.units).map(([id, u]) => [id, u.owner === "P2" ? { ...u, hp: 0, isAlive: false } : u])) };
    const terminalGate = deferred();
    memory.appendAcceptedAction = async (action) => { await terminalGate.promise; await append(action); };
    assert((await lifecycle.applyAction(room, { type: "endTurn" }, "P1")).ok);
    assert.equal(room.state.phase, "ended");
    assert.equal(memory.matches.get(room.matchId!)!.status, "IN_PROGRESS", "result waits for terminal journal write");
    terminalGate.resolve();
    assert(await lifecycle.drainActions(room.matchId!));
    const match = memory.matches.get(room.matchId!)!;
    assert.equal(match.status, "FINISHED");
    assert.equal(Math.max(...[...memory.actions.values()].map((a) => a.revision)), match.result!.finalRevision);
    await lifecycle.removeRoom(room);
    assert.equal(lifecycle.actionQueue.activeMatches, 0);
  } finally {
    blocked.resolve();
    if (previousLimit === undefined) delete process.env.MAX_LOG_EVENTS; else process.env.MAX_LOG_EVENTS = previousLimit;
    await lifecycle.close();
  }

  const broken = new MemoryMatchPersistence();
  broken.appendAcceptedAction = async () => { throw dbError("P2003"); };
  const failed = new MatchLifecycle(logger, broken);
  const failedRoom = await failed.createRoom();
  failedRoom.seats = room.seats;
  failedRoom.seatIdentities = room.seatIdentities;
  failedRoom.state = { ...failedRoom.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
  await failed.applyAction(failedRoom, { type: "startGame" }, "P1");
  failedRoom.state = { ...room.state, phase: "battle", gameOver: null };
  assert((await failed.applyAction(failedRoom, { type: "endTurn" }, "P1")).ok);
  await failed.drainActions();
  await failed.retryPending();
  assert.equal(failedRoom.state.phase, "ended");
  assert.equal(broken.matches.get(failedRoom.matchId!)!.status, "IN_PROGRESS", "failed journal cannot publish complete result");
  await failed.removeRoom(failedRoom);
  await failed.close();
}

async function apiTests() {
  const input = record();
  const unsafe = row({ ...input, events: [{ type: "turnStarted", player: "P1", turnNumber: 2, resumeToken: "SECRET" },
    { type: "unitMoved", unitId: "hidden-unit", to: { row: 4, col: 1 } }], actionPayload: { type: "useAbility", payload: { secret: "SECRET" } } });
  const projected = toActionHistoryDto(unsafe, "Historical Alice");
  assert.deepEqual(projected.payload, { type: "endTurn" });
  assert.deepEqual(projected.events, [{ type: "turnStarted", player: "P1", turnNumber: 2 }]);
  assert(!JSON.stringify(projected).includes("SECRET"));
  assert(!JSON.stringify(projected).includes("hidden-unit"));
  let status = "FINISHED";
  const history = new MatchActionService({ findByIdWithParticipants: async (id) => id === input.matchId ? {
    id, status, participants: [{ seat: "P1", displayNameSnapshot: "Historical Alice" }],
  } as DetailedMatch : null }, { findByMatchIdOrdered: async (_id, after = 0, limit = 100) => {
    assert.equal(limit, 2);
    return [unsafe, row({ ...input, revision: 3 })].filter((action) => action.revision > after);
  } });
  const server = await buildServer({ matchPersistence: new MemoryMatchPersistence(), connectionIdentity: testIdentityService(), actionHistory: history });
  try {
    const url = `/api/matches/${input.matchId}/actions?limit=1`;
    assert.equal((await server.inject({ url })).statusCode, 401);
    assert.equal((await server.inject({ url, headers: { authorization: "Bearer invalid" } })).statusCode, 401);
    const headers = { authorization: `Bearer ${testAccessToken("P1")}` };
    const response = await server.inject({ url, headers });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.json().actions[0].actor.displayName, "Historical Alice");
    assert.equal(response.json().nextRevisionAfter, 1);
    assert(!response.body.includes("SECRET"));
    assert.equal((await server.inject({ url: url + "&revisionAfter=1", headers })).json().actions[0].revision, 3);
    for (const next of ["WAITING", "IN_PROGRESS", "CANCELLED"]) {
      status = next;
      const result = await server.inject({ url, headers });
      assert.equal(result.statusCode, 409);
      assert.equal(result.json().error.code, "MATCH_NOT_FINISHED");
    }
    const missing = await server.inject({ url: `/api/matches/${randomUUID()}/actions`, headers });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().error.code, "MATCH_NOT_FOUND");
    for (const invalid of ["not-id/actions", `${input.matchId}/actions?limit=501`, `${input.matchId}/actions?revisionAfter=-1`, `${input.matchId}/actions?limit=oops`])
      assert.equal((await server.inject({ url: `/api/matches/${invalid}`, headers })).statusCode, 400);
  } finally { await server.close(); }
}

async function run() {
  process.env.LOG_LEVEL = "silent";
  storeTestHooks.reset();
  const payload = toPersistedAction({ type: "useAbility", unitId: "unit", abilityId: "ability", accessToken: "SECRET",
    payload: { targetId: "target", nested: { resume_token: "SECRET", authorization: "SECRET", connId: "SECRET", userId: "fake", valid: 3 } } });
  assert.deepEqual(payload, { type: "useAbility", unitId: "unit", abilityId: "ability", payload: { targetId: "target", nested: { valid: 3 } } });
  assert.throws(() => toPersistedAction({ type: "useAbility", unitId: "unit", abilityId: "ability", payload: new Map() }), /MATCH_ACTION_INVALID_JSON/);
  const event = { type: "turnStarted" as const, player: "P1" as const, turnNumber: 2, chainId: "ui-chain" };
  assert.deepEqual(toPersistedEvents([event]), [{ type: "turnStarted", player: "P1", turnNumber: 2 }]);
  await queueTests();
  await repositoryTests();
  await runtimeTests();
  await apiTests();
  storeTestHooks.reset();
  console.log("persistent action log queue, retries, conflicts, sanitization, runtime, terminal consistency and HTTP tests passed");
}
run().catch((error) => { console.error(error); process.exit(1); });
