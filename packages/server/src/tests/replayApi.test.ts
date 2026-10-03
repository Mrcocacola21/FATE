import assert from "node:assert/strict";
import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { makeReplayView } from "rules";
import { ReplayService } from "../services/replayService";
import { ReplayQueryService } from "../services/replayQueryService";
import { replayRoutes } from "../routes/replayRoutes";
import { createReplayFixture } from "./replayTestSupport";
import { deserializeMatchSnapshot } from "../persistence/matchSnapshot";
import type { DetailedMatch } from "../repositories/matchRepository";
import { ReplayError } from "../replay/replayError";

async function run() {
  const fixture = createReplayFixture("classic", true);
  const match: DetailedMatch = {
    ...fixture.match,
    participants: (["P1", "P2"] as const).map((seat) => ({
      id: randomUUID(),
      matchId: fixture.match.id,
      userId: null,
      seat,
      displayNameSnapshot: `Historical ${seat}`,
      outcome: seat === fixture.match.winnerSeat ? "WIN" : "LOSS",
      resultData: null,
      createdAt: new Date(),
      user: { profile: { username: `Current_${seat}`, avatarUrl: null } },
    })),
  };
  let exists = true;
  const matches = {
    findById: async () => (exists ? match : null),
    findByIdWithParticipants: async () => (exists ? match : null),
  };
  const rows = fixture.actions;
  const actions = {
    findReplayTimeline: async () =>
      rows.map(({ revision, actorSeat, actionType, createdAt }) => ({
        revision,
        actorSeat,
        actionType,
        createdAt,
      })),
    findReplayAction: async (_id: string, revision: number) =>
      rows.find((row) => row.revision === revision) ?? null,
    findInRevisionRange: async (_id: string, base: number, target: number) =>
      rows.filter((row) => row.revision > base && row.revision <= target),
  };
  const snapshots = {
    loadSnapshot: async (_id: string, revision: number) => {
      const row = fixture.history.get(revision);
      return row ? deserializeMatchSnapshot(row) : null;
    },
    loadLatestSnapshotAtOrBefore: async (_id: string, target: number) => {
      const revision = [20, 40, 60, match.finalRevision!].filter((n) => n <= target).at(-1);
      return revision ? deserializeMatchSnapshot(fixture.history.get(revision)!) : null;
    },
  };
  const engine = new ReplayService(matches, actions, snapshots);
  const query = new ReplayQueryService(matches, actions, engine);
  const server = Fastify({ logger: false });
  await server.register(replayRoutes, {
    prefix: "/api",
    identity: {
      verify: async (token) => {
        if (token !== "valid") throw new Error("private-auth-error");
        return { userId: randomUUID(), username: "Viewer", displayName: "Viewer" };
      },
    },
    replayQuery: query,
  });
  const url = `/api/matches/${match.id}/replay`;
  const get = (suffix = "") =>
    server.inject({ method: "GET", url: url + suffix, headers: { authorization: "Bearer valid" } });
  const before = structuredClone({
    match,
    rows,
    snapshots: [...fixture.history],
    room: fixture.room.state,
  });
  try {
    assert.equal((await server.inject(url)).statusCode, 401);
    assert.equal(
      (await server.inject({ url, headers: { authorization: "Bearer invalid" } })).statusCode,
      401,
    );
    const meta = await get();
    assert.equal(meta.statusCode, 200);
    assert.equal(meta.headers["cache-control"], "no-store");
    const dto = meta.json();
    assert.equal(dto.initialRevision, 0);
    assert.equal(dto.finalRevision, match.finalRevision);
    assert.equal(dto.winnerSeat, match.winnerSeat);
    assert.equal(dto.participants[0].displayName, "Historical P1");
    assert.equal(dto.participants[0].username, "Current_P1");
    assert.equal(dto.timeline.length, rows.length);
    assert.deepEqual(Object.keys(dto.timeline[0]).sort(), [
      "actionType",
      "actorSeat",
      "createdAt",
      "revision",
    ]);
    for (const revision of [0, 10, 55, 73, match.finalRevision!]) {
      const response = await get(`/state?revision=${revision}`);
      assert.equal(response.statusCode, 200, response.body);
      const expected =
        revision === 0
          ? fixture.initialState
          : deserializeMatchSnapshot(fixture.history.get(revision)!).state;
      assert.deepEqual(response.json().state, JSON.parse(JSON.stringify(makeReplayView(expected))));
      assert.equal(response.json().revision, revision);
      assert.equal(response.json().action?.revision ?? null, revision || null);
      const serialized = response.body;
      for (const forbidden of [
        "rngState",
        "pendingRoll",
        "actionPayload",
        "knowledge",
        "passwordHash",
        "email",
        "resumeToken",
        "charges",
        "cooldowns",
        "combatResolutionChain",
        "jackKnownHpByTarget",
      ])
        assert(!serialized.includes(`"${forbidden}"`), forbidden);
    }
    assert.deepEqual(
      { match, rows, snapshots: [...fixture.history], room: fixture.room.state },
      before,
    );
    assert.equal((await engine.reconstructAtRevision(match.id, 55)).base.revision, 40);
    for (const suffix of [
      "/state",
      "/state?revision=-1",
      "/state?revision=999999",
      "/state?revision=abc",
      "/state?revision=1.5",
      "/state?revision=",
      "/state?revision=1&revision=2",
      "/state?revision=1&other=2",
    ]) {
      const response = await get(suffix);
      assert.equal(response.statusCode, 400);
      assert.equal(response.json().error.code, "INVALID_REPLAY_REVISION");
    }
    assert.equal(
      (
        await server.inject({
          url: "/api/matches/invalid/replay",
          headers: { authorization: "Bearer valid" },
        })
      ).statusCode,
      400,
    );
    exists = false;
    assert.equal((await get()).json().error.code, "MATCH_NOT_FOUND");
    exists = true;
    for (const status of ["WAITING", "IN_PROGRESS", "CANCELLED"] as const) {
      match.status = status;
      for (const suffix of ["", "/state?revision=0"])
        assert.equal((await get(suffix)).json().error.code, "MATCH_NOT_FINISHED");
    }
    match.status = "FINISHED";
    match.initialConfig = null;
    for (const suffix of ["", "/state?revision=0"])
      assert.equal((await get(suffix)).json().error.code, "MATCH_NOT_REPLAYABLE");
    match.initialConfig = fixture.match.initialConfig;
    const removed = rows.splice(40, 1)[0];
    assert.equal((await get()).json().error.code, "REPLAY_INTEGRITY_ERROR");
    assert.equal((await get("/state?revision=41")).json().error.code, "INVALID_REPLAY_REVISION");
    rows.splice(40, 0, removed);
    const original = engine.reconstructAtRevision.bind(engine);
    for (const code of [
      "INVALID_SNAPSHOT",
      "UNSUPPORTED_SNAPSHOT_VERSION",
      "INVALID_ACTION_LOG",
      "REPLAY_FINAL_STATE_MISMATCH",
      "RNG_RESTORE_FAILED",
    ] as const) {
      engine.reconstructAtRevision = async () => {
        throw new ReplayError(code, { matchId: match.id });
      };
      const response = await get("/state?revision=10");
      assert.equal(response.statusCode, 500);
      assert.deepEqual(response.json(), {
        error: { code: "REPLAY_INTEGRITY_ERROR", message: "REPLAY_INTEGRITY_ERROR" },
      });
    }
    engine.reconstructAtRevision = original;
    const winner = match.winnerSeat;
    match.winnerSeat = winner === "P1" ? "P2" : "P1";
    assert.equal(
      (await get(`/state?revision=${match.finalRevision}`)).json().error.code,
      "REPLAY_INTEGRITY_ERROR",
    );
    match.winnerSeat = winner;
    const allRows = rows.splice(0);
    for (const suffix of ["", "/state?revision=0"]) {
      const unavailable = await get(suffix);
      assert.equal(unavailable.statusCode, 409);
      assert.equal(unavailable.json().error.code, "MATCH_NOT_REPLAYABLE");
    }
    rows.push(...allRows);
    // Private sentinel data on both state and visible units must fail closed.
    const hidden = structuredClone(fixture.room.state);
    hidden.phase = "battle";
    const unit = Object.values(hidden.units).find((u) => u.isAlive)!;
    unit.isStealthed = true;
    hidden.activeUnitId = unit.id;
    hidden.turnOrder = [unit.id];
    const visible = Object.values(hidden.units).find((u) => u.id !== unit.id)!;
    visible.jackKnownHpByTarget = { privateTarget: 12345 };
    visible.charges = { privateCharge: 12345 };
    hidden.knowledge.P1 = { privateTarget: true };
    Object.assign(hidden, { futurePrivateField: "private-sentinel" });
    Object.assign(visible, { futurePrivateField: "private-sentinel" });
    const safe = makeReplayView(hidden);
    assert(!safe.units[unit.id]);
    assert.equal(safe.activeUnitId, null);
    assert(!JSON.stringify(safe).includes("private"));
    assert(hidden.units[unit.id]);
    hidden.phase = "ended";
    assert(
      makeReplayView(hidden).units[unit.id],
      "existing ended spectator visibility is preserved",
    );
    console.log(
      "Replay API tests passed (metadata, initial/mid/final snapshots, auth, validation, integrity, privacy, read only)",
    );
  } finally {
    await server.close();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
