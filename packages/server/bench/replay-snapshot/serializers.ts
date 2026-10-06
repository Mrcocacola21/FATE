import type { MatchAction, MatchSnapshot } from "@prisma/client";
import { SeededRNG, type GameModeId } from "rules";
import { z } from "zod";
import {
  normalizeSnapshotState,
  serializeMatchSnapshot,
  deserializeMatchSnapshot,
} from "../../src/persistence/matchSnapshot";
import { gameStateV1Schema } from "../../src/persistence/snapshotStateV1";
import { replaySetupSchema } from "../../src/replay/actionSetup";
import { initialConfigSchema } from "../../src/replay/initialState";
import type { Trace } from "./scenarios";

export const initialPayloadSchema = z
  .object({ seed: z.number().int().min(1).max(0xffffffff), initialConfig: initialConfigSchema })
  .strict();
const rngSchema = z
  .object({
    algorithm: z.literal("lcg32-numerical-recipes-v1"),
    state: z.number().int().min(0).max(0xffffffff),
  })
  .strict();
export const statePayloadSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    formatVersion: z.literal(1),
    gameMode: z.enum(["standard", "classic", "draft"]),
    state: z.unknown(),
    rngState: rngSchema,
    roomSetup: replaySetupSchema.nullable(),
  })
  .strict();

/** Snapshot v1 encoding plus compact room setup only during the lobby/draft phase. */
export function serializeState(trace: Trace, revision: number): string {
  const snapshot =
    revision === 0
      ? {
          revision,
          formatVersion: 1,
          state: normalizeSnapshotState(trace.states[0]),
          rngState: trace.rngStates[0],
        }
      : serializeMatchSnapshot({
          ...trace.room,
          state: trace.states[revision],
          rng: SeededRNG.fromState(trace.rngStates[revision]),
          revision,
        });
  return JSON.stringify({
    revision,
    formatVersion: snapshot.formatVersion,
    gameMode: trace.mode,
    state: snapshot.state,
    rngState: snapshot.rngState,
    roomSetup: trace.setups[revision],
  });
}

export function loadState(serialized: string, matchId: string) {
  const payload = statePayloadSchema.parse(JSON.parse(serialized));
  if (payload.revision === 0) {
    return {
      matchId,
      revision: 0,
      formatVersion: 1 as const,
      state: gameStateV1Schema.parse(payload.state),
      rngState: payload.rngState,
      createdAt: new Date(0),
      roomSetup: payload.roomSetup,
      gameMode: payload.gameMode,
    };
  }
  return {
    ...deserializeMatchSnapshot({
      id: "benchmark",
      matchId,
      revision: payload.revision,
      formatVersion: payload.formatVersion,
      state: payload.state as MatchSnapshot["state"],
      rngState: payload.rngState,
      createdAt: new Date(0),
    }),
    roomSetup: payload.roomSetup,
    gameMode: payload.gameMode,
  };
}

/** Actual accepted-action payload and events; only match linkage and generated row ID are omitted. */
export function serializeAction(row: MatchAction): string {
  return JSON.stringify({
    revision: row.revision,
    actorUserId: row.actorUserId,
    actorSeat: row.actorSeat,
    actionType: row.actionType,
    actionPayload: row.actionPayload,
    events: row.events,
    createdAt: row.createdAt.toISOString(),
  });
}
export function loadActions(records: string[], matchId: string): MatchAction[] {
  return records.map((record) => {
    const payload = JSON.parse(record) as Omit<MatchAction, "id" | "matchId" | "createdAt"> & {
      createdAt: string;
    };
    return {
      ...payload,
      matchId,
      id: `benchmark-${payload.revision}`,
      createdAt: new Date(payload.createdAt),
    };
  });
}
export const serializeInitial = (trace: Trace) =>
  JSON.stringify(
    initialPayloadSchema.parse({ seed: trace.seed, initialConfig: trace.match.initialConfig }),
  );
export const figureConfiguration = (mode: GameModeId) =>
  mode === "standard"
    ? "Jebe archer for both players; other classes default"
    : mode === "classic"
      ? "production classic armies"
      : "safe class draft; first legal hero in stable production pool order";
