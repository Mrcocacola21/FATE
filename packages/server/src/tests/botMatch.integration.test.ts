import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { makePlayerView, SeededRNG, type GameAction, type PlayerId } from "rules";
import { configureTestDatabase } from "./testDatabase";
import { MatchLifecycle } from "../persistence/matchLifecycle";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchService } from "../services/matchService";
import { RatingRepository } from "../repositories/ratingRepository";
import { RatingService } from "../services/ratingService";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchSnapshotRepository } from "../repositories/matchSnapshotRepository";
import { MatchSnapshotService } from "../services/matchSnapshotService";
import { ReplayService } from "../services/replayService";
import { MatchRecoveryRepository } from "../repositories/matchRecoveryRepository";
import { MatchRecoveryService } from "../services/matchRecoveryService";
import { MatchHistoryRepository } from "../repositories/matchHistoryRepository";
import { MatchHistoryService } from "../services/matchHistoryService";
import { StatisticsRepository } from "../repositories/statisticsRepository";
import { deleteGameRoom, getGameRoom, storeTestHooks, type GameRoom } from "../store";
import { BotMemory, decideBattle } from "../bot/policy";
import { BOT_PROFILES } from "../bot/types";
import { botMayAct, seatToAct } from "../bot/turn";

/** Both seats play by the bot policy through the lifecycle, so every command is journaled. */
async function play(lifecycle: MatchLifecycle, room: GameRoom, stopAfter = Infinity) {
  // The player has taken the seat kept for them, as joinRoom does.
  room.state = { ...room.state, seats: { P1: true, P2: true } };
  const rng = new SeededRNG(23);
  const memory = { P1: new BotMemory(), P2: new BotMemory() };
  for (const seat of ["P1", "P2"] as const)
    assert(
      (await lifecycle.applyAction(room, { type: "setReady", player: seat, ready: true }, seat)).ok,
    );
  assert((await lifecycle.applyAction(room, { type: "startGame" }, room.hostSeat)).ok);
  let commands = 0;
  while (room.state.phase !== "ended" && commands < stopAfter) {
    const seat = seatToAct(room) as PlayerId;
    const view = makePlayerView(room.state, seat);
    let accepted: GameAction | undefined;
    for (const action of decideBattle(view, seat, BOT_PROFILES.sorcerer, rng, memory[seat])) {
      if (!botMayAct(room, action, seat)) continue;
      if ((await lifecycle.applyAction(room, action, seat)).ok) {
        accepted = action;
        break;
      }
    }
    assert(accepted, `no command accepted for ${seat}`);
    memory[seat].remember(view, accepted);
    if (++commands % 10 === 0) assert(await lifecycle.drainActions(room.matchId!));
  }
  await lifecycle.drainActions(room.matchId!);
}

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
  const ids: string[] = [];
  let userId = "";
  try {
    const suffix = randomUUID();
    userId = (
      await db.user.create({
        data: {
          email: `bot-${suffix}@example.test`,
          profile: { create: { username: `bot_${suffix.slice(0, 12)}` } },
        },
      })
    ).id;
    const identity = { userId, username: "Player", displayName: null };

    // A finished match against the bot: stored with its difficulty, the bot as no user.
    const created = await lifecycle.createBotRoom({
      identity,
      difficulty: "sorcerer",
      gameMode: "classic",
      playerSeat: "P2",
    });
    ids.push(created.matchId);
    const room = getGameRoom(created.roomId)!;
    room.seats.P2 = "player-connection";
    await play(lifecycle, room);
    assert.equal(room.state.phase, "ended");
    const stored = (await db.match.findUnique({
      where: { id: created.matchId },
      include: { participants: true },
    }))!;
    assert.equal(stored.status, "FINISHED");
    assert.equal(stored.isRated, false);
    assert.equal(stored.botDifficulty, "sorcerer");
    assert.equal(stored.participants.find((p) => p.seat === "P1")?.userId, null);
    assert.equal(stored.participants.find((p) => p.seat === "P2")?.userId, userId);
    assert.equal(
      await db.ratingHistory.count({ where: { matchId: created.matchId } }),
      0,
      "no rating change",
    );
    assert.equal(
      await db.matchAction.count({
        where: { matchId: created.matchId, actorSeat: "P1", NOT: { actorUserId: null } },
      }),
      0,
      "the bot's journaled commands carry no user",
    );
    // History keeps it, marked as the bot; the player's record does not count it.
    const history = await new MatchHistoryService(
      new MatchHistoryRepository(db),
    ).getUserMatchHistory(userId, {
      page: 1,
      limit: 10,
    } as never);
    assert.equal(history.items[0].bot, "sorcerer");
    assert.equal(history.items[0].matchType, "CASUAL");
    assert.equal((await new StatisticsRepository(db).findFinishedResults(userId)).length, 0);
    assert.equal((await service.getFinishedMatchDetails(created.matchId)).bot, "sorcerer");

    // An unfinished match against the bot comes back after a restart, the bot in its seat.
    const second = await lifecycle.createBotRoom({
      identity,
      difficulty: "archmage",
      gameMode: "classic",
      playerSeat: "P1",
    });
    ids.push(second.matchId);
    const live = getGameRoom(second.roomId)!;
    live.seats.P1 = "player-connection";
    await play(lifecycle, live, 40);
    assert.notEqual(live.state.phase, "ended");
    const revision = live.revision;
    await lifecycle.drainActions(second.matchId);
    deleteGameRoom(second.roomId);
    const recovery = new MatchRecoveryService(
      new MatchRecoveryRepository(db),
      new ReplayService(matches, actions, snapshots),
      ratings,
    );
    const candidate = (await new MatchRecoveryRepository(db).findCandidates()).find(
      (m) => m.id === second.matchId,
    )!;
    await recovery.recoverCandidate(candidate, lifecycle, logger as never, undefined, false);
    const restored = getGameRoom(second.roomId)!;
    assert.ok(restored, "the room is back");
    assert.deepEqual(restored.bot, { seat: "P2", difficulty: "archmage" });
    assert.equal(restored.seatIdentities.P1?.userId, userId);
    assert.equal(restored.revision, revision);
    console.log("Bot match persistence, history, statistics and recovery integration passed");
  } finally {
    for (const id of ids) {
      const match = await db.match.findUnique({ where: { id } });
      if (match?.roomId) deleteGameRoom(match.roomId);
    }
    await lifecycle.close();
    storeTestHooks.reset();
    if (ids.length) await db.match.deleteMany({ where: { id: { in: ids } } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }
}

void run().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
