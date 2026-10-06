import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import { SeededRNG, rollD6, applyAction } from "rules";
import { ReplayService, type ReconstructedMatchState } from "../../src/services/replayService";
import { applicationMetrics } from "../../src/observability/metrics";
import { normalizeSnapshotState } from "../../src/persistence/matchSnapshot";
import { restoreDraftHistory } from "../../src/replay/actionSetup";
import { deserializeReplayAction } from "../../src/replay/deserializeAction";
import { withAcceptedRevision } from "../../src/replay/stateRevision";
import type { Trace } from "./scenarios";
import type { Config } from "./config";
import {
  serializeAction,
  serializeInitial,
  serializeState,
  initialPayloadSchema,
  loadActions,
  loadState,
} from "./serializers";
import { statistics, sumBytes, utf8Bytes, snapshotRevisions } from "./metrics";

export type StrategyName = "FULL_STATE" | "ACTION_LOG" | "SNAPSHOT_ACTION_LOG";
export interface Dataset {
  strategy: StrategyName;
  interval: number | null;
  length: number;
  initial: string | null;
  actions: string[];
  states: Map<number, string>;
  snapshots: Map<number, string>;
  serialization: {
    initializationLatencyMs: number;
    actionLatencyMs: number[];
    stateLatencyMs: number[];
    snapshotLatencyMs: number[];
    buildLatencyMs: number;
  };
}
export interface Prepared {
  initial: string | null;
  state: string | null;
  snapshot: string | null;
  actions: string[];
  baseRevision: number;
}
export interface Backend {
  load(target: number): Promise<Prepared>;
  databaseBytes: number | null;
  databaseWriteLatencyMs: number[];
}

export function buildDataset(
  trace: Trace,
  strategy: StrategyName,
  interval: number | null,
  policy: Config["snapshotPolicy"],
): Dataset {
  const started = performance.now();
  const dataset: Dataset = {
    strategy,
    interval,
    length: trace.actions.length,
    initial: null,
    actions: [],
    states: new Map(),
    snapshots: new Map(),
    serialization: {
      initializationLatencyMs: 0,
      actionLatencyMs: [],
      stateLatencyMs: [],
      snapshotLatencyMs: [],
      buildLatencyMs: 0,
    },
  };
  const measured = <T>(run: () => T, samples: number[]): T => {
    const start = performance.now();
    const value = run();
    samples.push(performance.now() - start);
    return value;
  };
  const initStart = performance.now();
  if (strategy === "FULL_STATE") dataset.states.set(0, serializeState(trace, 0));
  else dataset.initial = serializeInitial(trace);
  dataset.serialization.initializationLatencyMs = performance.now() - initStart;
  if (strategy === "FULL_STATE") {
    for (let revision = 1; revision <= dataset.length; revision++)
      dataset.states.set(
        revision,
        measured(() => serializeState(trace, revision), dataset.serialization.stateLatencyMs),
      );
  } else {
    dataset.actions = trace.actions.map((row) =>
      measured(() => serializeAction(row), dataset.serialization.actionLatencyMs),
    );
    if (strategy === "SNAPSHOT_ACTION_LOG") {
      if (!interval) throw new Error("SNAPSHOT_INTERVAL_REQUIRED");
      for (const revision of snapshotRevisions(
        dataset.length,
        interval,
        policy === "production_policy" && trace.stoppedReason === "game_completed",
      )) {
        dataset.snapshots.set(
          revision,
          measured(() => serializeState(trace, revision), dataset.serialization.snapshotLatencyMs),
        );
      }
    }
  }
  dataset.serialization.buildLatencyMs = performance.now() - started;
  return dataset;
}

export function storageMetrics(dataset: Dataset) {
  const initialStateBytes = dataset.initial ? utf8Bytes(dataset.initial) : 0;
  const actionSizesBytes = dataset.actions.map(utf8Bytes);
  const stateSizesBytes = [...dataset.states.values()].map(utf8Bytes);
  const snapshotSizesBytes = [...dataset.snapshots.values()].map(utf8Bytes);
  const actionLogBytes = sumBytes(dataset.actions),
    snapshotBytes = sumBytes([...dataset.snapshots.values()]),
    fullStateBytes = sumBytes([...dataset.states.values()]);
  const totalLogicalBytes = initialStateBytes + actionLogBytes + snapshotBytes + fullStateBytes;
  const persistedRecordCount =
    (dataset.initial ? 1 : 0) +
    dataset.actions.length +
    dataset.states.size +
    dataset.snapshots.size;
  return {
    initialStateBytes,
    actionLogBytes,
    snapshotBytes,
    fullStateBytes,
    metadataBytes: 0,
    totalLogicalBytes,
    actionCount: dataset.length,
    persistedActionCount: dataset.actions.length,
    snapshotCount: dataset.snapshots.size,
    stateCount: dataset.states.size,
    snapshotRevisions: [...dataset.snapshots.keys()],
    persistedRecordCount,
    bytesPerRevision: dataset.length ? totalLogicalBytes / dataset.length : 0,
    writeOperationsPerRevision: dataset.length ? (persistedRecordCount - 1) / dataset.length : 0,
    actionSizesBytes,
    stateSizesBytes,
    snapshotSizesBytes,
    actionSizeStatisticsBytes: statistics(actionSizesBytes),
    stateSizeStatisticsBytes: statistics(stateSizesBytes),
    snapshotSizeStatisticsBytes: statistics(snapshotSizesBytes),
  };
}

export function memoryBackend(dataset: Dataset): Backend {
  return {
    databaseBytes: null,
    databaseWriteLatencyMs: [],
    async load(target) {
      const baseRevision =
        dataset.strategy === "FULL_STATE"
          ? target
          : ([...dataset.snapshots.keys()].filter((revision) => revision <= target).at(-1) ?? 0);
      return {
        initial: dataset.initial,
        state: dataset.states.get(target) ?? null,
        snapshot: dataset.snapshots.get(baseRevision) ?? null,
        actions:
          dataset.strategy === "FULL_STATE" ? [] : dataset.actions.slice(baseRevision, target),
        baseRevision,
      };
    },
  };
}

// Same production guard/instrumentation call for all strategies; controlled no-op metrics/logger.
// No live registry observations or logs occur within the latency boundary.
const metrics = Object.create(applicationMetrics) as typeof applicationMetrics;
metrics.observeReplay = () => {};
const logger = { error() {} };

export async function reconstruct(
  trace: Trace,
  dataset: Dataset,
  prepared: Prepared,
  target: number,
): Promise<ReconstructedMatchState> {
  if (dataset.strategy === "FULL_STATE") {
    if (!prepared.state) throw new Error("MISSING_FULL_STATE");
    const snapshot = loadState(prepared.state, trace.match.id);
    if (snapshot.revision !== target || snapshot.gameMode !== trace.mode)
      throw new Error("FULL_STATE_REVISION_MISMATCH");
    const result: ReconstructedMatchState = {
      matchId: trace.match.id,
      revision: target,
      state: snapshot.state,
      rngState: snapshot.rngState,
      draftState: snapshot.roomSetup ? restoreDraftHistory(snapshot.roomSetup) : null,
      figureSets: snapshot.roomSetup?.armies ?? {},
      base: { type: "snapshot", revision: target },
      actionsApplied: 0,
      verification: "not_checked",
    };
    // Preserve the read-only service instrumentation boundary consistently.
    metrics.observeReplay("snapshot_tail", "success", 0);
    return result;
  }
  if (!prepared.initial) throw new Error("MISSING_INITIAL_CONFIGURATION");
  const initial = initialPayloadSchema.parse(JSON.parse(prepared.initial));
  const match = { ...trace.match, seed: initial.seed, initialConfig: initial.initialConfig };
  const service = new ReplayService(
    { findById: async () => match },
    {
      findInRevisionRange: async (_id, base, ceiling) => {
        if (base !== prepared.baseRevision || ceiling !== target)
          throw new Error("UNEXPECTED_ACTION_RANGE");
        return loadActions(prepared.actions, match.id);
      },
    },
    {
      loadSnapshot: async (_id, revision) =>
        prepared.snapshot && prepared.baseRevision === revision
          ? loadState(prepared.snapshot, match.id)
          : null,
      loadLatestSnapshotAtOrBefore: async () =>
        prepared.snapshot ? loadState(prepared.snapshot, match.id) : null,
    },
    metrics,
    logger,
  );
  return service.reconstructAtRevision(match.id, target);
}

export function assertCorrect(
  trace: Trace,
  result: ReconstructedMatchState,
  target: number,
  expectedBase: number,
): void {
  if (
    result.revision !== target ||
    result.base.revision !== expectedBase ||
    result.actionsApplied !== target - expectedBase ||
    !isDeepStrictEqual(
      normalizeSnapshotState(result.state),
      normalizeSnapshotState(trace.states[target]),
    ) ||
    !isDeepStrictEqual(result.rngState, trace.rngStates[target])
  )
    throw new Error(`RECONSTRUCTION_MISMATCH:${trace.id}:${target}`);
  // Compare a real random-dependent domain primitive and the following continuation state.
  const restored = SeededRNG.fromState(result.rngState),
    reference = SeededRNG.fromState(trace.rngStates[target]);
  for (let i = 0; i < 16; i++)
    if (rollD6(restored) !== rollD6(reference))
      throw new Error(`RNG_CONTINUATION_MISMATCH:${trace.id}:${target}`);
  if (!isDeepStrictEqual(restored.exportState(), reference.exportState()))
    throw new Error("RNG_CONTINUATION_STATE_MISMATCH");
  // When a pending dice/choice action has a recorded successor, verify actual gameplay continuation too.
  if (result.state.pendingRoll && trace.actions[target]?.actionType === "resolvePendingRoll") {
    const next = deserializeReplayAction(trace.actions[target]).action;
    if (next.type !== "resolvePendingRoll") throw new Error("RNG_CONTINUATION_ACTION_MISMATCH");
    const rng = SeededRNG.fromState(result.rngState);
    const continuation = applyAction(structuredClone(result.state), next, rng);
    const state = withAcceptedRevision(result.state, continuation.state, target + 1);
    if (
      continuation.rejectionReason ||
      !isDeepStrictEqual(
        normalizeSnapshotState(state),
        normalizeSnapshotState(trace.states[target + 1]),
      ) ||
      !isDeepStrictEqual(rng.exportState(), trace.rngStates[target + 1])
    )
      throw new Error("RNG_GAMEPLAY_CONTINUATION_MISMATCH");
  }
}
