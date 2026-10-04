import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { GameAction } from "rules";
import { configureTestDatabase } from "./testDatabase";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchSnapshotRepository } from "../repositories/matchSnapshotRepository";
import { RatingRepository } from "../repositories/ratingRepository";
import { LeaderboardRepository } from "../repositories/leaderboardRepository";
import { MatchService } from "../services/matchService";
import { RatingService } from "../services/ratingService";
import { ReplayService } from "../services/replayService";
import { LeaderboardService } from "../services/leaderboardService";
import { readLeaderboardConfig } from "../leaderboard/config";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { createMatchmakingService } from "../matchmaking/runtime";
import { getGameRoom, storeTestHooks } from "../store";
import { createReplayFixture } from "./replayTestSupport";
import type { MatchFound } from "../matchmaking/types";

async function run() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const logger = { info() {}, error() {} };
  const repository = new MatchRepository(db);
  const ratings = new RatingService(new RatingRepository(db), logger);
  const actions = new MatchActionRepository(db);
  const snapshots = new MatchSnapshotService(new MatchSnapshotRepository(db), { interval: 20 });
  const service = new MatchService(repository, logger, actions, snapshots, ratings);
  const lifecycle = new MatchLifecycle(logger, service, snapshots);
  const queue = createMatchmakingService(
    lifecycle,
    logger,
    ratings,
    async (userId) =>
      !!(await db.matchParticipant.findFirst({
        where: { userId, match: { status: "IN_PROGRESS" } },
      })),
  );
  const users: string[] = [],
    matches: string[] = [];
  const prefix = `mm_${randomUUID().slice(0, 8)}`;
  try {
    for (let i = 0; i < 4; i++)
      users.push(
        (
          await db.user.create({
            data: {
              email: `${prefix}_${i}@example.test`,
              profile: { create: { username: `${prefix}_${i}`, displayName: `Player ${i}` } },
            },
          })
        ).id,
      );
    const input = {
      roomId: randomUUID(),
      isRated: true,
      gameMode: "classic",
      seed: 37,
      participants: [
        { seat: "P1" as const, userId: users[0], displayNameSnapshot: "Player 0" },
        { seat: "P2" as const, userId: users[1], displayNameSnapshot: "Player 1" },
      ],
    };
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () => service.createWaitingMatch(input)),
    );
    matches.push(concurrent[0].id);
    assert(concurrent.every((m) => m.id === concurrent[0].id));
    assert.equal(await db.match.count({ where: { roomId: input.roomId } }), 1);
    assert.equal(await db.matchParticipant.count({ where: { matchId: concurrent[0].id } }), 2);
    const failedRoom = randomUUID();
    await assert.rejects(
      service.createWaitingMatch({
        ...input,
        roomId: failedRoom,
        participants: [input.participants[0], { ...input.participants[1], userId: randomUUID() }],
      }),
    );
    assert.equal(
      await db.match.count({ where: { roomId: failedRoom } }),
      0,
      "Participant failure rolls back parent Match",
    );
    let first: MatchFound | undefined, second: MatchFound | undefined;
    const a = { userId: users[2], username: `${prefix}_2`, displayName: "Player 2" };
    const b = { userId: users[3], username: `${prefix}_3`, displayName: "Player 3" };
    queue.connect(a, "A", (event) => {
      if (event.status.status === "MATCH_FOUND") first = event.status;
    });
    queue.connect(b, "B", (event) => {
      if (event.status.status === "MATCH_FOUND") second = event.status;
    });
    const joins = await Promise.all([queue.join(a, "classic"), queue.join(b, "classic")]);
    assert(joins.every((s) => s.status === "QUEUED" || s.status === "MATCHING"));
    await Promise.all(Array.from({ length: 8 }, () => queue.tick()));
    assert(first && second);
    assert.equal(first.matchId, second.matchId);
    assert.notEqual(first.seat, second.seat);
    matches.push(first.matchId);
    const room = getGameRoom(first.roomId)!;
    const waiting = await repository.findByIdWithParticipants(first.matchId);
    assert.equal(waiting?.isRated, true);
    assert.equal(waiting?.participants.length, 2);
    assert.equal((await ratings.getPlayerRating(a.userId, "standard")).ratedGames, 0);
    assert.equal(
      await db.rating.count({ where: { userId: { in: [a.userId, b.userId] } } }),
      0,
      "New players need no persisted rating",
    );
    room.seats = { P1: "seat-1", P2: "seat-2" };
    room.state = { ...room.state, seats: { P1: true, P2: true } };
    // Replay a complete sequence of actual legal rules commands through the SAME
    // normal lifecycle used by manually-created Rated rooms.
    const fixture = createReplayFixture("classic", true, room.seed, room.hostSeat);
    for (const entry of fixture.room.actionLog) {
      const result = await lifecycle.applyAction(room, entry.action as GameAction, entry.playerId);
      assert(result.ok, `Matchmade action ${entry.revision}/${entry.action.type} accepted`);
      if (entry.revision % 40 === 0) assert(await lifecycle.drainActions(room.matchId!));
    }
    assert.equal(room.state.phase, "ended");
    assert(await lifecycle.drainActions(room.matchId!));
    const finished = await repository.findByIdWithParticipants(first.matchId);
    assert.equal(finished?.status, "FINISHED");
    assert(finished?.ratingProcessedAt);
    assert.equal(await db.matchAction.count({ where: { matchId: first.matchId } }), room.revision);
    assert((await db.matchSnapshot.count({ where: { matchId: first.matchId } })) > 0);
    assert.equal(await db.ratingHistory.count({ where: { matchId: first.matchId } }), 2);
    for (const id of [a.userId, b.userId])
      assert.equal((await ratings.getPlayerRating(id, "classic")).ratedGames, 1);
    const replay = new ReplayService(repository, actions, snapshots);
    assert.equal((await replay.validateFinalDeterminism(first.matchId)).deterministic, true);
    const leaderboard = new LeaderboardService(
      new LeaderboardRepository(db),
      readLeaderboardConfig({}),
    );
    const board = await leaderboard.getLeaderboard({
      gameMode: "classic",
      page: 1,
      limit: 20,
      status: "provisional",
      sort: "rating",
      order: "desc",
    });
    assert(board.items.some((p) => p.user.id === a.userId && p.ratedGames === 1));
    await ratings.processRatedMatch(first.matchId);
    assert.equal(await db.ratingHistory.count({ where: { matchId: first.matchId } }), 2);
    console.log(
      "Matchmaking PostgreSQL: atomic rollback/concurrent creation, real queue, full legal game, action/snapshot journal, deterministic replay, Glicko and provisional leaderboard passed",
    );
  } finally {
    await queue.close();
    await lifecycle.close();
    storeTestHooks.reset();
    await db.ratingHistory.deleteMany({ where: { userId: { in: users } } });
    await db.match.deleteMany({ where: { id: { in: matches } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
