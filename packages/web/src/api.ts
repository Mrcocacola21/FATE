import type { GameAction, GameState, PlayerId, GameEvent } from "rules";

const API_BASE =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  "http://localhost:3000";

export interface CreateGameResponse {
  gameId: string;
  seed: number;
  views: { P1: GameState; P2: GameState };
}

export interface GameViewResponse {
  gameId: string;
  seed: number;
  view: GameState;
}

export interface ActionResponse {
  view: GameState;
  events: GameEvent[];
  logIndex: number;
}

export async function createGame(params?: {
  seed?: number;
  arenaId?: string;
}): Promise<CreateGameResponse> {
  const res = await fetch(`${API_BASE}/api/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });

  if (!res.ok) {
    throw new Error(`Failed to create game: ${res.status}`);
  }

  return (await res.json()) as CreateGameResponse;
}

export async function getGameView(
  gameId: string,
  playerId: PlayerId
): Promise<GameViewResponse> {
  const res = await fetch(
    `${API_BASE}/api/games/${gameId}?playerId=${playerId}`
  );
  if (!res.ok) {
    throw new Error(`Failed to load game: ${res.status}`);
  }
  return (await res.json()) as GameViewResponse;
}

export async function sendAction(
  gameId: string,
  playerId: PlayerId,
  action: GameAction
): Promise<ActionResponse> {
  const res = await fetch(
    `${API_BASE}/api/games/${gameId}/actions?playerId=${playerId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to send action: ${res.status}`);
  }

  return (await res.json()) as ActionResponse;
}

export function getWsUrl(gameId: string, playerId: PlayerId): string {
  const wsBase = API_BASE.replace(/^http/, "ws");
  return `${wsBase}/ws/games/${gameId}?playerId=${playerId}`;
}
