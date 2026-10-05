// Disposable local-only deployment verification. No production env file is read.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, rmdir, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = `fate-docker-test-${randomBytes(6).toString("hex")}`;
const scratch = await mkdtemp(path.join(tmpdir(), `${project}-`));
const envFile = path.join(scratch, ".env.test");
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const result = probe.address().port;
    probe.close(() => resolve(result));
  });
});
const password = `${randomBytes(24).toString("base64url")}@:/#$`;
const dbUrl = `postgresql://fate_test:${encodeURIComponent(password)}@postgres:5432/fate_docker_test`;
const testEnv = {
  POSTGRES_DB: "fate_docker_test", POSTGRES_USER: "fate_test", POSTGRES_PASSWORD: password,
  DATABASE_URL: dbUrl, DIRECT_URL: dbUrl,
  JWT_ACCESS_SECRET: randomBytes(48).toString("base64url"),
  JWT_REFRESH_SECRET: randomBytes(48).toString("base64url"),
  WEB_ORIGIN: "https://fate.example.com", AUTH_COOKIE_SAME_SITE: "none",
  SERVER_PORT: String(port), SERVER_BIND_ADDRESS: "127.0.0.1", LOG_LEVEL: "warn",
};
await writeFile(envFile, Object.entries(testEnv).map(([key, value]) => `${key}='${value}'`).join("\n"), { mode: 0o600 });
// Keep Docker's host configuration, but remove application overrides from the shell.
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(POSTGRES_|DATABASE_URL$|DIRECT_URL$|JWT_|WEB_ORIGIN$|AUTH_COOKIE_|SERVER_|LOG_LEVEL$|MATCH_|MATCHMAKING_|LEADERBOARD_|RECONNECT_|ROOM_|MAX_|WS_|OPENAPI_|SWAGGER_|COMPOSE_)/.test(key)) delete env[key];
}
Object.assign(env, testEnv);
const composeBase = ["compose", "--project-name", project, "--env-file", envFile, "-f", "compose.yml"];
const clients = new Set();
const baseUrl = `http://127.0.0.1:${port}`;
async function docker(args, expected = 0, overrides = {}) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn("docker", args, { cwd: root, env: { ...env, ...overrides }, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", data => { stdout += data; });
    child.stderr.on("data", data => { stderr += data; });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Docker smoke command timed out")); }, 180000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
  if (expected !== null && result.code !== expected) {
    throw new Error(`Docker command failed (${result.code}): ${result.stdout}\n${result.stderr}`);
  }
  return result;
}
const compose = (args, expected = 0, overrides = {}) => docker([...composeBase, ...args], expected, overrides);
async function eventually(check, label, timeout = 60000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await delay(250);
  }
  throw new Error(`Timed out: ${label}`);
}
async function request(route, { method = "GET", body, token, origin } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method, signal: AbortSignal.timeout(9000),
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}
async function ready() {
  await eventually(async () => {
    try { const r = await request("/ready"); return r.status === 200 && r.body.ok === true; }
    catch { return false; }
  }, "server readiness");
  const health = await request("/health");
  assert.equal(health.status, 200); assert.equal(health.body.ok, true);
}
async function client() {
  const socket = new WebSocket(`${baseUrl.replace("http:", "ws:")}/ws`);
  const queue = [];
  let failure;
  socket.addEventListener("message", event => queue.push(JSON.parse(event.data)));
  socket.addEventListener("error", () => { failure = new Error("WebSocket failed"); });
  const connection = {
    socket,
    send(message) { queue.length = 0; socket.send(JSON.stringify(message)); },
    async wait(match) {
      let result;
      await eventually(() => {
        if (failure) throw failure;
        const index = queue.findIndex(match);
        if (index < 0) return false;
        result = queue.splice(index, 1)[0]; return true;
      }, "WebSocket frame", 15000);
      return result;
    },
    async close() {
      socket.close();
      await eventually(() => socket.readyState === WebSocket.CLOSED, "WebSocket close", 10000);
      clients.delete(connection);
    },
  };
  clients.add(connection);
  await eventually(() => {
    if (failure) throw failure;
    return socket.readyState === WebSocket.OPEN;
  }, "WebSocket open", 10000);
  return connection;
}
async function sql(query) {
  return (await compose(["exec", "-T", "postgres", "psql", "-U", "fate_test", "-d", "fate_docker_test", "-At", "-c", query])).stdout.trim();
}
const up = () => compose(["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"]);
try {
  await compose(["config", "--quiet"]);
  console.log("PASS compose config (isolated test inputs)");
  await docker(["run", "--rm", "fate-server:local", "node", "-e", `
    const assert = require('node:assert/strict'), fs = require('node:fs');
    assert.notEqual(process.getuid(), 0);
    for (const p of ['.env', '.git', 'packages/web', 'packages/server/src', 'packages/server/dist/tests', 'packages/rules/dist/tests', 'node_modules/typescript', 'node_modules/tsx']) assert(!fs.existsSync(p), p);
    assert(require('rules').SeededRNG);
    assert(require('@prisma/client').PrismaClient);
    assert(require('argon2').hash);
    assert(fs.existsSync(require.resolve('prisma/build/index.js')));
  `]);
  console.log("PASS non-root runtime, workspace resolution, generated client, native argon2, no source/dev tooling");
  await up(); await ready();
  const migrationCount = (await readdir(path.join(root, "packages/server/prisma/migrations"), { withFileTypes: true })).filter(entry => entry.isDirectory()).length;
  assert.equal(Number(await sql('SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')), migrationCount);
  await compose(["run", "--rm", "migrate", "npm", "run", "-w", "server", "db:migrate:status"]);
  console.log(`PASS fresh PostgreSQL, ${migrationCount} migrations, /health 200, /ready 200`);
  const users = [];
  for (const name of ["docker_player_one", "docker_player_two"]) {
    const credentials = { username: name, email: `${name}@example.com`, password: randomBytes(20).toString("hex") };
    const r = await request("/api/auth/register", { method: "POST", body: credentials, origin: testEnv.WEB_ORIGIN });
    assert.equal(r.status, 201); assert(r.body.accessToken);
    assert.equal(r.headers.get("access-control-allow-origin"), testEnv.WEB_ORIGIN);
    const cookie = r.headers.get("set-cookie");
    for (const part of ["HttpOnly", "Secure", "SameSite=None", "Path=/api/auth"]) assert(cookie.includes(part));
    users.push({ ...credentials, ...r.body });
  }
  const untrusted = await request("/api/auth/login", { method: "POST", body: { email: users[0].email, password: users[0].password }, origin: "https://untrusted.example.com" });
  assert.equal(untrusted.status, 403);
  await compose(["exec", "-T", "server", "node", "packages/server/dist/scripts/promoteAdmin.js", users[0].username]);
  const login = async () => {
    const r = await request("/api/auth/login", { method: "POST", body: { email: users[0].email, password: users[0].password } });
    assert.equal(r.status, 200); return r.body.accessToken;
  };
  const adminToken = await login();
  assert.equal((await request("/api/admin/users", { token: adminToken })).status, 200);
  assert.equal((await request("/api/admin/audit", { token: adminToken })).status, 200);
  assert.equal(Number(await sql('SELECT count(*) FROM "AuditLog"')), 1);
  console.log("PASS REST register/login, secure cookies, exact auth CORS, compiled admin CLI and Audit API");

  const p1 = await client(), p2 = await client();
  p1.send({ type: "joinRoom", mode: "create", role: "P1", gameMode: "classic", matchType: "CASUAL", accessToken: users[0].accessToken });
  const ack = await p1.wait(message => message.type === "joinAck");
  assert.equal(ack.seat, "P1");
  p2.send({ type: "joinRoom", mode: "join", roomId: ack.roomId, role: "P2", accessToken: users[1].accessToken });
  assert.equal((await p2.wait(message => message.type === "joinAck")).seat, "P2");
  for (const [connection, seat] of [[p1, "P1"], [p2, "P2"]]) {
    connection.send({ type: "setReady", ready: true });
    await connection.wait(message => message.type === "roomState" && message.meta.ready[seat]);
  }
  p1.send({ type: "startGame" });
  const started = await p1.wait(message => message.type === "roomState" && message.meta.pendingRoll);
  const pending = started.meta.pendingRoll;
  const actor = pending.player === "P1" ? p1 : p2;
  actor.send({ type: "action", action: { type: "resolvePendingRoll", player: pending.player, pendingRollId: pending.id } });
  assert.equal((await actor.wait(message => message.type === "actionResult")).ok, true);
  await eventually(async () => Number(await sql('SELECT count(*) FROM "MatchAction"')) > 0, "durable action journal");
  const durableActions = await sql('SELECT count(*) FROM "MatchAction"');
  const migrationId = (await compose(["ps", "-aq", "migrate"])).stdout.trim();
  // Verify SIGTERM completes even with connected players; a forced SIGKILL
  // could otherwise look like a successful restart/recovery to this smoke.
  const serverId = (await compose(["ps", "-q", "server"])).stdout.trim();
  await compose(["stop", "server"]);
  assert.equal((await docker(["inspect", "--format", "{{.State.ExitCode}}", serverId])).stdout.trim(), "0");
  await compose(["restart", "server"]); await ready();
  await Promise.all([p1.close(), p2.close()]);
  assert.equal((await compose(["ps", "-aq", "migrate"])).stdout.trim(), migrationId);
  assert.equal(await sql('SELECT count(*) FROM "MatchAction"'), durableActions);
  const resumed = await client();
  resumed.send({ type: "joinRoom", mode: "join", roomId: ack.roomId, role: "P1", accessToken: users[0].accessToken });
  assert.equal((await resumed.wait(message => message.type === "joinAck")).seat, "P1");
  await resumed.close();
  console.log("PASS WS create/join/start/action, graceful server restart, durable match recovery and authenticated reconnect");

  await compose(["down"]); await up(); await ready();
  assert.equal(await sql('SELECT count(*) FROM "User"'), "2");
  assert.equal(await sql('SELECT count(*) FROM "AuditLog"'), "1");
  assert.equal(await sql('SELECT count(*) FROM "MatchAction"'), durableActions);
  await login();
  console.log("PASS second startup: migrations no-op, down/up preserves accounts/audit/action journal");
  await compose(["stop", "postgres"]);
  assert.equal((await request("/health")).status, 200);
  assert.equal((await request("/ready")).status, 503);
  await compose(["up", "-d", "--wait", "postgres"]); await ready();
  console.log("PASS database outage: /health 200, /ready 503, recovery /ready 200");
  const invalid = await compose(["run", "--rm", "--no-deps", "-e", "JWT_ACCESS_SECRET=short", "server"], null);
  assert.notEqual(invalid.code, 0); assert(invalid.stderr.includes("Invalid production auth configuration"));
  console.log("PASS invalid configuration exits before listening");
  await compose(["stop", "server"]);
  await compose(["rm", "-f", "server", "migrate"]);
  const failed = await compose(["up", "-d", "--no-build", "server"], null, { DIRECT_URL: "postgresql://fate_test:intentionally-wrong@postgres:5432/fate_docker_test" });
  assert.notEqual(failed.code, 0);
  assert.equal((await compose(["ps", "-q", "--status", "running", "server"])).stdout.trim(), "");
  const failedMigration = (await compose(["ps", "-aq", "migrate"])).stdout.trim();
  assert.notEqual((await docker(["inspect", "--format", "{{.State.ExitCode}}", failedMigration])).stdout.trim(), "0");
  console.log("PASS failed migration blocks server startup");
  console.log(`Docker smoke passed (${project}).`);
} catch (error) {
  console.error(error.message);
  const logs = await compose(["logs", "--tail", "60"], null).catch(() => undefined);
  if (logs) console.error(logs.stdout, logs.stderr);
  process.exitCode = 1;
} finally {
  for (const connection of clients) connection.socket.close();
  // Only this random disposable project is removed, never an operator's volume.
  const cleanup = await compose(["down", "--volumes", "--remove-orphans"], null).catch(() => undefined);
  if (!cleanup || cleanup.code !== 0) { console.error(`Cleanup failed for test project ${project}`); process.exitCode = 1; }
  await rm(envFile, { force: true });
  await rmdir(scratch); // Empty directory; no recursive filesystem deletion.
}
