import type { GameAction, GameEvent, GameState } from "rules";
import { getWsUrl } from "./api";
import type { PlayerId } from "rules";

export type ServerMessage =
  | {
      type: "stateSnapshot";
      gameId: string;
      seed: number;
      view: GameState;
    }
  | {
      type: "stateUpdated";
      gameId: string;
      view: GameState;
      events: GameEvent[];
      lastAction: GameAction;
      logIndex: number;
    }
  | {
      type: "error";
      message: string;
    };

export function connectGameSocket(
  gameId: string,
  playerId: PlayerId,
  onMessage: (msg: ServerMessage) => void
): WebSocket {
  const socket = new WebSocket(getWsUrl(gameId, playerId));

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as ServerMessage;
      onMessage(data);
    } catch {
      // ignore parse errors
    }
  };

  return socket;
}
