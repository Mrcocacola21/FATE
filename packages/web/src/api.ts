import type { MatchType } from "./matches/matchType";
import type {
  GameAction,
  PlayerView,
  PlayerId,
  GameEvent,
  HeroMeta,
  GameModeId,
} from "rules";

import { API_BASE, WS_BASE } from "./api/config";

export interface CreateGameResponse {
  matchType: MatchType;
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
  matchType: MatchType;
  id: string;
  createdAt: number;
  phase: "lobby" | "placement" | "battle" | "ended";
  players: { P1: boolean; P2: boolean };
  ready: { P1: boolean; P2: boolean };
  spectators: number;
  canStart: boolean;
  roomMode: "normal" | "test";
  gameMode: GameModeId;
}

export interface CreateRoomResponse {
  matchType: MatchType;
  roomId: string;
  roomMode: "normal" | "test";
  gameMode: GameModeId;
}

export interface ServerCapabilities {
  testRooms: {
    enabled: boolean;
    requiresToken: boolean;
  };
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

export async function lookupRoom(id: string): Promise<RoomSummary> {
  const res = await fetch(`${API_BASE}/rooms/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error("Room not found");
  return await res.json() as RoomSummary;
}

export async function createRoom(params?: {
  seed?: number;
  arenaId?: string;
  roomMode?: "normal" | "test";
  gameMode?: GameModeId;
  matchType?: MatchType;
  accessToken?: string;
  debugToken?: string;
}): Promise<CreateRoomResponse> {
  const body = params ? { ...params } : {};
  delete body.accessToken;
  const res = await fetch(`${API_BASE}/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(params?.accessToken ? { Authorization: `Bearer ${params.accessToken}` } : {}) },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Failed to create room: ${res.status}`);
  }

  return (await res.json()) as CreateRoomResponse;
}

export async function getServerCapabilities(): Promise<ServerCapabilities> {
  const res = await fetch(`${API_BASE}/api/capabilities`);
  if (!res.ok) {
    throw new Error(`Failed to load capabilities: ${res.status}`);
  }
  return (await res.json()) as ServerCapabilities;
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
