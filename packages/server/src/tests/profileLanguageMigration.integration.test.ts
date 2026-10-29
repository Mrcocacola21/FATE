import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { configureTestDatabase } from "./testDatabase";

async function run() {
  const baseUrl = configureTestDatabase();
  const schema = `profile_migration_test_${randomUUID().replaceAll("-", "")}`;
  const isolated = new URL(baseUrl);
  isolated.searchParams.set("schema", schema);
  const url = isolated.toString();
  Object.assign(process.env, {
    TEST_DATABASE_URL: url,
    DATABASE_URL: url,
    DIRECT_URL: url,
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    WEB_ORIGIN: "http://localhost:5173",
    JWT_ACCESS_SECRET: "profile-migration-access-01234567890123456789",
    JWT_REFRESH_SECRET: "profile-migration-refresh-01234567890123456789",
  });
  configureTestDatabase();
  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  const database = new PrismaClient({ datasources: { db: { url } } });
  const directory = await mkdtemp(join(tmpdir(), "fate-profile-migration-test-"));
  const migrationRoot = resolve(__dirname, "../../prisma/migrations");
  const migrationName = "20261022090000_expand_profile_languages";
  let server: FastifyInstance | undefined;
  const deploy = () => {
    const output = execFileSync(
      process.execPath,
      [
        require.resolve("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        join(directory, "schema.prisma"),
      ],
      { cwd: directory, env: process.env, encoding: "utf8", windowsHide: true, timeout: 60000 },
    );
    console.log(output);
  };
  try {
    await cp(resolve(migrationRoot, "../schema.prisma"), join(directory, "schema.prisma"));
    await mkdir(join(directory, "migrations"));
    await cp(
      join(migrationRoot, "migration_lock.toml"),
      join(directory, "migrations", "migration_lock.toml"),
    );
    // Every other migration is already in place: the server under test reads today's columns,
    // and none of the later migrations touches the language enum.
    for (const name of (await readdir(migrationRoot))
      .filter((name) => /^\d{14}_/.test(name) && name !== migrationName)
      .sort()) {
      await cp(join(migrationRoot, name), join(directory, "migrations", name), { recursive: true });
    }
    assert((await readdir(join(directory, "migrations"))).includes("migration_lock.toml"));
    assert(!(await readdir(join(directory, "migrations"))).includes(migrationName));
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    deploy();
    const beforeEnum = await database.$queryRaw<Array<{ value: string }>>`
      SELECT unnest(enum_range(NULL::"ProfileLanguage"))::text AS value`;
    assert.deepEqual(beforeEnum.map((row) => row.value).sort(), ["en", "uk"]);
    const { buildServer } = await import("../index");
    server = await buildServer();
    const accounts: Array<{
      id: string;
      headers: { authorization: string };
      language: "en" | "uk";
    }> = [];
    for (const language of ["en", "uk"] as const) {
      const response: LightMyRequestResponse = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          email: `${language}-${schema}@example.test`,
          username: `${language}_${randomUUID().slice(0, 8)}`,
          password: "legacy profile test password",
        },
      });
      assert.equal(response.statusCode, 201, response.body);
      const account = response.json<{ accessToken: string; user: { id: string } }>();
      const headers = { authorization: `Bearer ${account.accessToken}` };
      const patch: LightMyRequestResponse = await server.inject({
        method: "PATCH",
        url: "/api/profile",
        headers,
        payload: { preferredLanguage: language },
      });
      assert.equal(patch.statusCode, 200, patch.body);
      accounts.push({ id: account.user.id, headers, language });
    }
    const beforeUsers = await database.user.findMany({ orderBy: { id: "asc" } });
    const beforeProfiles = await database.profile.findMany({ orderBy: { userId: "asc" } });
    await cp(join(migrationRoot, migrationName), join(directory, "migrations", migrationName), {
      recursive: true,
    });
    deploy();
    const migrations = await database.$queryRaw<
      Array<{ migration_name: string; complete: boolean }>
    >`
      SELECT migration_name, (finished_at IS NOT NULL AND rolled_back_at IS NULL) AS complete
      FROM "_prisma_migrations" WHERE migration_name = ${migrationName}`;
    assert.deepEqual(migrations, [{ migration_name: migrationName, complete: true }]);
    const afterEnum = await database.$queryRaw<Array<{ value: string }>>`
      SELECT unnest(enum_range(NULL::"ProfileLanguage"))::text AS value`;
    assert.deepEqual(
      afterEnum.map((row) => row.value).sort(),
      ["uk", "en", "pl", "de", "fr", "es", "pt-BR", "tr", "ja", "ko", "zh-CN", "he"].sort(),
    );
    assert.deepEqual(await database.user.findMany({ orderBy: { id: "asc" } }), beforeUsers);
    assert.deepEqual(
      await database.profile.findMany({ orderBy: { userId: "asc" } }),
      beforeProfiles,
    );
    for (const { id, headers, language } of accounts) {
      const get: LightMyRequestResponse = await server.inject({ url: "/api/profile", headers });
      assert.equal(get.statusCode, 200, get.body);
      assert.equal(get.json().profile.preferredLanguage, language);
      const patch: LightMyRequestResponse = await server.inject({
        method: "PATCH",
        url: "/api/profile",
        headers,
        payload: { preferredLanguage: language, displayName: "Existing user after migration" },
      });
      assert.equal(patch.statusCode, 200, patch.body);
      assert.equal(patch.json().profile.preferredLanguage, language);
      assert.equal(
        (await database.profile.findUniqueOrThrow({ where: { userId: id } })).preferredLanguage,
        language,
      );
      console.log(
        `Profile migration backward compatibility: existing ${language} user preserved; authenticated GET/PATCH=200`,
      );
    }
    deploy();
    assert.deepEqual(
      await database.$queryRaw`SELECT migration_name, (finished_at IS NOT NULL AND rolled_back_at IS NULL) AS complete FROM "_prisma_migrations" WHERE migration_name = ${migrationName}`,
      migrations,
    );
    console.log(
      "Profile language migration PostgreSQL integration passed: migrate deploy, 2 historical users preserved, 12 enum labels, repeat deploy is a no-op",
    );
  } finally {
    await server?.close();
    await database.$disconnect();
    try {
      assert.match(schema, /^profile_migration_test_[a-f0-9]{32}$/);
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await admin.$disconnect();
      assert.equal(dirname(directory), resolve(tmpdir()));
      assert.match(basename(directory), /^fate-profile-migration-test-/);
      // Windows can hold the folder for a moment after the Prisma CLI exits.
      await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
