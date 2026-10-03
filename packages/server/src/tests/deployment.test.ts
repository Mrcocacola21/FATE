import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import Fastify from "fastify";
import { validateProductionEnvironment } from "../config";
import { createDatabaseReadinessCheck } from "../db/readiness";
import { registerHealthRoutes } from "../routes/healthRoutes";
import { requireTestDatabaseUrl } from "./testDatabase";

// These checks assert startup errors, not process-launch latency. Windows cold
// starts may include scanning/transpilation before the tested entrypoint runs.
const childStartupTimeoutMs = process.platform === "win32" ? 30000 : 10000;

const production: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://localhost:5432/fate_test",
  DIRECT_URL: "postgresql://localhost:5432/fate_test",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  WEB_ORIGIN: "https://fate.example.test",
  AUTH_COOKIE_SAME_SITE: "none",
};

test("production requires every critical variable; development and tests stay lazy", () => {
  validateProductionEnvironment(production);
  for (const name of [
    "DATABASE_URL",
    "DIRECT_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "WEB_ORIGIN",
  ]) {
    const env = { ...production };
    delete env[name];
    assert.throws(
      () => validateProductionEnvironment(env),
      new RegExp(`Missing required production environment variable: ${name}`),
    );
  }
  validateProductionEnvironment({ NODE_ENV: "development" });
  validateProductionEnvironment({ NODE_ENV: "test" });
});

test("invalid DB, JWT, origin, TTL and cookie configuration fails without echoing values", () => {
  for (const changes of [
    { DATABASE_URL: "sensitive-invalid-url" },
    { DIRECT_URL: "https://sensitive.example.test" },
    { JWT_ACCESS_SECRET: "sensitive-short-key" },
    { JWT_REFRESH_SECRET: production.JWT_ACCESS_SECRET },
    { JWT_ACCESS_TTL_SECONDS: "0" },
    { WEB_ORIGIN: "http://sensitive.example.test" },
    { WEB_ORIGIN: "https://sensitive.example.test/" },
    { AUTH_COOKIE_SAME_SITE: "sensitive-invalid-cookie" },
  ]) {
    assert.throws(
      () => validateProductionEnvironment({ ...production, ...changes }),
      (error: unknown) => {
        assert(error instanceof Error);
        assert.equal(error.message.includes("sensitive"), false);
        assert.equal(error.message.includes(production.JWT_ACCESS_SECRET!), false);
        return true;
      },
    );
  }
});

test("real entrypoint exits before listening when production configuration is missing", () => {
  const child = spawnSync(
    process.execPath,
    [require.resolve("tsx/cli"), resolve(__dirname, "../index.ts")],
    {
      env: { ...process.env, ...production, DATABASE_URL: "", LOG_LEVEL: "silent" },
      encoding: "utf8",
      timeout: childStartupTimeoutMs,
      windowsHide: true,
    },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  assert.equal(child.stdout, "");
  assert.equal(
    child.stderr.trim(),
    "Missing required production environment variable: DATABASE_URL",
  );
});

test("production startup refuses an unreachable DB with a sanitized error", () => {
  const child = spawnSync(
    process.execPath,
    [require.resolve("tsx/cli"), resolve(__dirname, "../index.ts")],
    {
      env: {
        ...process.env,
        ...production,
        DATABASE_URL: "postgresql://127.0.0.1:1/fate_test?connect_timeout=1",
        LOG_LEVEL: "silent",
      },
      encoding: "utf8",
      timeout: childStartupTimeoutMs,
      windowsHide: true,
    },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  assert.equal(child.stdout, "");
  assert.equal(
    child.stderr.trim(),
    "Production database readiness check failed; server has not started",
  );
});

test("liveness does no DB work; readiness succeeds, fails safely and recovers", async () => {
  let calls = 0;
  let available = true;
  const check = createDatabaseReadinessCheck(async () => {
    calls++;
    if (!available) throw new Error("sensitive diagnostic with credentials");
  });
  const server = Fastify();
  registerHealthRoutes(server, check);
  try {
    for (const url of ["/health", "/api/health"]) {
      const response = await server.inject({ url });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { ok: true });
    }
    assert.equal(calls, 0);
    const ready = await server.inject({ url: "/ready" });
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(ready.json(), { ok: true });
    assert.equal(ready.headers["cache-control"], "no-store");
    available = false;
    const unavailable = await server.inject({ url: "/ready" });
    assert.equal(unavailable.statusCode, 503);
    assert.deepEqual(unavailable.json(), { ok: false });
    available = true;
    assert.equal((await server.inject({ url: "/ready" })).statusCode, 200);
  } finally {
    await server.close();
  }
});

test(
  "a hanging probe times out and repeated probes share the outstanding query",
  { timeout: 2000 },
  async () => {
    let calls = 0;
    let release!: () => void;
    const check = createDatabaseReadinessCheck(() => {
      calls++;
      return new Promise<void>((resolveQuery) => {
        release = resolveQuery;
      });
    }, 30);
    const server = Fastify();
    registerHealthRoutes(server, check);
    try {
      const responses = await Promise.all([
        server.inject({ url: "/ready" }),
        server.inject({ url: "/ready" }),
      ]);
      for (const response of responses) {
        assert.equal(response.statusCode, 503);
        assert.deepEqual(response.json(), { ok: false });
      }
      assert.equal(await check(), false);
      assert.equal(calls, 1);
      const recovered = check();
      release();
      assert.equal(await recovered, true);
    } finally {
      await server.close();
    }
  },
);

test("browser smoke cleanup scripts reject remote test schemas before connecting", () => {
  for (const name of ["auth-smoke.mjs", "multiplayer-smoke.mjs", "match-history-smoke.mjs", "matchmaking-smoke.mjs"]) {
    const child = spawnSync(process.execPath, [resolve(__dirname, "../../../web/scripts", name)], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        TEST_DATABASE_URL:
          "postgresql://ep-example.eu-central-1.aws.neon.tech/neondb?schema=auth_test",
      },
      encoding: "utf8",
      timeout: childStartupTimeoutMs,
      windowsHide: true,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    assert.match(child.stderr, /TEST_DATABASE_URL must use a local loopback PostgreSQL host/);
    assert.equal(child.stderr.includes("neon.tech"), false);
  }
});

test("DB integration guards reject production, remote hosts and ambiguous test names", () => {
  const local = "postgresql://localhost:5432/fate_test";
  assert.equal(requireTestDatabaseUrl({ TEST_DATABASE_URL: local }), local);
  const schema = "postgresql://127.0.0.1:5432/fate?schema=auth_test";
  assert.equal(requireTestDatabaseUrl({ TEST_DATABASE_URL: schema }), schema);
  for (const env of [
    { NODE_ENV: "production", TEST_DATABASE_URL: local },
    {
      TEST_DATABASE_URL:
        "postgresql://ep-example-pooler.eu-central-1.aws.neon.tech/neondb?schema=auth_test",
    },
    { TEST_DATABASE_URL: "postgresql://ep-example.eu-central-1.aws.neon.tech/fate_test" },
    { TEST_DATABASE_URL: "postgresql://localhost:5432/contest" },
    { TEST_DATABASE_URL: "sensitive-invalid-url" },
    { TEST_DATABASE_URL: "postgresql://localhost:5432/%ZZ" },
    {},
  ]) {
    assert.throws(
      () => requireTestDatabaseUrl(env),
      (error: unknown) => {
        assert(error instanceof Error);
        assert.equal(error.message.includes("sensitive"), false);
        return true;
      },
    );
  }
});
