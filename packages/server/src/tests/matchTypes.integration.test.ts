import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { configureTestDatabase } from "./testDatabase";
import { createReplayFixture } from "./replayTestSupport";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchService } from "../services/matchService";
import { RatingRepository } from "../repositories/ratingRepository";
import { RatingService } from "../services/ratingService";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchSnapshotRepository } from "../repositories/matchSnapshotRepository";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { ReplayService } from "../services/replayService";
import { ReplayQueryService } from "../services/replayQueryService";
import { deserializeReplayAction } from "../replay/deserializeAction";
import { restoreReplaySetup } from "../replay/actionSetup";
import { extractPersistentMatchResult } from "../persistence/matchResult";
import { MatchHistoryRepository } from "../repositories/matchHistoryRepository";
import { MatchHistoryService } from "../services/matchHistoryService";
import { StatisticsRepository } from "../repositories/statisticsRepository";
import { PlayerStatisticsService } from "../services/playerStatisticsService";
import { LeaderboardRepository } from "../repositories/leaderboardRepository";
import { LeaderboardService } from "../services/leaderboardService";
import { leaderboardQuerySchema } from "../leaderboard/querySchema";
import { storeTestHooks } from "../store";

async function run() {
  const url = configureTestDatabase();
  const db = new PrismaClient({ datasources: { db: { url } } });
  const logger = {
    info() {},
    error(data: object) {
      console.error(data);
    },
    warn() {},
  };
  const matches = new MatchRepository(db);
  const ratings = new RatingService(new RatingRepository(db), logger);
  const actions = new MatchActionRepository(db);
  const snapshots = new MatchSnapshotService(new MatchSnapshotRepository(db));
  const service = new MatchService(matches, logger, actions, snapshots, ratings);
  const lifecycle = new MatchLifecycle(logger, service, snapshots);
  const users: string[] = [];
  const ids: string[] = [];
  try {
    for (let i = 0; i < 2; i++) {
      const suffix = randomUUID();
      users.push(
        (
          await db.user.create({
            data: {
              email: `phase17-${suffix}@example.test`,
              profile: { create: { username: `p17_${suffix.slice(0, 12)}` } },
            },
          })
        ).id,
      );
    }
    const fixture = createReplayFixture("classic", true);
    const winnerSeat = fixture.room.state.gameOver!.winnerPlayerId!;
    // Three rated results first, then three more recent Casual wins.
    for (let i = 0; i < 6; i++) {
      const rated = i < 3;
      const wins = i !== 2;
      const seats =
        (wins ? winnerSeat : winnerSeat === "P1" ? "P2" : "P1") === "P1"
          ? users
          : [users[1], users[0]];
      const before = await db.rating.findMany({
        where: { userId: { in: users } },
        orderBy: { userId: "asc" },
      });
      const room = await lifecycle.createRoom(
        {
          matchType: rated ? "RATED" : "CASUAL",
          gameMode: "classic",
          seed: 37,
          hostSeat: "P2",
          hostConnId: "two",
          arenaId: "fixture-arena",
        },
        randomUUID(),
        users[0],
      );
      ids.push(room.matchId!);
      assert.equal((await matches.findById(room.matchId!))!.isRated, rated);
      room.seats = { P1: "one", P2: "two" };
      room.seatIdentities = {
        P1: { userId: seats[0], username: "First", displayName: null },
        P2: { userId: seats[1], username: "Second", displayName: null },
      };
      for (const row of fixture.actions) {
        const { action, setup } = deserializeReplayAction(row);
        if (setup) room.state = restoreReplaySetup(room.state, setup);
        assert(action.type !== "setGameMode" && !action.type.startsWith("draft"));
        const result = await lifecycle.applyAction(
          room,
          action as import("rules").GameAction,
          row.actorSeat ?? undefined,
        );
        assert(result.ok, `${row.revision}: ${JSON.stringify(result)}`);
        // The bot emits hundreds of actions faster than a real player. Keep the
        // durable queue drained so its production shutdown timeout is not hit.
        if (row.revision % 10 === 0) assert(await lifecycle.drainActions(room.matchId!));
      }
      await lifecycle.drainActions(room.matchId!);
      assert.equal((await matches.findById(room.matchId!))!.status, "FINISHED");
      assert.equal(
        await db.matchAction.count({ where: { matchId: room.matchId! } }),
        fixture.actions.length,
      );
      assert((await db.matchSnapshot.count({ where: { matchId: room.matchId! } })) > 0);
      // Repeated finalization and recovery processing preserve exactly-once effects.
      await service.finalizeMatch(room.matchId!, extractPersistentMatchResult(room, new Date()));
      await ratings.processRatedMatch(room.matchId!);
      assert.equal(
        await db.ratingHistory.count({ where: { matchId: room.matchId! } }),
        rated ? 2 : 0,
      );
      const after = await db.rating.findMany({
        where: { userId: { in: users } },
        orderBy: { userId: "asc" },
      });
      if (!rated) {
        assert.deepEqual(
          after,
          before,
          "Casual preserves rating, RD, volatility, ratedGames and timestamps for BOTH users",
        );
        assert.equal((await matches.findById(room.matchId!))!.ratingProcessedAt, null);
      } else {
        assert(after.every((r) => r.ratedGames === i + 1));
        assert((await matches.findById(room.matchId!))!.ratingProcessedAt);
      }
      // Fixture dates isolate rated activity from later career activity.
      await db.match.update({
        where: { id: room.matchId! },
        data: { finishedAt: new Date(rated ? "2026-01-01T12:00:00Z" : "2026-01-10T12:00:00Z") },
      });
      if (i === 0 || i === 3) {
        const replay = new ReplayService(matches, actions, snapshots);
        const metadata = await new ReplayQueryService(matches, actions, replay).getMetadata(
          room.matchId!,
        );
        assert.equal(metadata.matchType, rated ? "RATED" : "CASUAL");
        assert.equal((await replay.validateFinalDeterminism(room.matchId!)).deterministic, true);
        assert.equal(
          (await service.getFinishedMatchDetails(room.matchId!)).matchType,
          metadata.matchType,
        );
      }
    }
    const history = await new MatchHistoryService(
      new MatchHistoryRepository(db),
    ).getUserMatchHistory(users[0], { page: 1, limit: 20 });
    assert.equal(history.items.filter((m) => m.matchType === "CASUAL").length, 3);
    assert.equal(history.items.filter((m) => m.matchType === "RATED").length, 3);
    const statistics = await new PlayerStatisticsService(
      new StatisticsRepository(db),
      logger,
    ).getPlayerStatistics(users[0]);
    assert.equal(statistics.overall.gamesPlayed, 6);
    const leaderboard = new LeaderboardService(new LeaderboardRepository(db), { minRatedGames: 3 });
    const entry = (await leaderboard.getLeaderboard(leaderboardQuerySchema.parse({}))).items.find(
      (p) => p.user.id === users[0],
    )!;
    assert(entry);
    assert.deepEqual([entry.ratedGames, entry.wins, entry.losses, entry.winRate], [3, 2, 1, 2 / 3]);
    assert.equal(entry.lastActivity, "2026-01-01T12:00:00.000Z");
    console.log(
      "match types PostgreSQL: 6 complete legal games, Casual zero rating writes, Rated exactly once, actions/snapshots, deterministic replay, history/details, all-career statistics, rated-only 2W/1L and last activity passed",
    );
  } finally {
    await lifecycle.close();
    await db.ratingHistory.deleteMany({ where: { userId: { in: users } } });
    await db.match.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
    storeTestHooks.reset();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
