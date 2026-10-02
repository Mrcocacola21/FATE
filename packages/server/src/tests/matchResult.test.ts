import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyRuleDeclarationWinChecks } from "rules";
import { createGameRoom, storeTestHooks } from "../store";
import { extractPersistentMatchResult, mapGameEndReasonToMatchFinishReason, safeParticipantResultData, MatchResultError } from "../persistence/matchResult";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { MemoryMatchPersistence } from "./matchTestSupport";

async function run() {
  storeTestHooks.reset();
  const room = createGameRoom({ seed: 5 });
  room.matchId = randomUUID();
  room.seatIdentities = {
    P1: { userId: randomUUID(), username: "Alice", displayName: null },
    P2: { userId: randomUUID(), username: "Bob", displayName: null },
  };
  room.revision = 24;
  const finishedAt = new Date("2026-10-02T12:30:00Z");
  for (const winner of ["P1", "P2"] as const) {
    const loser = winner === "P1" ? "P2" : "P1";
    room.state = { ...room.state, phase: "ended", turnNumber: 11,
      gameOver: { winnerPlayerId: winner, loserPlayerId: loser, reason: "allEnemyUnitsDefeated", endedAtRevision: 24, endedAtTurn: 11 } };
    const result = extractPersistentMatchResult(room, finishedAt);
    assert.equal(result.winnerSeat, winner);
    assert.equal(result.loserSeat, loser);
    assert.equal(result.winnerUserId, room.seatIdentities[winner]!.userId);
    assert.equal(result.loserUserId, room.seatIdentities[loser]!.userId);
    assert.equal(result.finishedAt, finishedAt);
    assert.equal(result.finalRevision, 24);
    assert.equal(result.turnCount, 11);
    for (const participant of result.participants) {
      const alive = Object.values(room.state.units).filter((u) => u.owner === participant.seat && u.isAlive);
      assert.deepEqual(participant.resultData, { version: 1, remainingUnits: alive.length,
        remainingHealth: alive.reduce((sum, u) => sum + Math.max(0, u.hp), 0) });
      assert.equal(participant.outcome, participant.seat === winner ? "WIN" : "LOSS");
    }
  }
  room.state.gameOver!.endedAtTurn = undefined;
  assert.equal(extractPersistentMatchResult(room, finishedAt).turnCount, null);
  room.state.gameOver!.endedAtRevision = 23;
  assert.throws(() => extractPersistentMatchResult(room, finishedAt), /MATCH_RESULT_INVALID/);
  room.state.gameOver = null;
  assert.throws(() => extractPersistentMatchResult(room, finishedAt), /MATCH_RESULT_INVALID/);
  const p1 = Object.values(room.state.units).find((u) => u.owner === "P1")!;
  const p2 = Object.values(room.state.units).find((u) => u.owner === "P2")!;
  room.state = { ...room.state, phase: "battle",
    ruleDeclaration: { ...room.state.ruleDeclaration, selectedRuleId: "chess_party", setupComplete: true,
      ruleData: { chessParty: { kings: { P1: p1.id, P2: p2.id } } } },
    units: { ...room.state.units, [p1.id]: { ...p1, isAlive: false, hp: 0 }, [p2.id]: { ...p2, isAlive: false, hp: 0 } } };
  const draw = applyRuleDeclarationWinChecks(room.state, []);
  assert.equal(draw.state.phase, "ended");
  assert(draw.events.some((event) => event.type === "gameDraw"));
  room.state = draw.state;
  const result = extractPersistentMatchResult(room, finishedAt);
  assert.equal(result.winnerSeat, null);
  assert.equal(result.loserSeat, null);
  assert.equal(result.winnerUserId, null);
  assert.equal(result.loserUserId, null);
  assert.equal(result.finishReason, "chessMutualKingDefeat");
  assert(result.participants.every((p) => p.outcome === "DRAW"));
  room.roomMode = "test";
  assert.throws(() => extractPersistentMatchResult(room, finishedAt), /MATCH_RESULT_INVALID/);
  assert.equal(mapGameEndReasonToMatchFinishReason("unknown"), "unknown");
  for (const reason of ["disconnect", "surrender", "debug"] as const)
    assert.throws(() => mapGameEndReasonToMatchFinishReason(reason), /MATCH_RESULT_INVALID/);
  assert.deepEqual(safeParticipantResultData({ version: 1, remainingUnits: 2, remainingHealth: 8, secret: "hidden" }),
    { version: 1, remainingUnits: 2, remainingHealth: 8 });
  assert.equal(safeParticipantResultData({ version: 2, remainingUnits: 2, remainingHealth: 8 }), null);

  // Permanent result errors stop retries while the accepted terminal state remains.
  const persistence = new MemoryMatchPersistence();
  let attempts = 0;
  let permanent = true;
  const errors: object[] = [];
  const lifecycle = new MatchLifecycle({ info() {}, error: (data) => errors.push(data) }, {
    createWaitingMatch: persistence.createWaitingMatch.bind(persistence),
    syncParticipant: persistence.syncParticipant.bind(persistence),
    removeWaitingParticipant: persistence.removeWaitingParticipant.bind(persistence),
    updateWaitingGameMode: persistence.updateWaitingGameMode.bind(persistence),
    markStarted: persistence.markStarted.bind(persistence), markCancelled: persistence.markCancelled.bind(persistence),
    finalizeMatch: async () => {
      attempts++;
      if (permanent) throw new MatchResultError("MATCH_RESULT_CONFLICT");
      throw new Error("Temporary database outage");
    },
  });
  const competitive = await lifecycle.createRoom();
  competitive.seats = { P1: "one", P2: "two" };
  competitive.seatIdentities = room.seatIdentities;
  competitive.state = { ...competitive.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
  assert((await lifecycle.applyAction(competitive, { type: "startGame" }, "P1")).ok);
  competitive.state = { ...competitive.state, phase: "battle", pendingRoll: null,
    ruleDeclaration: { ...competitive.state.ruleDeclaration, selectedRuleId: "normal_rule", setupComplete: true },
    units: Object.fromEntries(Object.entries(competitive.state.units).map(([id, u]) => [id, u.owner === "P2" ? { ...u, hp: 0, isAlive: false } : u])) };
  assert((await lifecycle.applyAction(competitive, { type: "endTurn" }, "P1")).ok);
  await lifecycle.retryPending();
  await lifecycle.retryPending();
  assert.equal(competitive.state.phase, "ended");
  assert.equal(attempts, 1);
  assert(errors.some((e) => (e as { code?: string }).code === "MATCH_RESULT_CONFLICT"));
  permanent = false;
  const unavailable = await lifecycle.createRoom();
  unavailable.seats = { P1: "one", P2: "two" };
  unavailable.seatIdentities = room.seatIdentities;
  unavailable.state = { ...unavailable.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
  assert((await lifecycle.applyAction(unavailable, { type: "startGame" }, "P1")).ok);
  unavailable.state = { ...competitive.state, phase: "battle", gameOver: null };
  assert((await lifecycle.applyAction(unavailable, { type: "endTurn" }, "P1")).ok);
  for (let i = 0; i < 6; i++) await lifecycle.retryPending();
  assert.equal(attempts, 6, "one permanent attempt plus five bounded transient attempts");
  assert.equal(unavailable.state.phase, "ended");
  assert(errors.some((e) => (e as { code?: string }).code === "MATCH_RESULT_RETRY_EXHAUSTED"));
  await lifecycle.close();
  storeTestHooks.reset();
  console.log("match result extraction, actual chess draw, safe summaries and permanent-error retry tests passed");
}
run().catch((error) => { console.error(error); process.exit(1); });
