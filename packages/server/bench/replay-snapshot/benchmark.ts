import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { z } from "zod";
import { configSchema, parseConfig, type Config } from "./config";
import { generateTrace, selectTargets, POLICY_VERSION } from "./scenarios";
import {
  serializeState,
  serializeAction,
  serializeInitial,
  figureConfiguration,
} from "./serializers";
import { utf8Bytes, statistics } from "./metrics";
import {
  buildDataset,
  storageMetrics,
  memoryBackend,
  reconstruct,
  assertCorrect,
  type Backend,
  type StrategyName,
  type Dataset,
} from "./strategies";
import { PostgresRun, requireBenchmarkDatabaseUrl } from "./postgres";
import {
  latency,
  writeResults,
  type Result,
  type TargetResult,
  type StrategyResult,
} from "./output";

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export async function runBenchmark(
  input: Config,
  progress: (message: string) => void = () => {},
): Promise<{ result: Result; paths: string[] }> {
  const config = configSchema.parse(input);
  // Safety runs before trace generation or any database client construction.
  const databaseUrl = config.storageBackend === "postgres" ? requireBenchmarkDatabaseUrl() : null;
  const started = performance.now(),
    startedAt = new Date().toISOString();
  const dirty = git(["status", "--porcelain"]);
  if (config.strict && (dirty === null || dirty.length > 0))
    throw new Error("STRICT_REQUIRES_CLEAN_GIT_WORKTREE");
  const result: Result = {
    schemaVersion: 1,
    harnessVersion: "1.0.0",
    status: "completed",
    run: { startedAt, completedAt: startedAt, durationMs: 0 },
    config,
    environment: {
      nodeVersion: process.version,
      v8Version: process.versions.v8,
      platform: process.platform,
      architecture: process.arch,
      cpuModel: os.cpus()[0]?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      gitCommit: git(["rev-parse", "HEAD"]),
      gitDirty: dirty === null ? null : dirty.length > 0,
      postgresVersion: null,
      timer: "performance.now",
      latencyUnits: "ms",
      storageUnits: "UTF-8 bytes",
      instrumentation: "no-op replay metrics; silent logger",
      cachePolicy: "warm process; no cache flushing or forced GC",
      strategyOrder: "all warm first; deterministic rotation per iteration",
      // Record runtime flags only; tsx loader paths can reveal personal directory names.
      execArgv: process.execArgv.filter((arg) =>
        /^--(expose-gc|jitless|no-opt|max-old-space-size=\d+)$/.test(arg),
      ),
    },
    scenarios: [],
    error: null,
  };
  let stage = "database_initialization",
    scenarioId: string | null = null,
    strategyName: string | null = null,
    targetRevision: number | null = null;
  const postgres = databaseUrl ? new PostgresRun(databaseUrl) : null;
  const releases: (() => Promise<void>)[] = [];
  try {
    if (postgres) {
      await postgres.open();
      result.environment.postgresVersion = postgres.version;
    }
    for (const mode of config.modes)
      for (const type of config.scenarios)
        for (const seed of config.seeds)
          for (const requested of config.actions) {
            stage = "trace_generation";
            strategyName = null;
            targetRevision = null;
            scenarioId = `${mode}-${type}-seed-${seed}-actions-${requested}`;
            progress(`Generating ${scenarioId}`);
            const trace = generateTrace(mode, seed, requested, type);
            const targets = selectTargets(trace.actions.length, config, seed);
            const scenario: Result["scenarios"][number] = {
              scenarioId: trace.id,
              seed,
              rngSeed: seed,
              policySeed: trace.policySeed,
              gameMode: mode,
              scenarioType: type,
              policyVersion: POLICY_VERSION,
              figureConfiguration: figureConfiguration(mode),
              initialConfiguration: JSON.parse(serializeInitial(trace)),
              requestedActionCount: requested,
              actionCount: trace.actions.length,
              finalRevision: trace.actions.length,
              phase: trace.room.state.phase,
              stoppedReason: trace.stoppedReason,
              traceIdentity: trace.identity,
              snapshotFormatVersion: 1,
              actionSetupFormatVersion: 1,
              actionTypeCounts: trace.actions.reduce<Record<string, number>>((counts, action) => {
                counts[action.actionType] = (counts[action.actionType] ?? 0) + 1;
                return counts;
              }, {}),
              generationLatencyMs: trace.generationLatencyMs,
              targetRevisions: targets,
              referenceStateSizesBytes: trace.states.map((_, revision) =>
                utf8Bytes(serializeState(trace, revision)),
              ),
              referenceActionSizesBytes: trace.actions.map((action) =>
                utf8Bytes(serializeAction(action)),
              ),
              strategies: [],
            };
            result.scenarios.push(scenario);
            stage = "strategy_serialization";
            const definitions: [StrategyName, number | null][] = [
              ["FULL_STATE", null],
              ["ACTION_LOG", null],
              ...config.snapshotIntervals.map(
                (interval) => ["SNAPSHOT_ACTION_LOG", interval] as [StrategyName, number],
              ),
            ];
            const datasets = definitions.map(([name, interval]) =>
              buildDataset(trace, name, interval, config.snapshotPolicy),
            );
            const baselineBytes = storageMetrics(datasets[1]).totalLogicalBytes,
              fullBytes = storageMetrics(datasets[0]).totalLogicalBytes;
            const groups: { dataset: Dataset; backend: Backend; target: TargetResult }[] = [];
            const rotation = seed % datasets.length;
            const ordered = [...datasets.slice(rotation), ...datasets.slice(0, rotation)];
            for (const dataset of ordered) {
              stage = "storage_build";
              strategyName = `${dataset.strategy}:${dataset.interval ?? "none"}`;
              const backend = postgres ? await postgres.persist(dataset) : memoryBackend(dataset);
              if ("release" in backend && typeof backend.release === "function")
                releases.push(backend.release as () => Promise<void>);
              const storage = storageMetrics(dataset);
              const strategy: StrategyResult = {
                strategy: dataset.strategy,
                snapshotInterval: dataset.interval,
                traceIdentity: trace.identity,
                storage: {
                  ...storage,
                  databaseBytes: backend.databaseBytes,
                  storageAmplificationVsActionLog: storage.totalLogicalBytes / baselineBytes,
                  storageSavingVsFullStatePercent:
                    (1 - storage.totalLogicalBytes / fullBytes) * 100,
                },
                serialization: {
                  ...dataset.serialization,
                  actionStatisticsMs: statistics(dataset.serialization.actionLatencyMs),
                  stateStatisticsMs: statistics(dataset.serialization.stateLatencyMs),
                  snapshotStatisticsMs: statistics(dataset.serialization.snapshotLatencyMs),
                },
                databaseWriteLatency: latency(backend.databaseWriteLatencyMs),
                reconstruction: [],
                replayedActionsStatistics: statistics([]),
                reconstructionStatisticsMs: statistics([]),
              };
              scenario.strategies.push(strategy);
              for (const target of targets) {
                const base =
                  dataset.strategy === "FULL_STATE"
                    ? target
                    : (storage.snapshotRevisions.filter((revision) => revision <= target).at(-1) ??
                      0);
                const group: TargetResult = {
                  targetRevision: target,
                  baseRevision: base,
                  replayedActions: target - base,
                  replayedActionRatio: target ? (target - base) / target : 0,
                  correct: false,
                  rngContinuationCorrect: false,
                  loadLatency: latency([]),
                  reconstructionLatency: latency([]),
                  totalLatency: latency([]),
                };
                strategy.reconstruction.push(group);
                groups.push({ dataset, backend, target: group });
              }
            }
            stage = "correctness_validation";
            for (const group of groups) {
              strategyName = `${group.dataset.strategy}:${group.dataset.interval ?? "none"}`;
              targetRevision = group.target.targetRevision;
              const prepared = await group.backend.load(targetRevision);
              assertCorrect(
                trace,
                await reconstruct(trace, group.dataset, prepared, targetRevision),
                targetRevision,
                group.target.baseRevision,
              );
              group.target.correct = true;
              group.target.rngContinuationCorrect = true;
            }
            stage = "warmup";
            for (let warmup = 0; warmup < config.warmup; warmup++)
              for (const group of groups) {
                strategyName = `${group.dataset.strategy}:${group.dataset.interval ?? "none"}`;
                targetRevision = group.target.targetRevision;
                const prepared = await group.backend.load(group.target.targetRevision);
                await reconstruct(trace, group.dataset, prepared, group.target.targetRevision);
              }
            stage = "measurement";
            // Sequential measurements. Rotate the starting group to spread JIT/GC/order effects.
            for (let iteration = 0; iteration < config.iterations; iteration++) {
              const offset = iteration % groups.length;
              for (const group of [...groups.slice(offset), ...groups.slice(0, offset)]) {
                const target = group.target;
                strategyName = `${group.dataset.strategy}:${group.dataset.interval ?? "none"}`;
                targetRevision = target.targetRevision;
                const totalStart = performance.now();
                const prepared = await group.backend.load(target.targetRevision);
                const loadEnd = performance.now();
                const reconstructed = await reconstruct(
                  trace,
                  group.dataset,
                  prepared,
                  target.targetRevision,
                );
                const end = performance.now();
                // Validation is outside the timer. Never record latency for an invalid result.
                try {
                  assertCorrect(trace, reconstructed, target.targetRevision, target.baseRevision);
                } catch (error) {
                  target.correct = false;
                  target.rngContinuationCorrect = false;
                  throw error;
                }
                // Store the actual count returned by the production service, after independent checks.
                target.replayedActions = reconstructed.actionsApplied;
                target.loadLatency.samplesMs.push(loadEnd - totalStart);
                target.reconstructionLatency.samplesMs.push(end - loadEnd);
                target.totalLatency.samplesMs.push(end - totalStart);
              }
            }
            for (const strategy of scenario.strategies) {
              for (const target of strategy.reconstruction)
                for (const timing of [
                  target.loadLatency,
                  target.reconstructionLatency,
                  target.totalLatency,
                ])
                  timing.statisticsMs = statistics(timing.samplesMs);
              strategy.replayedActionsStatistics = statistics(
                strategy.reconstruction.map((target) => target.replayedActions),
              );
              strategy.reconstructionStatisticsMs = statistics(
                strategy.reconstruction.flatMap((target) => target.reconstructionLatency.samplesMs),
              );
            }
            progress(
              `${scenario.scenarioId}: ${scenario.actionCount}/${requested} actions, ${targets.length} targets, correctness passed`,
            );
            stage = "database_cleanup";
            while (releases.length) await releases.pop()!();
          }
  } catch (error) {
    result.status = "failed";
    result.error = {
      category:
        error instanceof Error && error.message.startsWith("RECONSTRUCTION_MISMATCH")
          ? "RECONSTRUCTION_MISMATCH"
          : error instanceof Error && error.message.startsWith("RNG_")
            ? "RNG_CONTINUATION_MISMATCH"
            : "BENCHMARK_STAGE_FAILED",
      stage,
      scenarioId,
      strategy: strategyName,
      targetRevision,
    };
  } finally {
    try {
      while (releases.length) await releases.pop()!();
      if (postgres) await postgres.close();
    } catch {
      result.status = "failed";
      result.error = {
        category: "BENCHMARK_CLEANUP_FAILED",
        stage: "database_cleanup",
        scenarioId,
        strategy: strategyName,
        targetRevision,
      };
    }
  }
  // Also finalize partial groups for a validated, safe failure artifact.
  for (const scenario of result.scenarios)
    for (const strategy of scenario.strategies)
      for (const target of strategy.reconstruction)
        for (const timing of [
          target.loadLatency,
          target.reconstructionLatency,
          target.totalLatency,
        ])
          timing.statisticsMs = statistics(timing.samplesMs);
  result.run.completedAt = new Date().toISOString();
  result.run.durationMs = performance.now() - started;
  const paths = await writeResults(result);
  if (result.status === "failed")
    throw new Error(`BENCHMARK_FAILED:${result.error!.stage}. Diagnostic: ${paths[0]}`);
  return { result, paths };
}

async function main() {
  try {
    const { result, paths } = await runBenchmark(parseConfig(process.argv.slice(2)), (message) =>
      console.log(message),
    );
    console.table(
      result.scenarios.flatMap((scenario) =>
        scenario.strategies.map((strategy) => ({
          scenario: scenario.scenarioId,
          strategy: strategy.strategy,
          interval: strategy.snapshotInterval,
          actions: scenario.actionCount,
          logicalBytes: strategy.storage.totalLogicalBytes,
          databaseBytes: strategy.storage.databaseBytes,
          replayMean: strategy.replayedActionsStatistics.mean.toFixed(2),
          p50Ms: strategy.reconstructionStatisticsMs.p50.toFixed(3),
          p95Ms: strategy.reconstructionStatisticsMs.p95.toFixed(3),
          p99Ms: strategy.reconstructionStatisticsMs.p99.toFixed(3),
        })),
      ),
    );
    console.log(
      `Completed in ${(result.run.durationMs / 1000).toFixed(2)}s. Artifacts:\n${paths.join("\n")}`,
    );
  } catch (error) {
    // Do not print connection errors/credentials from drivers.
    console.error(
      error instanceof z.ZodError
        ? `Invalid configuration or artifact: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`
        : error instanceof Error &&
            /^(BENCHMARK_FAILED|STRICT_REQUIRES|Invalid or duplicate|Benchmark requires|Refusing to run|BENCHMARK_DATABASE_URL|TEST_DATABASE_URL)/.test(
              error.message,
            )
          ? error.message
          : "Benchmark failed; check configuration, exclusive output path, and local test database availability.",
    );
    process.exitCode = 1;
  }
}
if (require.main === module) void main();
