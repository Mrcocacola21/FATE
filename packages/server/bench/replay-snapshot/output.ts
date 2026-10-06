import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { configSchema } from "./config";
import { statistics, statsSchema, snapshotRevisions } from "./metrics";

// Same bounded adapter pattern as production openapi/schemas.ts: the converter's
// zod/v3 declarations differ from this repository's top-level Zod declarations.
const toJsonSchema = zodToJsonSchema as unknown as (
  schema: z.ZodTypeAny,
  name: string,
) => Record<string, unknown>;

const count = z.number().int().nonnegative();
const measure = z.number().finite().nonnegative();
const samples = z.array(measure);
const latencySchema = z.object({ samplesMs: samples, statisticsMs: statsSchema }).strict();
const targetSchema = z
  .object({
    targetRevision: count,
    baseRevision: count,
    replayedActions: count,
    replayedActionRatio: measure,
    correct: z.boolean(),
    rngContinuationCorrect: z.boolean(),
    loadLatency: latencySchema,
    reconstructionLatency: latencySchema,
    totalLatency: latencySchema,
  })
  .strict();
const storageSchema = z
  .object({
    initialStateBytes: count,
    actionLogBytes: count,
    snapshotBytes: count,
    fullStateBytes: count,
    metadataBytes: count,
    totalLogicalBytes: count,
    databaseBytes: count.nullable(),
    actionCount: count,
    persistedActionCount: count,
    snapshotCount: count,
    stateCount: count,
    snapshotRevisions: z.array(count),
    persistedRecordCount: count,
    bytesPerRevision: measure,
    writeOperationsPerRevision: measure,
    actionSizesBytes: z.array(count),
    stateSizesBytes: z.array(count),
    snapshotSizesBytes: z.array(count),
    actionSizeStatisticsBytes: statsSchema,
    stateSizeStatisticsBytes: statsSchema,
    snapshotSizeStatisticsBytes: statsSchema,
    storageAmplificationVsActionLog: measure,
    storageSavingVsFullStatePercent: z.number().finite(),
  })
  .strict();
const strategySchema = z
  .object({
    strategy: z.enum(["FULL_STATE", "ACTION_LOG", "SNAPSHOT_ACTION_LOG"]),
    snapshotInterval: count.nullable(),
    traceIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    storage: storageSchema,
    serialization: z
      .object({
        initializationLatencyMs: measure,
        actionLatencyMs: samples,
        stateLatencyMs: samples,
        snapshotLatencyMs: samples,
        buildLatencyMs: measure,
        actionStatisticsMs: statsSchema,
        stateStatisticsMs: statsSchema,
        snapshotStatisticsMs: statsSchema,
      })
      .strict(),
    databaseWriteLatency: latencySchema,
    reconstruction: z.array(targetSchema),
    replayedActionsStatistics: statsSchema,
    reconstructionStatisticsMs: statsSchema,
  })
  .strict();
const scenarioSchema = z
  .object({
    scenarioId: z.string(),
    seed: count,
    rngSeed: count,
    policySeed: count,
    gameMode: z.enum(["standard", "classic", "draft"]),
    scenarioType: z.enum(["controlled", "natural"]),
    policyVersion: z.string(),
    figureConfiguration: z.string(),
    initialConfiguration: z.object({ seed: count, initialConfig: z.record(z.unknown()) }).strict(),
    requestedActionCount: count,
    actionCount: count,
    finalRevision: count,
    phase: z.string(),
    stoppedReason: z.enum(["target_reached", "game_completed"]),
    traceIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    snapshotFormatVersion: z.literal(1),
    actionSetupFormatVersion: z.literal(1),
    actionTypeCounts: z.record(count),
    generationLatencyMs: measure,
    targetRevisions: z.array(count),
    referenceStateSizesBytes: z.array(count),
    referenceActionSizesBytes: z.array(count),
    strategies: z.array(strategySchema),
  })
  .strict();
const artifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    harnessVersion: z.literal("1.0.0"),
    status: z.enum(["completed", "failed"]),
    run: z
      .object({
        startedAt: z.string().datetime(),
        completedAt: z.string().datetime(),
        durationMs: measure,
      })
      .strict(),
    config: configSchema,
    environment: z
      .object({
        nodeVersion: z.string(),
        v8Version: z.string(),
        platform: z.string(),
        architecture: z.string(),
        cpuModel: z.string(),
        logicalCpuCount: count,
        totalMemoryBytes: count,
        gitCommit: z.string().nullable(),
        gitDirty: z.boolean().nullable(),
        postgresVersion: z.string().nullable(),
        timer: z.literal("performance.now"),
        latencyUnits: z.literal("ms"),
        storageUnits: z.literal("UTF-8 bytes"),
        instrumentation: z.literal("no-op replay metrics; silent logger"),
        cachePolicy: z.literal("warm process; no cache flushing or forced GC"),
        strategyOrder: z.literal("all warm first; deterministic rotation per iteration"),
        execArgv: z.array(z.string()),
      })
      .strict(),
    scenarios: z.array(scenarioSchema),
    error: z
      .object({
        category: z.string(),
        stage: z.string(),
        scenarioId: z.string().nullable(),
        strategy: z.string().nullable(),
        targetRevision: count.nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const resultSchema = artifactSchema.superRefine((result, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  if (result.status === "completed" && (result.error || !result.scenarios.length))
    issue("Completed result must contain scenarios and no error");
  if (result.status === "failed" && !result.error)
    issue("Failed result needs a safe error category");
  for (const scenario of result.scenarios) {
    if (
      scenario.actionCount !== scenario.finalRevision ||
      scenario.referenceStateSizesBytes.length !== scenario.actionCount + 1 ||
      scenario.referenceActionSizesBytes.length !== scenario.actionCount
    )
      issue("Invalid reference sizes/counts");
    const expectedStrategies = 2 + result.config.snapshotIntervals.length;
    if (result.status === "completed" && scenario.strategies.length !== expectedStrategies)
      issue("Missing strategy");
    if (
      new Set(
        scenario.strategies.map((strategy) => `${strategy.strategy}:${strategy.snapshotInterval}`),
      ).size !== scenario.strategies.length
    )
      issue("Duplicate strategy/interval");
    for (const strategy of scenario.strategies) {
      const storage = strategy.storage;
      if (
        strategy.traceIdentity !== scenario.traceIdentity ||
        storage.actionCount !== scenario.actionCount
      )
        issue("Strategies must share trace identity and length");
      if (
        storage.totalLogicalBytes !==
        storage.initialStateBytes +
          storage.actionLogBytes +
          storage.snapshotBytes +
          storage.fullStateBytes +
          storage.metadataBytes
      )
        issue("Storage components do not sum");
      if (
        storage.snapshotCount !== storage.snapshotRevisions.length ||
        storage.stateCount !== storage.stateSizesBytes.length ||
        storage.persistedActionCount !== storage.actionSizesBytes.length
      )
        issue("Invalid persisted counts");
      if (
        storage.snapshotSizesBytes.reduce((a, b) => a + b, 0) !== storage.snapshotBytes ||
        storage.actionSizesBytes.reduce((a, b) => a + b, 0) !== storage.actionLogBytes ||
        storage.stateSizesBytes.reduce((a, b) => a + b, 0) !== storage.fullStateBytes
      )
        issue("Invalid byte accounting");
      if ((result.config.storageBackend === "postgres") !== (storage.databaseBytes !== null))
        issue("Database bytes/backend mismatch");
      if (
        strategy.strategy === "FULL_STATE" &&
        (storage.stateCount !== scenario.actionCount + 1 ||
          storage.actionLogBytes !== 0 ||
          storage.initialStateBytes !== 0)
      )
        issue("Invalid full-state storage model");
      if (
        strategy.strategy !== "FULL_STATE" &&
        (storage.persistedActionCount !== scenario.actionCount ||
          storage.initialStateBytes === 0 ||
          storage.fullStateBytes !== 0)
      )
        issue("Invalid log storage model");
      if (
        strategy.strategy !== "SNAPSHOT_ACTION_LOG" &&
        (storage.snapshotBytes !== 0 || storage.snapshotCount !== 0)
      )
        issue("Unexpected snapshots");
      if (
        strategy.strategy === "SNAPSHOT_ACTION_LOG"
          ? !strategy.snapshotInterval ||
            !result.config.snapshotIntervals.includes(strategy.snapshotInterval)
          : strategy.snapshotInterval !== null
      )
        issue("Invalid interval");
      if (
        strategy.strategy === "SNAPSHOT_ACTION_LOG" &&
        strategy.snapshotInterval &&
        !isSameNumbers(
          storage.snapshotRevisions,
          snapshotRevisions(
            scenario.actionCount,
            strategy.snapshotInterval,
            result.config.snapshotPolicy === "production_policy" &&
              scenario.stoppedReason === "game_completed",
          ),
        )
      )
        issue("Snapshot placement/policy mismatch");
      if (
        result.status === "completed" &&
        !isSameNumbers(
          strategy.reconstruction.map((group) => group.targetRevision),
          scenario.targetRevisions,
        )
      )
        issue("Missing or reordered target");
      for (const target of strategy.reconstruction) {
        const expectedBase =
          strategy.strategy === "FULL_STATE"
            ? target.targetRevision
            : (storage.snapshotRevisions
                .filter((revision) => revision <= target.targetRevision)
                .at(-1) ?? 0);
        if (
          target.baseRevision !== expectedBase ||
          target.replayedActions !== target.targetRevision - expectedBase
        )
          issue("Incorrect replay work");
        if (result.status === "completed" && (!target.correct || !target.rngContinuationCorrect))
          issue("Incorrect reconstruction in completed artifact");
        for (const latency of [
          target.loadLatency,
          target.reconstructionLatency,
          target.totalLatency,
        ]) {
          if (
            result.status === "completed" &&
            latency.samplesMs.length !== result.config.iterations
          )
            issue("Missing raw latency samples");
          if (
            JSON.stringify(latency.statisticsMs) !== JSON.stringify(statistics(latency.samplesMs))
          )
            issue("Summary statistics differ from raw samples");
        }
      }
    }
  }
});
function isSameNumbers(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
export type Result = z.infer<typeof artifactSchema>;
export type StrategyResult = Result["scenarios"][number]["strategies"][number];
export type TargetResult = StrategyResult["reconstruction"][number];
export const latency = (values: number[]) => ({
  samplesMs: values,
  statisticsMs: statistics(values),
});

const escapeCsv = (value: unknown) =>
  typeof value === "string"
    ? `"${value.replaceAll('"', '""')}"`
    : value === null
      ? ""
      : String(value);
function csv(rows: unknown[][]) {
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n") + "\n";
}

/** Exclusive files: reruns cannot silently overwrite an earlier thesis experiment. */
export async function writeResults(result: Result): Promise<string[]> {
  resultSchema.parse(result);
  const output = path.resolve(result.config.output);
  await mkdir(output, { recursive: true });
  const summary: unknown[][] = [
    [
      "scenarioId",
      "traceIdentity",
      "gameMode",
      "scenarioType",
      "seed",
      "requestedActions",
      "actionCount",
      "strategy",
      "snapshotInterval",
      "targetRevision",
      "baseRevision",
      "replayedActions",
      "correct",
      "initialStateBytes",
      "actionLogBytes",
      "snapshotBytes",
      "fullStateBytes",
      "totalLogicalBytes",
      "databaseBytes",
      "snapshotCount",
      "storageAmplificationVsActionLog",
      "reconstructionP50Ms",
      "reconstructionP95Ms",
      "reconstructionP99Ms",
      "reconstructionMeanMs",
      "reconstructionStddevMs",
      "loadMeanMs",
      "totalMeanMs",
    ],
  ];
  const samples: unknown[][] = [
    [
      "scenarioId",
      "traceIdentity",
      "gameMode",
      "scenarioType",
      "seed",
      "actionCount",
      "strategy",
      "snapshotInterval",
      "targetRevision",
      "baseRevision",
      "replayedActions",
      "correct",
      "sampleIndex",
      "loadLatencyMs",
      "reconstructionLatencyMs",
      "totalLatencyMs",
    ],
  ];
  for (const scenario of result.scenarios)
    for (const strategy of scenario.strategies)
      for (const target of strategy.reconstruction) {
        const storage = strategy.storage,
          stats = target.reconstructionLatency.statisticsMs;
        summary.push([
          scenario.scenarioId,
          scenario.traceIdentity,
          scenario.gameMode,
          scenario.scenarioType,
          scenario.seed,
          scenario.requestedActionCount,
          scenario.actionCount,
          strategy.strategy,
          strategy.snapshotInterval,
          target.targetRevision,
          target.baseRevision,
          target.replayedActions,
          target.correct,
          storage.initialStateBytes,
          storage.actionLogBytes,
          storage.snapshotBytes,
          storage.fullStateBytes,
          storage.totalLogicalBytes,
          storage.databaseBytes,
          storage.snapshotCount,
          storage.storageAmplificationVsActionLog,
          stats.p50,
          stats.p95,
          stats.p99,
          stats.mean,
          stats.stddev,
          target.loadLatency.statisticsMs.mean,
          target.totalLatency.statisticsMs.mean,
        ]);
        target.reconstructionLatency.samplesMs.forEach((value, index) =>
          samples.push([
            scenario.scenarioId,
            scenario.traceIdentity,
            scenario.gameMode,
            scenario.scenarioType,
            scenario.seed,
            scenario.actionCount,
            strategy.strategy,
            strategy.snapshotInterval,
            target.targetRevision,
            target.baseRevision,
            target.replayedActions,
            target.correct,
            index,
            target.loadLatency.samplesMs[index],
            value,
            target.totalLatency.samplesMs[index],
          ]),
        );
      }
  const paths = ["results.json", "summary.csv", "samples.csv", "result-schema.json"].map((file) =>
    path.join(output, file),
  );
  await writeFile(paths[0], JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  // Validate the actual file, not just the in-memory object.
  resultSchema.parse(JSON.parse(await readFile(paths[0], "utf8")));
  await writeFile(paths[1], csv(summary), { flag: "wx" });
  await writeFile(paths[2], csv(samples), { flag: "wx" });
  await writeFile(
    paths[3],
    JSON.stringify(toJsonSchema(resultSchema, "ReplaySnapshotBenchmarkV1"), null, 2) + "\n",
    { flag: "wx" },
  );
  return paths;
}
