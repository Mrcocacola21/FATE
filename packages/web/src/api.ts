import type { MatchType } from "./matches/matchType";
import type {
  GameAction,
  PlayerView,
  PlayerId,
  DeliveredGameEvent,
  HeroMeta,
  GameModeId,
} from "rules";

import { API_BASE, WS_BASE } from "./api/config";
import { createApiClient } from "./api/client";

const client = createApiClient(API_BASE);


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
  events: DeliveredGameEvent[];
  revision?: number;
  streamId?: string;
}

export interface RoomSummary {
  lobbyName?: string;
  origin?: "MANUAL" | "MATCHMAKING";
  playerNames?: { P1: string | null; P2: string | null };
  hostName?: string | null;
  ratedCompatibility?: RatedCompatibility | null;
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

export interface RatedCompatibility {
  ratings: { P1: number | null; P2: number | null };
  difference: number | null;
  maxDifference: number;
  eligible: boolean;
  reason: "RATED_MATCH_INVALID_PARTICIPANTS" | "RATED_RATING_UNAVAILABLE" | "RATED_RATING_DIFFERENCE_TOO_LARGE" | null;
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
  return client.request("/api/games", value => value as CreateGameResponse, {
    method: "POST", body: JSON.stringify(params ?? {}),
  });
}

export async function getGameView(gameId: string, playerId: PlayerId): Promise<GameViewResponse> {
  return client.request(`/api/games/${encodeURIComponent(gameId)}?playerId=${playerId}`, value => value as GameViewResponse);
}

export async function sendAction(gameId: string, playerId: PlayerId, action: GameAction): Promise<ActionResponse> {
  return client.request(`/api/games/${encodeURIComponent(gameId)}/actions?playerId=${playerId}`, value => value as ActionResponse, {
    method: "POST", body: JSON.stringify(action),
  });
}

export async function listRooms(): Promise<RoomSummary[]> {
  return client.request("/rooms", value => value as RoomSummary[]);
}

export async function lookupRoom(id: string): Promise<RoomSummary> {
  return client.request(`/rooms/${encodeURIComponent(id)}`, value => value as RoomSummary);
}

export async function createRoom(params?: {
  lobbyName?: string;
  seed?: number;
  arenaId?: string;
  roomMode?: "normal" | "test";
  gameMode?: GameModeId;
  matchType?: MatchType;
  accessToken?: string;
  debugToken?: string;
}): Promise<CreateRoomResponse> {
  const { accessToken, ...body } = params ?? {};
  return client.request("/rooms", value => value as CreateRoomResponse, {
    method: "POST",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: JSON.stringify(body),
  });
}

export async function getServerCapabilities(): Promise<ServerCapabilities> {
  return client.request("/api/capabilities", value => value as ServerCapabilities);
}

export async function listHeroes(): Promise<HeroMeta[]> {
  return client.request("/api/heroes", value => value as HeroMeta[]);
}

export function getWsUrl(): string {
  return WS_BASE;
}
