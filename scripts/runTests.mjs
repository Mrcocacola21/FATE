import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdir, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import { requireTestDatabaseUrl } from "./testDatabase.cjs";
import { serverUnit, serverContract, serverWs, databaseWs } from "./testLayers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");
const config = path.join(root, "tsconfig.tests.json");
const layer = process.argv[2] ?? "regression";
const valid = ["unit", "contract", "integration", "ws", "e2e", "regression", "database-prepare"];
if (!valid.includes(layer)) throw new Error(`Unknown test layer: ${layer}`);
const needsDatabase = ["integration", "ws", "e2e", "database-prepare"].includes(layer);
const env = { ...process.env, LOG_LEVEL: "silent" };
// Config never leaks into the calling shell; DB-free runs cannot accidentally pick up a hosted DB.
delete env.DATABASE_URL;
delete env.DIRECT_URL;
delete env.TEST_DATABASE_URL;
let lock;
let isolatedSchema;
let cleanupDatabaseUrl;
let active;
let stopping = false;
const report = { layer, startedAt: new Date().toISOString(), suites: [] };
function terminate(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function run(label, args, cwd = root, timeoutMs = 180000) {
  if (stopping) throw new Error("Test run interrupted");
  const started = performance.now();
  let output = "";
  console.log(`\n[${layer}] ${label}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ["inherit", "pipe", "inherit"], windowsHide: true });
    child.stdout.on("data", chunk => { process.stdout.write(chunk); output += chunk; });
    active = child;
    const timer = setTimeout(() => { terminate(child); reject(new Error(`${label} exceeded ${timeoutMs}ms (possible open handle)`)); }, timeoutMs);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); active = undefined; resolve(code); });
  });
  const tap = [...output.matchAll(/^# tests (\d+)\r?$/gm)].at(-1);
  report.suites.push({ name: label, exitCode: code, seconds: Number(((performance.now() - started) / 1000).toFixed(2)),
    ...(tap ? { tests: Number(tap[1]) } : label.startsWith("rules") ? { legacyChecks: (output.match(/^.*passed.*$/gm) ?? []).length } : {}),
  });
  if (code !== 0) throw new Error(`${label} failed (exit ${code})`);
}
const serverFile = name => path.join(root, "packages/server/src/tests", name);
const testFile = (label, file) => run(label, [tsx, "--tsconfig", config, file], path.dirname(path.dirname(path.dirname(file))));
async function discover(directory, suffix) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await discover(file, suffix));
    else if (suffix.test(entry.name)) files.push(file);
  }
  return files.sort();
}
async function units() {
  await testFile("rules gameplay (existing runner)", path.join(root, "packages/rules/src/tests/index.ts"));
  await run("rules architecture boundaries", [tsx, "--tsconfig", config, "packages/rules/src/tests/index.ts", "--boundaries"]);
  for (const name of serverUnit) await testFile(name, serverFile(name));
  const pure = await discover(path.join(root, "packages/server/src/tests/unit"), /\.test\.ts$/);
  await run("server pure units", [tsx, "--tsconfig", config, "--test", "--test-concurrency=1", ...pure]);
  const web = await discover(path.join(root, "packages/web/src"), /\.test\.tsx?$/);
  await run("web components and helpers", [tsx, "--tsconfig", config, "--test", "--test-concurrency=1", ...web], path.join(root, "packages/web"));
}
async function contracts() {
  await run("OpenAPI generated schema consistency", ["packages/server/scripts/generateResponseSchemas.cjs", "--check"]);
  for (const name of serverContract) await testFile(name, serverFile(name));
}
async function transports() {
  for (const name of serverWs) await testFile(name, serverFile(name));
}
function stop() { stopping = true; terminate(active); }
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  if (!needsDatabase) await run("Prisma generate (no database connection)", [path.join(root, "scripts/generatePrisma.mjs")]);
  if (needsDatabase) {
    const url = requireTestDatabaseUrl(process.env);
    env.NODE_ENV = "test";
    env.TEST_DATABASE_URL = env.DATABASE_URL = env.DIRECT_URL = url;
    // A per-target lock also prevents different layers/processes resetting recovery fixtures.
    const target = new URL(url);
    const databaseTarget = [target.hostname, target.port || "5432", target.pathname, target.searchParams.get("schema") || "public"].join("|");
    const digest = createHash("sha256").update(databaseTarget).digest("hex").slice(0, 24);
    const candidate = path.join(os.tmpdir(), `fate-tests-${digest}.lock`);
    try { await mkdir(candidate); } catch (error) {
      if (error.code === "EEXIST") throw new Error("Another FATE test layer owns this test DB. Run layers serially; if a previous process crashed, remove its stale fate-tests-*.lock directory from the OS temp directory.");
      throw error;
    }
    lock = candidate;
    await writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, layer }));
    if (layer !== "database-prepare") {
      isolatedSchema = `fate_${layer}_test_${randomUUID().replaceAll("-", "")}`;
      cleanupDatabaseUrl = url;
      const isolated = new URL(url);
      isolated.searchParams.set("schema", isolatedSchema);
      env.TEST_DATABASE_URL = env.DATABASE_URL = env.DIRECT_URL = isolated.toString();
    }
    // Current migrations, once per layer; never reset, db push, or use a caller's DATABASE_URL.
    await run("Prisma generate", [path.join(root, "scripts/generatePrisma.mjs")], path.join(root, "packages/server"));
    await run("test DB migrations", [require.resolve("prisma/build/index.js"), "migrate", "deploy"], path.join(root, "packages/server"));
  }
  if (layer === "unit" || layer === "regression") await units();
  if (["contract", "integration", "regression"].includes(layer)) await contracts();
  if (layer === "regression" || layer === "ws") await transports();
  if (layer === "integration") {
    const files = await discover(path.join(root, "packages/server/src/tests"), /\.integration\.test\.ts$/);
    for (const file of files.filter(file => !databaseWs.includes(path.basename(file)))) await testFile(path.basename(file), file);
  }
  if (layer === "ws") for (const name of databaseWs) await testFile(name, serverFile(name));
  if (layer === "e2e") await run("register → login → create/join → play → finish → history → replay", [tsx, "--tsconfig", config, path.join(root, "packages/web/scripts/journey-smoke.ts")], path.join(root, "packages/web"), 300000);
  report.passed = true;
  console.log(`\n${layer}: ${report.suites.length} suite executions passed.`);
} catch (error) {
  report.passed = false;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (isolatedSchema) {
    // The only DROP target is a generated run-owned schema, never the caller's schema.
    const safeUrl = requireTestDatabaseUrl({ NODE_ENV: "test", TEST_DATABASE_URL: cleanupDatabaseUrl });
    if (!/^fate_(integration|ws|e2e)_test_[a-f0-9]{32}$/.test(isolatedSchema)) throw new Error("Invalid run-owned schema name");
    const { PrismaClient } = require("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: safeUrl } } });
    try { await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${isolatedSchema}" CASCADE`); }
    catch { report.passed = false; process.exitCode = 1; console.error("Failed to remove the run-owned test schema; check local PostgreSQL availability."); }
    finally { await db.$disconnect(); }
  }
  report.seconds = Number(report.suites.reduce((sum, suite) => sum + suite.seconds, 0).toFixed(2));
  const output = path.join(root, "test-results/testing");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, `${layer}.json`), JSON.stringify(report, null, 2) + "\n");
  if (lock) await rm(lock, { recursive: true, force: true });
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
