import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchService } from "../services/matchService";
import { MatchActionService } from "../services/matchActionService";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import type { AcceptedActionRecord } from "../persistence/acceptedAction";
import { configureTestDatabase } from "./testDatabase";
import { storeTestHooks } from "../store";

async function run() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const actions = new MatchActionRepository(db);
  const matches = new MatchRepository(db);
  const errors: object[] = [];
  const logger = { info() {}, error: (data: object) => errors.push(data) };
  const service = new MatchService(matches, logger, actions);
  const lifecycle = new MatchLifecycle(logger, service);
  const prefix = `phase8-test-${randomUUID()}`;
  const userIds: string[] = [];
  const matchIds: string[] = [];
  const dropTrigger = async () => {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS phase8_action_failure ON "MatchAction"');
    await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS phase8_action_failure()');
  };
  try {
    for (const name of ["Alice", "Bob"])
      userIds.push((await db.user.create({ data: { email: `${prefix}-${name}@example.test`, profile: { create: {
        username: `${name}_${randomUUID().slice(0, 8)}`, displayName: name,
      } } } })).id);
    const { id } = await service.createWaitingMatch({ roomId: `${prefix}-repository`, seed: 4, gameMode: "standard" });
    matchIds.push(id);
    const input: AcceptedActionRecord = { matchId: id, revision: 2, actorUserId: userIds[0], actorSeat: "P1",
      actionType: "move", actionPayload: { type: "move", unitId: "hidden-unit", to: { row: 1, col: 2 } },
      events: [{ type: "unitMoved", unitId: "hidden-unit", from: { row: 1, col: 1 }, to: { row: 1, col: 2 } }], createdAt: new Date() };
    await Promise.all(Array.from({ length: 8 }, () => actions.appendAcceptedAction(input)));
    assert.equal(await db.matchAction.count({ where: { matchId: id } }), 1);
    const canonical = await db.matchAction.findFirstOrThrow({ where: { matchId: id } });
    assert.deepEqual(canonical.actionPayload, input.actionPayload);
    assert.deepEqual(canonical.events, input.events);
    for (const change of [{ actionType: "attack" }, { actorUserId: userIds[1] }, { actorSeat: "P2" as const },
      { actionPayload: { type: "move", unitId: "different" } }, { events: [] }]) {
      await assert.rejects(actions.appendAcceptedAction({ ...input, ...change }), /MATCH_ACTION_CONFLICT/);
      assert.deepEqual(await db.matchAction.findFirstOrThrow({ where: { matchId: id } }), canonical);
    }
    // Concurrent contradictory writes retain exactly one canonical row.
    const race = await Promise.allSettled([
      actions.appendAcceptedAction({ ...input, revision: 3 }),
      actions.appendAcceptedAction({ ...input, revision: 3, actionType: "attack" }),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(race.filter((r) => r.status === "rejected" && r.reason.code === "MATCH_ACTION_CONFLICT").length, 1);
    await actions.appendAcceptedAction({ ...input, revision: 1, createdAt: new Date(Date.now() + 60000) });
    assert.deepEqual((await actions.findByMatchIdOrdered(id)).map((a) => a.revision), [1, 2, 3]);
    assert.deepEqual((await actions.findByMatchIdOrdered(id, 1, 1)).map((a) => a.revision), [2]);
    const history = new MatchActionService(matches, actions);
    await assert.rejects(history.getCompletedMatchActionHistory(id), /MATCH_NOT_FINISHED/);
    const room = await lifecycle.createRoom({}, `${prefix}-runtime`);
    matchIds.push(room.matchId!);
    room.seats = { P1: "one", P2: "two" };
    room.seatIdentities = {
      P1: { userId: userIds[0], username: "Alice", displayName: null },
      P2: { userId: userIds[1], username: "Bob", displayName: null },
    };
    room.state = { ...room.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
    assert((await lifecycle.applyAction(room, { type: "startGame" }, "P1")).ok);
    await lifecycle.drainActions();
    const pending = room.state.pendingRoll!;
    const before = await db.matchAction.count({ where: { matchId: room.matchId! } });
    assert(!(await lifecycle.applyAction(room, { type: "resolvePendingRoll", player: pending.player, pendingRollId: "wrong" }, pending.player)).ok);
    await lifecycle.drainActions();
    assert.equal(await db.matchAction.count({ where: { matchId: room.matchId! } }), before);
    assert((await lifecycle.applyAction(room, { type: "resolvePendingRoll", player: pending.player, pendingRollId: pending.id }, pending.player)).ok);
    await lifecycle.drainActions();
    const acceptedRoll = await db.matchAction.findFirstOrThrow({ where: { matchId: room.matchId!, actionType: "resolvePendingRoll" } });
    assert.equal(acceptedRoll.actorUserId, userIds[pending.player === "P1" ? 0 : 1]);
    assert(Array.isArray(acceptedRoll.events) && acceptedRoll.events.length > 0);
    room.state = { ...room.state, phase: "battle", pendingRoll: null, currentPlayer: "P1",
      ruleDeclaration: { ...room.state.ruleDeclaration, selectedRuleId: "normal_rule", setupComplete: true } };
    const ownUnit = Object.values(room.state.units).find((unit) => unit.owner === "P1")!;
    const beforeInvalid = await db.matchAction.count({ where: { matchId: room.matchId! } });
    assert(!(await lifecycle.applyAction(room, { type: "useAbility", unitId: ownUnit.id, abilityId: "nonexistentAbility" }, "P1")).ok);
    assert(!(await lifecycle.applyAction(room, { type: "move", unitId: ownUnit.id, to: { row: -999, col: -999 } }, "P1")).ok);
    await lifecycle.drainActions();
    assert.equal(await db.matchAction.count({ where: { matchId: room.matchId! } }), beforeInvalid, "failed ability and illegal move do not persist");
    room.state = { ...room.state, phase: "battle", pendingRoll: null,
      ruleDeclaration: { ...room.state.ruleDeclaration, selectedRuleId: "normal_rule", setupComplete: true },
      units: Object.fromEntries(Object.entries(room.state.units).map(([unitId, u]) => [unitId, u.owner === "P2" ? { ...u, hp: 0, isAlive: false } : u])) };
    assert((await lifecycle.applyAction(room, { type: "endTurn" }, "P1")).ok);
    await lifecycle.drainActions();
    const finished = await matches.findById(room.matchId!);
    assert.equal(finished!.status, "FINISHED");
    const full = await actions.findByMatchIdOrdered(room.matchId!);
    assert.equal(full[full.length - 1].revision, finished!.finalRevision);
    assert.equal(full[full.length - 1].actionType, "endTurn");
    const dto = await history.getCompletedMatchActionHistory(room.matchId!, 0, 2);
    assert.equal(dto.actions.length, 2);
    assert.equal(dto.nextRevisionAfter, full[1].revision);
    assert.deepEqual((await history.getCompletedMatchActionHistory(room.matchId!, dto.nextRevisionAfter!, 2)).actions.map((a) => a.revision), [full[2].revision]);
    // Actual SQL failure on a terminal journal insert blocks FINISHED without reverting gameplay.
    const failedRoom = await lifecycle.createRoom({}, `${prefix}-failure`);
    matchIds.push(failedRoom.matchId!);
    failedRoom.seats = room.seats;
    failedRoom.seatIdentities = room.seatIdentities;
    failedRoom.state = { ...failedRoom.state, seats: { P1: true, P2: true }, playersReady: { P1: true, P2: true } };
    await lifecycle.applyAction(failedRoom, { type: "startGame" }, "P1");
    await lifecycle.drainActions();
    await db.$executeRawUnsafe(`CREATE FUNCTION phase8_action_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW."matchId" = '${failedRoom.matchId!}'::uuid AND NEW."actionType" = 'endTurn' THEN
        RAISE EXCEPTION 'phase8 controlled journal failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER phase8_action_failure BEFORE INSERT ON "MatchAction" FOR EACH ROW EXECUTE FUNCTION phase8_action_failure()');
    failedRoom.state = { ...room.state, phase: "battle", gameOver: null };
    assert((await lifecycle.applyAction(failedRoom, { type: "endTurn" }, "P1")).ok);
    assert.equal(await lifecycle.drainActions(failedRoom.matchId!), false);
    assert.equal(failedRoom.state.phase, "ended");
    assert.equal((await matches.findById(failedRoom.matchId!))!.status, "IN_PROGRESS");
    assert(errors.some((entry) => (entry as { event?: string }).event === "match:action_persistence_failed"));
    await assert.rejects(history.getCompletedMatchActionHistory(failedRoom.matchId!), /MATCH_NOT_FINISHED/);
    await dropTrigger();
    await lifecycle.removeRoom(failedRoom);
    // Pending writes drain on close, even when the runtime room has disappeared.
    const closing = await lifecycle.createRoom({}, `${prefix}-shutdown`);
    matchIds.push(closing.matchId!);
    lifecycle.recordDraftAction(closing, { type: "draftStarted", player: "P1" });
    await lifecycle.close();
    assert.equal(await db.matchAction.count({ where: { matchId: closing.matchId! } }), 1);
    assert.equal(await db.matchSnapshot.count({ where: { matchId: room.matchId! } }), 1);
    assert.equal((await db.matchSnapshot.findFirstOrThrow({ where: { matchId: room.matchId! } })).revision, finished!.finalRevision);
    console.log("persistent action journal PostgreSQL races, canonical conflicts, ordering, rolls, terminal result, SQL failure and shutdown passed");
  } finally {
    await dropTrigger();
    await lifecycle.close();
    await db.match.deleteMany({ where: { id: { in: matchIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
    storeTestHooks.reset();
  }
}
run().catch((error) => { console.error(error); process.exit(1); });
