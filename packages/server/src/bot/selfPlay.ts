import { makePlayerView, SeededRNG, type GameAction, type GameModeId, type PlayerId } from "rules";
import { createGameRoomWithId, applyGameAction, type GameRoom } from "../store";
import { rebuildDraftedArmies, rebuildLobbyArmiesForMode } from "../modes/roomModes";
import {
  applyDraftBan,
  applyDraftPick,
  applyDraftRoomChoice,
  startDraftSession,
} from "../modes/draftSession";
import { botMayAct, seatToAct } from "./turn";
import { BotMemory, decideBattle } from "./policy";
import { chooseBotFigureSet, decideDraft } from "./lobby";
import { BOT_PROFILES, type BotDifficulty, type BotRandom } from "./types";

export interface SelfPlayResult {
  ended: boolean;
  winner: PlayerId | null;
  commands: number;
  rejected: number;
  turns: number;
  stuck?: string;
  room: GameRoom;
}

/**
 * Two bots play a whole unpublished match through the same commands a room accepts. No sockets,
 * no persistence: this is how tests prove each difficulty finishes its games.
 */
export function playBotMatch(options: {
  seed: number;
  gameMode: GameModeId;
  bots: Record<PlayerId, BotDifficulty>;
  rng?: BotRandom;
  maxCommands?: number;
  trace?: (action: GameAction, ok: boolean, room: GameRoom) => void;
}): SelfPlayResult {
  const rng = options.rng ?? new SeededRNG((options.seed * 7919) >>> 0);
  const maxCommands = options.maxCommands ?? 6000;
  const room = createGameRoomWithId(`bot-selfplay-${options.seed}-${options.gameMode}`, {
    seed: options.seed,
    gameMode: options.gameMode,
    hostSeat: "P1",
    hostConnId: "bot-host",
    publish: false,
  });
  room.state = { ...room.state, seats: { P1: true, P2: true } };
  let commands = 0;
  let rejected = 0;
  const result = (stuck?: string): SelfPlayResult => ({
    ended: room.state.phase === "ended",
    winner: room.state.gameOver?.winnerPlayerId ?? null,
    commands,
    rejected,
    turns: room.state.turnNumber,
    stuck,
    room,
  });
  const apply = (action: GameAction, seat: PlayerId) => {
    if (
      !botMayAct(room, action, seat) &&
      !["setReady", "startGame", "forfeitMatch"].includes(action.type)
    ) {
      rejected++;
      return false;
    }
    const outcome = applyGameAction(room, action, seat);
    options.trace?.(action, outcome.ok, room);
    if (outcome.ok) commands++;
    else rejected++;
    return outcome.ok;
  };
  if (options.gameMode === "standard")
    room.figureSets = {
      P1: chooseBotFigureSet(options.bots.P1, rng),
      P2: chooseBotFigureSet(options.bots.P2, rng),
    };
  for (const seat of ["P1", "P2"] as const)
    apply({ type: "setReady", player: seat, ready: true }, seat);
  if (options.gameMode === "draft") {
    startDraftSession(room);
    while (room.draftState && room.draftState.phase !== "complete") {
      const seat = room.draftState.currentPlayer;
      const candidates = decideDraft(room.draftState, seat, options.bots[seat], rng);
      const done = candidates.some((command) => {
        if (command.kind === "draftChoice") {
          const choice =
            command.choice.type === "roll"
              ? {
                  type: "roll" as const,
                  dice: [1 + Math.floor(rng.next() * 6), 1 + Math.floor(rng.next() * 6)],
                }
              : command.choice;
          return applyDraftRoomChoice(room, seat, choice as never).ok;
        }
        if (command.kind === "draftBan") return applyDraftBan(room, seat, command.heroId).ok;
        if (command.kind === "draftPick") return applyDraftPick(room, seat, command.heroId).ok;
        return false;
      });
      if (!done) return result(`draft:${room.draftState.phase}`);
    }
    rebuildDraftedArmies(room);
  } else rebuildLobbyArmiesForMode(room);
  if (!apply({ type: "startGame" }, "P1")) return result("startGame");

  const memory = { P1: new BotMemory(), P2: new BotMemory() };
  while (room.state.phase !== "ended" && commands < maxCommands) {
    const seat = seatToAct(room);
    if (!seat) return result("no-seat");
    const view = makePlayerView(room.state, seat);
    const candidates = decideBattle(
      view,
      seat,
      BOT_PROFILES[options.bots[seat]],
      rng,
      memory[seat],
    ).slice(0, 400);
    const chosen = candidates.find((action) => apply(action, seat));
    if (chosen) memory[seat].remember(view, chosen);
    // A decision with no answer at all (a rules soft-lock): the bot concedes rather than hang.
    else if (apply({ type: "forfeitMatch", player: seat, reason: "surrender" }, seat))
      return result(
        `conceded:${room.state.phase}:${(view.pendingRoll?.kind as string | undefined) ?? (view.activeUnitId ? "active" : "start")}`,
      );
    else
      return result(
        `${room.state.phase}:${room.state.pendingRoll?.kind ?? (room.state.activeUnitId ? "active" : "start")}`,
      );
  }
  return result(room.state.phase === "ended" ? undefined : "maxCommands");
}
