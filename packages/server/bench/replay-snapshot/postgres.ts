import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import { requireTestDatabaseUrl } from "../../../../scripts/testDatabase.cjs";
import type { Backend, Dataset, Prepared } from "./strategies";

/** Explicit dedicated LOCAL test database only. Never reads DATABASE_URL or .env. */
export function requireBenchmarkDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (!env.BENCHMARK_DATABASE_URL?.trim())
    throw new Error("BENCHMARK_DATABASE_URL is required for PostgreSQL benchmarks.");
  let url: string;
  try {
    url = requireTestDatabaseUrl({
      NODE_ENV: env.NODE_ENV,
      TEST_DATABASE_URL: env.BENCHMARK_DATABASE_URL,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message.replaceAll("TEST_DATABASE_URL", "BENCHMARK_DATABASE_URL")
        : "UNSAFE_BENCHMARK_DATABASE",
    );
  }
  if (!/(^|[_-])test([_-]|$)/i.test(decodeURIComponent(new URL(url).pathname.slice(1))))
    throw new Error(
      "Benchmark requires a dedicated database with a 'test' name segment; a test schema alone is insufficient.",
    );
  return url;
}

export class PostgresRun {
  private readonly schema = `fate_bench_test_${randomUUID().replaceAll("-", "")}`;
  private readonly db: PrismaClient;
  private nextDataset = 0;
  private schemaCreated = false;
  version: string | null = null;
  constructor(url: string) {
    // Validate even programmatic use; create no client for an unsafe target.
    requireBenchmarkDatabaseUrl({ BENCHMARK_DATABASE_URL: url, NODE_ENV: process.env.NODE_ENV });
    this.db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  }
  private identifier(table: string): string {
    if (
      !/^fate_bench_test_[a-f0-9]{32}$/.test(this.schema) ||
      !/^d\d+_(initial|actions|states|snapshots)$/.test(table)
    )
      throw new Error("INVALID_BENCHMARK_IDENTIFIER");
    return `"${this.schema}"."${table}"`;
  }
  async open(): Promise<void> {
    await this.db.$connect();
    this.version = (
      await this.db.$queryRawUnsafe<{ version: string }[]>("SELECT version() AS version")
    )[0].version;
    await this.db.$executeRawUnsafe(`CREATE SCHEMA "${this.schema}"`);
    this.schemaCreated = true;
  }
  async persist(
    dataset: Dataset,
  ): Promise<Backend & { databaseBytes: number; release(): Promise<void> }> {
    const prefix = `d${this.nextDataset++}_`;
    const components =
      dataset.strategy === "FULL_STATE"
        ? (["states"] as const)
        : dataset.strategy === "ACTION_LOG"
          ? (["initial", "actions"] as const)
          : (["initial", "actions", "snapshots"] as const);
    const tables = components.map((component) => this.identifier(prefix + component));
    for (const table of tables)
      await this.db.$executeRawUnsafe(
        `CREATE TABLE ${table} (revision integer PRIMARY KEY, payload text NOT NULL)`,
      );
    const databaseWriteLatencyMs: number[] = [];
    // One transaction per accepted revision, with an optional checkpoint in that same transaction.
    for (let revision = 0; revision <= dataset.length; revision++) {
      const started = performance.now();
      await this.db.$transaction(async (tx) => {
        const insert = (component: string, payload: string) =>
          tx.$executeRawUnsafe(
            `INSERT INTO ${this.identifier(prefix + component)} (revision, payload) VALUES ($1, $2)`,
            revision,
            payload,
          );
        if (dataset.strategy === "FULL_STATE")
          await insert("states", dataset.states.get(revision)!);
        else if (revision === 0) await insert("initial", dataset.initial!);
        else {
          await insert("actions", dataset.actions[revision - 1]);
          const snapshot = dataset.snapshots.get(revision);
          if (snapshot) await insert("snapshots", snapshot);
        }
      });
      databaseWriteLatencyMs.push(performance.now() - started);
    }
    let databaseBytes = 0;
    for (const table of tables) {
      const rows = await this.db.$queryRawUnsafe<{ bytes: bigint }[]>(
        "SELECT pg_total_relation_size($1::regclass) AS bytes",
        table,
      );
      databaseBytes += Number(rows[0].bytes);
    }
    return {
      databaseBytes,
      databaseWriteLatencyMs,
      load: async (target: number): Promise<Prepared> => {
        const one = async (component: string, comparison: "=" | "<=", revision: number) => {
          const rows = await this.db.$queryRawUnsafe<{ revision: number; payload: string }[]>(
            `SELECT revision, payload FROM ${this.identifier(prefix + component)} WHERE revision ${comparison} $1 ORDER BY revision DESC LIMIT 1`,
            revision,
          );
          return rows[0] ?? null;
        };
        if (dataset.strategy === "FULL_STATE") {
          const state = await one("states", "=", target);
          return {
            initial: null,
            state: state?.payload ?? null,
            snapshot: null,
            actions: [],
            baseRevision: state?.revision ?? -1,
          };
        }
        const initial = await one("initial", "=", 0);
        const snapshot =
          dataset.strategy === "SNAPSHOT_ACTION_LOG" ? await one("snapshots", "<=", target) : null;
        const baseRevision = snapshot?.revision ?? 0;
        const actions =
          baseRevision === target
            ? []
            : await this.db.$queryRawUnsafe<{ payload: string }[]>(
                `SELECT payload FROM ${this.identifier(prefix + "actions")} WHERE revision > $1 AND revision <= $2 ORDER BY revision`,
                baseRevision,
                target,
              );
        return {
          initial: initial?.payload ?? null,
          state: null,
          snapshot: snapshot?.payload ?? null,
          actions: actions.map((row) => row.payload),
          baseRevision,
        };
      },
      release: async () => {
        for (const table of tables) await this.db.$executeRawUnsafe(`DROP TABLE ${table}`);
      },
    };
  }
  async close(): Promise<void> {
    try {
      if (!/^fate_bench_test_[a-f0-9]{32}$/.test(this.schema))
        throw new Error("INVALID_BENCHMARK_SCHEMA");
      if (this.schemaCreated)
        await this.db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${this.schema}" CASCADE`);
    } finally {
      await this.db.$disconnect();
    }
  }
}
