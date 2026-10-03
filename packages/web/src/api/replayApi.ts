import type { ReplayUnit, ReplayView, Coord } from "rules";
import { authClient } from "../auth/authStore";
import { ApiError, isRecord, type ApiClient } from "./client";
import type { ReplayMetadata, ReplayStateResponse, ReplayTimelineEntry } from "../replay/types";

const fail = (): never => {
  throw new ApiError("INVALID_RESPONSE");
};
const record = (v: unknown) => (isRecord(v) ? v : fail());
const string = (v: unknown) => (typeof v === "string" ? v : fail());
const nullableString = (v: unknown) => (v === null ? null : string(v));
const integer = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : fail();
const boolean = (v: unknown) => (typeof v === "boolean" ? v : fail());
function choice<T extends string>(v: unknown, choices: readonly T[]): T {
  return typeof v === "string" && choices.includes(v as T) ? (v as T) : fail();
}
const seat = (v: unknown) => choice(v, ["P1", "P2"] as const);
const nullableSeat = (v: unknown) => (v === null ? null : seat(v));
function coord(value: unknown): Coord {
  const v = record(value);
  return { col: integer(v.col), row: integer(v.row) };
}
function timeline(value: unknown): ReplayTimelineEntry {
  const v = record(value);
  return {
    revision: integer(v.revision),
    actorSeat: nullableSeat(v.actorSeat),
    actionType: string(v.actionType),
    createdAt: string(v.createdAt),
  };
}
export function parseReplayMetadata(value: unknown): ReplayMetadata {
  const v = record(value);
  if (!Array.isArray(v.participants) || !Array.isArray(v.timeline)) return fail();
  const initialRevision = integer(v.initialRevision),
    finalRevision = integer(v.finalRevision);
  const entries = v.timeline.map(timeline);
  if (
    initialRevision !== 0 ||
    finalRevision < 1 ||
    entries[entries.length - 1]?.revision !== finalRevision ||
    entries.some((entry, i) => entry.revision <= (i ? entries[i - 1].revision : initialRevision))
  )
    return fail();
  const participants = v.participants.map((value: unknown) => {
    const p = record(value);
    return {
      seat: seat(p.seat),
      userId: nullableString(p.userId),
      displayName: string(p.displayName),
      username: nullableString(p.username),
      avatarUrl: nullableString(p.avatarUrl),
      outcome: p.outcome === null ? null : choice(p.outcome, ["WIN", "LOSS", "DRAW"] as const),
    };
  });
  if (participants.length !== 2 || new Set(participants.map((p) => p.seat)).size !== 2)
    return fail();
  return {
    matchId: string(v.matchId),
    status: choice(v.status, ["FINISHED"]),
    gameMode: string(v.gameMode),
    initialRevision,
    finalRevision,
    participants,
    winnerSeat: nullableSeat(v.winnerSeat),
    finishReason: nullableString(v.finishReason),
    startedAt: nullableString(v.startedAt),
    finishedAt: nullableString(v.finishedAt),
    durationMs: v.durationMs === null ? null : integer(v.durationMs),
    timeline: entries,
  };
}
const flags = [
  "transformed",
  "blindUntilOwnTurnStart",
  "immobilizedUntilOwnTurnStart",
  "duolingoBerserkerUnlocked",
  "gutsBerserkModeActive",
  "kanekiCentipedeUnlocked",
  "mettatonExUnlocked",
  "mettatonNeoUnlocked",
  "papyrusUnbelieverActive",
  "sansUnbelieverUnlocked",
  "undyneImmortalActive",
  "friskPacifismDisabled",
] as const;
function unit(value: unknown): ReplayUnit {
  const v = record(value);
  if (typeof v.hp !== "number" || !Number.isFinite(v.hp)) return fail();
  const u: ReplayUnit = {
    id: string(v.id),
    owner: seat(v.owner),
    class: choice(v.class, [
      "knight",
      "archer",
      "rider",
      "assassin",
      "berserker",
      "spearman",
      "trickster",
    ] as const),
    hp: v.hp,
    position: v.position === null ? null : coord(v.position),
    isAlive: boolean(v.isAlive),
    isStealthed: boolean(v.isStealthed),
    isChicken: boolean(v.isChicken),
    bunkerActive: boolean(v.bunkerActive),
    boneStatus: v.boneStatus === null ? null : choice(v.boneStatus, ["blue", "orange"] as const),
    boneSource:
      v.boneSource === null ? null : choice(v.boneSource, ["papyrus", "sansBoneField"] as const),
  };
  for (const key of ["figureId", "heroId"] as const)
    if (v[key] !== undefined) u[key] = string(v[key]);
  for (const key of flags) if (v[key] !== undefined) u[key] = boolean(v[key]);
  return u;
}
export function parseReplayState(value: unknown): ReplayStateResponse {
  const v = record(value),
    s = record(v.state),
    units = record(s.units);
  if (!Array.isArray(s.forestMarkers) || !Array.isArray(s.stakeMarkers)) return fail();
  const state: ReplayView = {
    boardSize: integer(s.boardSize),
    phase: choice(s.phase, ["lobby", "placement", "battle", "ended"] as const),
    currentPlayer: seat(s.currentPlayer),
    turnNumber: integer(s.turnNumber),
    roundNumber: integer(s.roundNumber),
    activeUnitId: nullableString(s.activeUnitId),
    arenaId: nullableString(s.arenaId),
    units: Object.fromEntries(
      Object.entries(units).map(([id, value]) => {
        const u = unit(value);
        if (id !== u.id) return fail();
        return [id, u];
      }),
    ),
    forestMarkers: s.forestMarkers.map((value: unknown) => {
      const m = record(value);
      return { owner: seat(m.owner), position: coord(m.position) };
    }),
    stakeMarkers: s.stakeMarkers.map((value: unknown) => {
      const m = record(value);
      return { position: coord(m.position), isRevealed: boolean(m.isRevealed) };
    }),
  };
  if (s.boneFieldTurnsLeft !== undefined) state.boneFieldTurnsLeft = integer(s.boneFieldTurnsLeft);
  if (s.arenaEffects !== undefined) {
    if (!Array.isArray(s.arenaEffects)) return fail();
    state.arenaEffects = s.arenaEffects.map((value: unknown) => {
      const e = record(value);
      return {
        id: string(e.id),
        effectId: string(e.effectId),
        remaining: integer(e.remaining),
        durationUnit: choice(e.durationUnit, ["turn"] as const),
        startedTurnNumber: integer(e.startedTurnNumber),
      };
    });
  }
  if (state.boardSize < 1 || state.boardSize > 32) return fail();
  return {
    matchId: string(v.matchId),
    revision: integer(v.revision),
    state,
    action: v.action === null ? null : timeline(v.action),
  };
}
export function createReplayApi(client: ApiClient) {
  return {
    async getMetadata(id: string, signal?: AbortSignal) {
      const response = await client.request(
        `/api/matches/${encodeURIComponent(id)}/replay`,
        parseReplayMetadata,
        { signal },
      );
      if (response.matchId !== id) return fail();
      return response;
    },
    async getState(id: string, revision: number, signal?: AbortSignal) {
      const response = await client.request(
        `/api/matches/${encodeURIComponent(id)}/replay/state?revision=${revision}`,
        parseReplayState,
        { signal },
      );
      if (response.matchId !== id || response.revision !== revision) return fail();
      return response;
    },
  };
}
export const replayApi = createReplayApi(authClient);
