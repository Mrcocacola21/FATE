import type { GameAction, PlayerView, PlayerId, GameEvent, HeroMeta } from "rules";

const isProd = import.meta.env.MODE === "production";

const API_URL = isProd
  ? import.meta.env.VITE_API_URL
  : import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const WS_URL = isProd
  ? import.meta.env.VITE_WS_URL
  : import.meta.env.VITE_WS_URL ?? "ws://localhost:3000/ws";

if (isProd && (!API_URL || !WS_URL)) {
  throw new Error("Missing VITE_API_URL or VITE_WS_URL in production build.");
}

const API_BASE = API_URL as string;
const WS_BASE = WS_URL as string;

export interface CreateGameResponse {
  gameId: string;
  seed: number;
  views: { P1: PlayerView; P2: PlayerView };
}

export interface GameViewResponse {
  gameId: string;
  seed: number;
  view: PlayerView;
}

export interface ActionResponse {
  view: PlayerView;
  events: GameEvent[];
  logIndex: number;
}

export interface RoomSummary {
  id: string;
  createdAt: number;
  phase: "lobby" | "placement" | "battle" | "ended";
  players: { P1: boolean; P2: boolean };
  ready: { P1: boolean; P2: boolean };
  spectators: number;
  canStart: boolean;
}

export interface CreateRoomResponse {
  roomId: string;
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

export async function listRooms(): Promise<RoomSummary[]> {
  const res = await fetch(`${API_BASE}/rooms`);
  if (!res.ok) {
    throw new Error(`Failed to load rooms: ${res.status}`);
  }
  return (await res.json()) as RoomSummary[];
}

export async function createRoom(params?: {
  seed?: number;
  arenaId?: string;
}): Promise<CreateRoomResponse> {
  const res = await fetch(`${API_BASE}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });

  if (!res.ok) {
    throw new Error(`Failed to create room: ${res.status}`);
  }

  return (await res.json()) as CreateRoomResponse;
}

export async function listHeroes(): Promise<HeroMeta[]> {
  const res = await fetch(`${API_BASE}/api/heroes`);
  if (!res.ok) {
    throw new Error(`Failed to load heroes: ${res.status}`);
  }
  return (await res.json()) as HeroMeta[];
}

export function getWsUrl(): string {
  return WS_BASE;
}
