import type { MatchSnapshot, Prisma } from "@prisma/client";
import { SeededRNG, type GameState, type UnitState, type SeededRngState } from "rules";
import { z } from "zod";
import type { GameRoom } from "../store";
import { gameStateV1Schema } from "./snapshotStateV1";

export const MATCH_SNAPSHOT_FORMAT_VERSION = 1 as const;
export type SerializedGameStateV1 = Omit<GameState, "units" | "events"> & {
  units: UnitState[];
  events: [];
};
export class MatchSnapshotError extends Error {
  constructor(
    readonly code:
      | "UNSUPPORTED_SNAPSHOT_VERSION"
      | "MATCH_SNAPSHOT_INVALID"
      | "MATCH_SNAPSHOT_CONFLICT",
  ) {
    super(code);
  }
}
export interface SerializedMatchSnapshot {
  matchId: string;
  revision: number;
  formatVersion: typeof MATCH_SNAPSHOT_FORMAT_VERSION;
  state: Prisma.InputJsonObject;
  rngState: Prisma.InputJsonObject;
}
export interface LoadedMatchSnapshot {
  matchId: string;
  revision: number;
  formatVersion: typeof MATCH_SNAPSHOT_FORMAT_VERSION;
  state: GameState;
  rngState: SeededRngState;
  createdAt: Date;
}
const revisionSchema = z.number().int().min(1).max(2147483647);
const rngSchema: z.ZodType<SeededRngState> = z
  .object({
    algorithm: z.literal("lcg32-numerical-recipes-v1"),
    state: z.number().int().min(0).max(0xffffffff),
  })
  .strict();

// These fields have no place in domain checkpoints, including extensible roll context.
const privateKeys = new Set([
  "accesstoken",
  "refreshtoken",
  "resumetoken",
  "connid",
  "connectionid",
  "socket",
  "socketid",
  "userid",
  "email",
  "authsession",
  "ip",
  "authorization",
  "cookie",
  "headers",
  "requestmetadata",
  "password",
  "passwordhash",
]);
/** Explicit copy: optional undefined object members mean absence; array holes/undefined fail.
 * Reject non-JSON values instead of letting stringify erase or coerce them. */
function copyJson(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (depth > 64) throw new MatchSnapshotError("MATCH_SNAPSHOT_INVALID");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Array.from(value, (item) => copyJson(item, depth + 1));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        if (privateKeys.has(key.replace(/[_-]/g, "").toLowerCase()))
          throw new MatchSnapshotError("MATCH_SNAPSHOT_INVALID");
        return [key, item === undefined ? undefined : copyJson(item, depth + 1)] as const;
      })
      .filter(([, item]) => item !== undefined);
    return Object.fromEntries(entries);
  }
  throw new MatchSnapshotError("MATCH_SNAPSHOT_INVALID");
}
function freezeJson(value: object): void {
  for (const item of Object.values(value))
    if (item !== null && typeof item === "object") freezeJson(item);
  Object.freeze(value);
}
function validatePayload(revision: number, state: unknown, rngState: unknown) {
  try {
    revisionSchema.parse(revision);
    const parsed = gameStateV1Schema.parse(state);
    if (parsed.gameOver && parsed.gameOver.endedAtRevision !== revision) throw new Error();
    if (parsed.phase !== "ended" && parsed.gameOver) throw new Error();
    // Chess mutual king defeat is a legitimate ended state without gameOver.
    if (
      parsed.phase === "ended" &&
      !parsed.gameOver &&
      parsed.ruleDeclaration.selectedRuleId !== "chess_party"
    )
      throw new Error();
    for (const [id, unit] of Object.entries(parsed.units)) if (unit.id !== id) throw new Error();
    return { state: parsed, rngState: rngSchema.parse(rngState) };
  } catch {
    throw new MatchSnapshotError("MATCH_SNAPSHOT_INVALID");
  }
}

/** State AFTER the accepted authoritative revision, copied before any async queue work. */
export function serializeMatchSnapshot(room: GameRoom): SerializedMatchSnapshot {
  if (!room.matchId || room.roomMode !== "normal" || !(room.rng instanceof SeededRNG)) {
    throw new MatchSnapshotError("MATCH_SNAPSHOT_INVALID");
  }
  // GameState.events is presentation history, never read by rules; MatchAction owns history.
  const state = normalizeSnapshotState(room.state);
  const rngState = copyJson(room.rng.exportState()) as Prisma.InputJsonObject;
  validatePayload(room.revision, state, rngState);
  const snapshot = {
    matchId: room.matchId,
    revision: room.revision,
    formatVersion: MATCH_SNAPSHOT_FORMAT_VERSION,
    state,
    rngState,
  };
  freezeJson(snapshot);
  return snapshot;
}

/** Shared JSON normalization for checkpoints and replay equality (including unit order). */
export function normalizeSnapshotState(state: GameState): Prisma.InputJsonObject {
  for (const [id, unit] of Object.entries(state.units)) {
    if (id !== unit.id) throw new MatchSnapshotError("MATCH_SNAPSHOT_INVALID");
  }
  const checkpointState: SerializedGameStateV1 = { ...state, units: Object.values(state.units), events: [] };
  return copyJson(checkpointState) as Prisma.InputJsonObject;
}

export function deserializeMatchSnapshot(record: MatchSnapshot): LoadedMatchSnapshot {
  switch (record.formatVersion) {
    case MATCH_SNAPSHOT_FORMAT_VERSION: {
      const payload = validatePayload(
        record.revision,
        copyJson(record.state),
        copyJson(record.rngState),
      );
      return {
        matchId: record.matchId,
        revision: record.revision,
        formatVersion: MATCH_SNAPSHOT_FORMAT_VERSION,
        ...payload,
        createdAt: record.createdAt,
      };
    }
    default:
      throw new MatchSnapshotError("UNSUPPORTED_SNAPSHOT_VERSION");
  }
}
