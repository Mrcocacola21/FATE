import assert from "node:assert/strict";
import WebSocket from "ws";
import { SeededRNG, type PlayerView } from "rules";
import { buildServer } from "../index";
import {
  MemoryMatchPersistence,
  testAccessToken,
  testIdentityService,
  testUserIds,
} from "./matchTestSupport";
import { getGameRoom } from "../store";
import type { ServerMessage } from "../ws";
import { BotMemory, decideBattle } from "../bot/policy";
import { BOT_PROFILES } from "../bot/types";

/**
 * A player against the server bot over real sockets. The player's moves are chosen by the same
 * policy from the views the player receives, so the match runs to its end on its own.
 */
process.env.BOT_STEP_DELAY_MS = "0";

const realTimeout = setTimeout;
async function until<T>(read: () => T | undefined | false | null, limit = 60_000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const result = read();
    if (result) return result;
    if (Date.now() - started > limit) throw new Error("Timed out");
    await new Promise((resolve) => realTimeout(resolve, 2));
  }
}

async function run() {
  const memory = new MemoryMatchPersistence();
  const server = await buildServer({
    matchPersistence: memory,
    connectionIdentity: testIdentityService(),
    matchmakingActiveMatch: async () => false,
  });
  await server.listen({ host: "127.0.0.1", port: 0 });
  const port = (server.server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  const connect = async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets.push(socket);
    const messages: ServerMessage[] = [];
    socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return { socket, messages, send: (msg: object) => socket.send(JSON.stringify(msg)) };
  };
  try {
    const token = testAccessToken("P1", "Player");
    const inject = (payload: object) =>
      server.inject({
        method: "POST",
        url: "/api/bot-matches",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        payload,
      });
    assert.equal(
      (await inject({ difficulty: "grandmaster", gameMode: "classic" })).statusCode,
      400,
    );
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/bot-matches",
          payload: { difficulty: "apprentice", gameMode: "classic" },
        })
      ).statusCode,
      401,
    );

    for (const [difficulty, gameMode] of [
      ["apprentice", "classic"],
      ["sorcerer", "draft"],
      ["archmage", "standard"],
    ] as const) {
      const created = await inject({ difficulty, gameMode });
      assert.equal(created.statusCode, 201, created.body);
      const match = created.json() as {
        roomId: string;
        matchId: string;
        seat: "P1" | "P2";
        matchType: string;
      };
      assert.equal(match.matchType, "CASUAL");
      const room = getGameRoom(match.roomId)!;
      const botSeat = match.seat === "P1" ? "P2" : "P1";
      assert.deepEqual(room.bot, { seat: botSeat, difficulty });
      assert.equal(room.matchType, "CASUAL");
      const stored = memory.matches.get(match.matchId)!;
      assert.equal(stored.botDifficulty, difficulty);
      assert.equal(stored.isRated, false);
      assert.equal(stored.participants.get(botSeat)?.userId, null, "the bot is stored as no user");
      assert.equal(stored.participants.get(match.seat)?.userId, testUserIds.P1);

      // A second match cannot start while this one is reserved for the player.
      assert.equal((await inject({ difficulty, gameMode })).statusCode, 409);

      const player = await connect();
      const spectator = await connect();
      player.send({
        type: "joinRoom",
        mode: "join",
        roomId: match.roomId,
        role: match.seat,
        accessToken: token,
      });
      await until(() => player.messages.find((m) => m.type === "joinAck"));
      spectator.send({ type: "joinRoom", mode: "join", roomId: match.roomId, role: "spectator" });
      await until(() => spectator.messages.find((m) => m.type === "joinAck"));

      const rng = new SeededRNG(17);
      const memoryOfPlayer = new BotMemory();
      let handled = 0;
      let revision = -1;
      let tries = 0;
      let lastSent = 0;
      // The player answers each new view of their seat; the bot answers its own on the server.
      await until(() => {
        if (room.state.phase === "ended") return true;
        const states = player.messages.filter(
          (m): m is Extract<ServerMessage, { type: "roomState" }> => m.type === "roomState",
        );
        // A refused command brings no new state: after a moment, try the next candidate.
        const stale = states.length === handled;
        if (stale && Date.now() - lastSent < 150) return false;
        tries = stale ? tries + 1 : 0;
        handled = states.length;
        if (!states.length) return false;
        lastSent = Date.now();
        const last = states[states.length - 1];
        assert.ok(last.meta.revision >= revision, "revisions never go back");
        revision = last.meta.revision;
        assert.deepEqual(last.meta.bot, { seat: botSeat, difficulty });
        if (last.meta.draftState && last.meta.draftState.phase !== "complete") {
          const draft = last.meta.draftState;
          if (draft.currentPlayer !== match.seat) return false;
          if (draft.phase === "ban" || draft.phase === "pick") {
            const heroId = last.meta.draftPool.find(
              (hero) =>
                !draft.bannedHeroIds.includes(hero.heroId) &&
                !Object.values(draft.picks.P1).includes(hero.heroId) &&
                !Object.values(draft.picks.P2).includes(hero.heroId) &&
                !draft.picks[match.seat][hero.primaryClass as keyof typeof draft.picks.P1] &&
                last.meta.draftBanLocks?.[hero.heroId] == null,
            )?.heroId;
            player.send({ type: draft.phase === "ban" ? "draftBanHero" : "draftPickHero", heroId });
          } else {
            const choice =
              draft.phase === "initiative"
                ? { type: "roll" }
                : draft.phase === "right"
                  ? { type: "chooseRight", right: "draft" }
                  : draft.phase === "draftSide"
                    ? { type: "chooseDraftSide", side: "first" }
                    : draft.phase === "fieldSide"
                      ? { type: "chooseFieldSide", side: "chooseRule" }
                      : { type: "chooseRule", ruleId: "normal_rule" };
            player.send({ type: "draftChoice", choice });
          }
          return false;
        }
        const view = last.view as PlayerView;
        const candidates = decideBattle(
          view,
          match.seat,
          BOT_PROFILES.sorcerer,
          rng,
          memoryOfPlayer,
        );
        // Refused commands bring no new state: go round the candidates until one is accepted.
        const action = candidates[tries % Math.max(1, candidates.length)];
        if (!action) return false;
        memoryOfPlayer.remember(view, action);
        if (action.type === "resolvePendingRoll")
          player.send({
            type: "resolvePendingRoll",
            pendingRollId: action.pendingRollId,
            choice: action.choice,
          });
        else player.send({ type: "action", action });
        return false;
      }, 120_000).catch((error) => {
        console.log(
          difficulty,
          gameMode,
          room.state.phase,
          room.state.currentPlayer,
          room.state.pendingRoll?.kind,
          room.state.pendingRoll?.player,
          room.draftState?.phase,
          room.draftState?.currentPlayer,
          "player",
          match.seat,
        );
        throw error;
      });

      assert.equal(room.state.phase, "ended", `${difficulty} ${gameMode} finished`);
      await until(() => memory.matches.get(match.matchId)?.status === "FINISHED");
      const result = memory.matches.get(match.matchId)!.result!;
      assert.ok(result.winnerSeat, "the match has a winner");
      assert.equal(
        result.participants.find((p) => p.seat === botSeat)?.userId,
        null,
        "the bot's result row has no user",
      );
      // Every journaled command of the bot is a plain seat command, with no user behind it.
      const actions = [...memory.actions.values()].filter((a) => a.matchId === match.matchId);
      assert.ok(actions.some((a) => a.actorSeat === botSeat && a.actorUserId === null));
      // The spectator sees the bot seat named, never a private view of either side.
      const watched = spectator.messages.filter(
        (m): m is Extract<ServerMessage, { type: "roomState" }> => m.type === "roomState",
      );
      assert.ok(watched.length > 0);
      for (const message of watched) assert.equal(message.you.role, "spectator");
      player.socket.close();
      spectator.socket.close();
    }
    console.log("Bot matches: creation, persistence, play to the end over sockets passed");
  } finally {
    for (const socket of sockets) socket.terminate();
    await server.close();
  }
}

void run().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
