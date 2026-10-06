import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { SeededRNG } from "rules";
import { generateTrace, selectTargets } from "./scenarios";
import { parseConfig } from "./config";
import { statistics, snapshotRevisions, utf8Bytes } from "./metrics";
import { serializeInitial, serializeState, serializeAction } from "./serializers";
import {
  buildDataset,
  memoryBackend,
  storageMetrics,
  reconstruct,
  assertCorrect,
} from "./strategies";
import { requireBenchmarkDatabaseUrl } from "./postgres";
import { runBenchmark } from "./benchmark";
import { resultSchema } from "./output";
import { getGameRoom } from "../../src/store";

test("config rejects malformed/unknown options and normalizes intervals", () => {
  const config = parseConfig([
    "--snapshot-intervals=20,20,5",
    "--warmup=0",
    "--modes=STANDARD,DRAFT,CLASSIC",
  ]);
  assert.deepEqual(config.snapshotIntervals, [5, 20]);
  assert.deepEqual(config.modes, ["standard", "draft", "classic"]);
  for (const argument of [
    "--actions=0",
    "--actions=1,,2",
    "--iterations=0",
    "--warmup=-1",
    "--seeds=abc",
    "--seeds=0",
    "--storage-backend=neon",
    "--modes=UNKNOWN",
    "--typo=1",
    "--strict=maybe",
  ])
    assert.throws(() => parseConfig([argument]));
  assert.throws(() => parseConfig(["--actions=10", "--actions=20"]));
});

test("statistics use type 7 interpolation, population deviation, and retain outliers", () => {
  const stats = statistics([1, 2, 3, 4, 5]);
  assert.equal(stats.mean, 3);
  assert.equal(stats.p50, 3);
  assert.equal(stats.p95, 4.8);
  assert.equal(stats.p99, 4.96);
  assert.equal(stats.stddev, Math.sqrt(2));
  assert.equal(stats.count, 5);
  assert.equal(statistics([1, 1, 10000]).max, 10000);
  assert.equal(statistics([]).count, 0);
  assert.throws(() => statistics([NaN]));
  assert.equal(utf8Bytes("ФАТЕ"), 8);
});

test("periodic placement and final policy are explicit", () => {
  assert.deepEqual(snapshotRevisions(53, 20, false), [20, 40]);
  assert.deepEqual(snapshotRevisions(53, 20, true), [20, 40, 53]);
  assert.deepEqual(snapshotRevisions(60, 20, true), [20, 40, 60]);
  assert.deepEqual(snapshotRevisions(50, 100, false), []);
  assert.throws(() => snapshotRevisions(50, 0, false));
});

test("same seeds/config reproduce legal traces and all strategies share each trace", async () => {
  for (const mode of ["standard", "classic", "draft"] as const) {
    const trace = generateTrace(mode, 37, 80, "controlled"),
      again = generateTrace(mode, 37, 80, "controlled");
    assert.equal(trace.identity, again.identity);
    assert.deepEqual(trace.actions, again.actions);
    assert.deepEqual(trace.states, again.states);
    assert.equal(trace.actions.length, 80);
    assert.equal(
      getGameRoom(trace.room.id),
      undefined,
      "No published room/lifecycle or production DB adapter",
    );
    for (const definition of [
      ["FULL_STATE", null],
      ["ACTION_LOG", null],
      ["SNAPSHOT_ACTION_LOG", 10],
      ["SNAPSHOT_ACTION_LOG", 20],
    ] as const) {
      const dataset = buildDataset(trace, definition[0], definition[1], "periodic_only"),
        backend = memoryBackend(dataset);
      const before = JSON.stringify({
        initial: dataset.initial,
        actions: dataset.actions,
        snapshots: [...dataset.snapshots],
        states: [...dataset.states],
      });
      for (const target of [0, 1, 3, 19, 20, 21, 39, 40, 41, 59, 60, 73, 80]) {
        const prepared = await backend.load(target),
          result = await reconstruct(trace, dataset, prepared, target);
        assertCorrect(trace, result, target, prepared.baseRevision);
        assert.equal(
          result.actionsApplied,
          definition[0] === "FULL_STATE" ? 0 : definition[1] ? target % definition[1] : target,
        );
      }
      assert.equal(
        JSON.stringify({
          initial: dataset.initial,
          actions: dataset.actions,
          snapshots: [...dataset.snapshots],
          states: [...dataset.states],
        }),
        before,
        "Reconstruction cannot mutate persistence",
      );
    }
    assert.notEqual(trace.identity, generateTrace(mode, 38, 80, "controlled").identity);
  }
});

test("minimal full state and action-log byte accounting include revision zero once", async () => {
  const trace = generateTrace("classic", 1, 3, "controlled");
  const full = buildDataset(trace, "FULL_STATE", null, "periodic_only"),
    log = buildDataset(trace, "ACTION_LOG", null, "periodic_only");
  const fs = storageMetrics(full),
    ls = storageMetrics(log);
  assert.equal(fs.stateCount, 4);
  assert.equal(fs.persistedActionCount, 0);
  assert.equal(fs.actionLogBytes, 0);
  assert.equal(fs.initialStateBytes, 0);
  assert.equal(
    fs.totalLogicalBytes,
    [0, 1, 2, 3].reduce((sum, revision) => sum + utf8Bytes(serializeState(trace, revision)), 0),
  );
  assert.equal(ls.initialStateBytes, utf8Bytes(serializeInitial(trace)));
  assert.equal(
    ls.actionLogBytes,
    trace.actions.reduce((sum, row) => sum + utf8Bytes(serializeAction(row)), 0),
  );
  assert.equal(ls.totalLogicalBytes, ls.initialStateBytes + ls.actionLogBytes);
  assert.equal(ls.persistedRecordCount, 4);
  assert.equal(
    (await reconstruct(trace, full, await memoryBackend(full).load(3), 3)).actionsApplied,
    0,
  );
  assert.equal(
    (await reconstruct(trace, log, await memoryBackend(log).load(3), 3)).actionsApplied,
    3,
  );
});

test("long draft trace accepts automatic hero choices without modifying rules", async () => {
  const trace = generateTrace("draft", 4, 500, "controlled");
  assert.equal(trace.actions.length, 500);
  assert(trace.states.some((state) => state.pendingRoll?.kind === "donSorrowfulMoveChoice"));
  const dataset = buildDataset(trace, "ACTION_LOG", null, "periodic_only");
  assertCorrect(
    trace,
    await reconstruct(trace, dataset, await memoryBackend(dataset).load(500), 500),
    500,
    0,
  );
});

test("snapshot tails at boundaries, K-1 worst case, and interval above length", async () => {
  const trace = generateTrace("classic", 1, 60, "controlled");
  const dataset = buildDataset(trace, "SNAPSHOT_ACTION_LOG", 20, "periodic_only");
  for (const [target, replayed] of [
    [40, 0],
    [41, 1],
    [59, 19],
    [60, 0],
  ]) {
    const result = await reconstruct(
      trace,
      dataset,
      await memoryBackend(dataset).load(target),
      target,
    );
    assert.equal(result.actionsApplied, replayed);
  }
  const short = generateTrace("classic", 1, 50, "controlled");
  const large = buildDataset(short, "SNAPSHOT_ACTION_LOG", 100, "periodic_only");
  assert.equal(storageMetrics(large).snapshotCount, 0);
  assert.equal(
    (await reconstruct(short, large, await memoryBackend(large).load(50), 50)).actionsApplied,
    50,
  );
  const targets = selectTargets(60, parseConfig(["--snapshot-intervals=20"]), 1);
  for (const target of [0, 1, 19, 39, 40, 41, 60]) assert(targets.includes(target));
});

test("correctness detects state and RNG corruption and validates real pending-roll continuation", async () => {
  const trace = generateTrace("standard", 3, 80, "controlled");
  const dataset = buildDataset(trace, "ACTION_LOG", null, "periodic_only");
  const target = trace.states.findIndex(
    (state, revision) => state.pendingRoll && revision < trace.actions.length,
  );
  assert(target > 0);
  const result = await reconstruct(
    trace,
    dataset,
    await memoryBackend(dataset).load(target),
    target,
  );
  assertCorrect(trace, result, target, 0);
  assert.throws(
    () =>
      assertCorrect(trace, { ...result, rngState: new SeededRNG(999).exportState() }, target, 0),
    /MISMATCH/,
  );
  assert.throws(
    () =>
      assertCorrect(
        trace,
        { ...result, state: { ...result.state, turnNumber: 123456 } },
        target,
        0,
      ),
    /MISMATCH/,
  );
});

test("natural matches end honestly; production policy forces a final checkpoint only when ended", () => {
  const trace = generateTrace("classic", 1, 1000, "natural");
  assert.equal(trace.stoppedReason, "game_completed");
  assert(trace.actions.length < 1000);
  assert.equal(trace.room.state.phase, "ended");
  const periodic = buildDataset(trace, "SNAPSHOT_ACTION_LOG", 100, "periodic_only");
  const production = buildDataset(trace, "SNAPSHOT_ACTION_LOG", 100, "production_policy");
  assert(!periodic.snapshots.has(trace.actions.length));
  assert(production.snapshots.has(trace.actions.length));
  const unfinished = generateTrace("classic", 1, 53, "controlled");
  assert.deepEqual(
    [...buildDataset(unfinished, "SNAPSHOT_ACTION_LOG", 20, "production_policy").snapshots.keys()],
    [20, 40],
  );
});

test("DB guard refuses hosted/shared targets, production environment, and generic URLs", () => {
  assert.throws(() =>
    requireBenchmarkDatabaseUrl({ DATABASE_URL: "postgresql://localhost/fate_test" }),
  );
  for (const url of [
    "postgresql://example.neon.tech/fate_test",
    "postgresql://db.render.com/fate_test",
    "postgresql://localhost/fate",
    "postgresql://localhost/fate?schema=benchmark_test",
    "mysql://localhost/fate_test",
  ])
    assert.throws(() => requireBenchmarkDatabaseUrl({ BENCHMARK_DATABASE_URL: url }));
  assert.throws(() =>
    requireBenchmarkDatabaseUrl({
      NODE_ENV: "production",
      BENCHMARK_DATABASE_URL: "postgresql://localhost/fate_test",
    }),
  );
  assert.equal(
    requireBenchmarkDatabaseUrl({
      BENCHMARK_DATABASE_URL: "postgresql://127.0.0.1/fate_benchmark_test",
    }),
    "postgresql://127.0.0.1/fate_benchmark_test",
  );
});

test("JSON/CSV artifacts validate and independent reruns preserve all non-timing measurements", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "fate-benchmark-test-"));
  try {
    const config = parseConfig([
      "--actions=25",
      "--seeds=3",
      "--snapshot-intervals=5,20,100",
      "--iterations=2",
      "--warmup=1",
      "--random-targets=1",
      `--output=${path.join(temporary, "one")}`,
    ]);
    const first = await runBenchmark(config),
      second = await runBenchmark({ ...config, output: path.join(temporary, "two") });
    const project = (result: typeof first.result) =>
      result.scenarios.map((scenario) => ({
        identity: scenario.traceIdentity,
        actions: scenario.actionCount,
        targets: scenario.targetRevisions,
        strategies: scenario.strategies.map((strategy) => ({
          strategy: strategy.strategy,
          interval: strategy.snapshotInterval,
          storage: strategy.storage,
          reconstruction: strategy.reconstruction.map(
            ({ targetRevision, baseRevision, replayedActions, correct }) => ({
              targetRevision,
              baseRevision,
              replayedActions,
              correct,
            }),
          ),
        })),
      }));
    assert.deepEqual(project(first.result), project(second.result));
    resultSchema.parse(JSON.parse(await readFile(first.paths[0], "utf8")));
    const ajv = new Ajv();
    addFormats(ajv);
    const validate = ajv.compile(JSON.parse(await readFile(first.paths[3], "utf8")));
    assert(
      validate(JSON.parse(await readFile(first.paths[0], "utf8"))),
      JSON.stringify(validate.errors),
    );
    assert((await readFile(first.paths[1], "utf8")).includes("totalLogicalBytes"));
    assert((await readFile(first.paths[2], "utf8")).includes("reconstructionLatencyMs"));
    assert(
      first.result.scenarios.every((scenario) =>
        scenario.strategies.every((strategy) =>
          strategy.reconstruction.every(
            (target) => target.correct && target.reconstructionLatency.samplesMs.length === 2,
          ),
        ),
      ),
    );
    const corrupted = structuredClone(first.result);
    corrupted.scenarios[0].strategies[0].storage.totalLogicalBytes++;
    assert.throws(() => resultSchema.parse(corrupted));
    await assert.rejects(runBenchmark(config), /EEXIST/);
  } finally {
    // mkdtemp created and owns this exact directory; no user-supplied/computed parent is removed.
    await rm(temporary, { recursive: true, force: true });
  }
});
