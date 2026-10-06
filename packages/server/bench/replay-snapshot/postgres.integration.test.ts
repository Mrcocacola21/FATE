import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { requireBenchmarkDatabaseUrl, PostgresRun } from "./postgres";
import { generateTrace } from "./scenarios";
import { buildDataset, storageMetrics, reconstruct, assertCorrect } from "./strategies";

test("PostgreSQL persists isolated payloads, reconstructs every strategy, reports physical bytes, and cleans up", async () => {
  const url = requireBenchmarkDatabaseUrl();
  const inspection = new PrismaClient({ datasources: { db: { url } }, log: [] });
  const schemas = () =>
    inspection.$queryRawUnsafe<{ schema_name: string }[]>(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'fate_bench_test_%' ORDER BY schema_name",
    );
  const tables = () =>
    inspection.$queryRawUnsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
  const productionCounts = async () => {
    const existing = await tables();
    const counts: Record<string, number> = {};
    // Read only, on the explicit disposable DB. No test migration creates application tables.
    for (const name of ["Match", "MatchAction", "MatchSnapshot", "RatingHistory", "AuditLog"])
      if (existing.some((row) => row.table_name === name)) {
        counts[name] = Number(
          (
            await inspection.$queryRawUnsafe<{ count: bigint }[]>(
              `SELECT count(*) AS count FROM public."${name}"`,
            )
          )[0].count,
        );
      }
    return counts;
  };
  const run = new PostgresRun(url);
  try {
    const beforeSchemas = await schemas(),
      beforeTables = await tables(),
      beforeCounts = await productionCounts();
    await run.open();
    assert(run.version?.includes("PostgreSQL"));
    const trace = generateTrace("standard", 1, 25, "controlled");
    for (const [strategy, interval] of [
      ["FULL_STATE", null],
      ["ACTION_LOG", null],
      ["SNAPSHOT_ACTION_LOG", 10],
    ] as const) {
      const dataset = buildDataset(trace, strategy, interval, "periodic_only");
      const backend = await run.persist(dataset);
      try {
        assert(backend.databaseBytes >= 0);
        assert(storageMetrics(dataset).totalLogicalBytes > 0);
        assert.equal(backend.databaseWriteLatencyMs.length, trace.actions.length + 1);
        for (const target of [0, 1, 10, 11, 19, 20, 25]) {
          const prepared = await backend.load(target);
          assertCorrect(
            trace,
            await reconstruct(trace, dataset, prepared, target),
            target,
            prepared.baseRevision,
          );
        }
      } finally {
        await backend.release();
      }
    }
    await run.close();
    assert.deepEqual(await schemas(), beforeSchemas);
    assert.deepEqual(await tables(), beforeTables);
    assert.deepEqual(await productionCounts(), beforeCounts);
  } finally {
    await run.close();
    await inspection.$disconnect();
  }
});
