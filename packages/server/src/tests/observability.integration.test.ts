import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { instrumentDatabase } from "../db/client";
import { createDatabaseReadinessCheck } from "../db/readiness";
import { ApplicationMetrics } from "../observability/metrics";
import { buildServer } from "../index";
import { databaseFixture } from "./helpers/databaseFixture";

test("real Prisma extension measures queries inside transactions and preserves rollback/conflicts", async () => {
  const fixture = databaseFixture();
  const metrics = new ApplicationMetrics();
  const db = instrumentDatabase(fixture.db, metrics);
  try {
    const user = await fixture.user("observability");
    await db.$queryRaw`SELECT 1`;
    await db.$transaction(async tx => {
      assert.equal((await tx.user.findUnique({ where: { id: user.id } }))?.id, user.id);
      await tx.user.update({ where: { id: user.id }, data: { role: "MODERATOR" } });
    });
    assert.equal((await fixture.db.user.findUnique({ where: { id: user.id } }))!.role, "MODERATOR");
    await assert.rejects(db.$transaction(async tx => {
      await tx.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      throw new Error("rollback fixture");
    }));
    assert.equal((await fixture.db.user.findUnique({ where: { id: user.id } }))!.role, "MODERATOR");
    await assert.rejects(db.user.create({ data: { email: user.email } }));
    await assert.rejects(db.$queryRaw`SELECT missing_observability_column`);
    const text = await metrics.registry.metrics();
    assert.match(text, /fate_db_operation_duration_seconds_count\{operation="query",result="success"\} 4/);
    assert.match(text, /fate_db_operation_duration_seconds_count\{operation="query",result="error"\} 2/);
    assert.match(text, /fate_db_errors_total\{operation="query",category="unknown"\} 1/);
    assert(!text.includes('category="constraint"'));
    for (const value of [user.id, user.email, "missing_observability_column", "SELECT"]) assert(!text.includes(value));
  } finally { await fixture.dispose(); }
});

test("real local DB unavailable/restored: process stays healthy, readiness changes safely, metrics stay read-only", async () => {
  const fixture = databaseFixture();
  const metrics = new ApplicationMetrics();
  // Guaranteed local closed-port failure; never change or stop the caller's database.
  const unavailable = instrumentDatabase(new PrismaClient({ log: [], datasources: {
    db: { url: "postgresql://fate_test:local_test_password@127.0.0.1:1/fate_test?connect_timeout=1" },
  } }), metrics);
  let up = true;
  const check = createDatabaseReadinessCheck(() => up ? fixture.db.$queryRaw`SELECT 1` : unavailable.$queryRaw`SELECT 1`, 2000, metrics);
  const server = await buildServer({ metrics, matchRecovery: false, documentationOnly: true, databaseReadiness: check });
  try {
    const before = await fixture.db.auditLog.count();
    assert.equal((await server.inject("/ready")).statusCode, 200);
    up = false;
    assert.equal((await server.inject("/health")).statusCode, 200);
    const down = await server.inject("/ready");
    assert.equal(down.statusCode, 503); assert.deepEqual(down.json(), { ok: false });
    up = true;
    assert.equal((await server.inject("/ready")).statusCode, 200);
    assert.equal((await server.inject("/metrics")).statusCode, 200);
    assert.equal(await fixture.db.auditLog.count(), before);
  } finally { await server.close(); await unavailable.$disconnect(); await fixture.dispose(); }
});
