# Phase 9.5 implementation report

The repository is prepared for Vercel -> Render -> Neon deployment. Production
Neon was not accessed, migrated, or deployed by this task. Use the ordered first
deployment checklist in [production-deployment.md](production-deployment.md).

## Files changed

- `.env.example`: empty placeholders and environment-specific guidance.
- `README.md`: deployment contract, direct URL, accurate Phase 9 persistence/history status.
- `docs/production-deployment.md`: complete Render/Vercel/Neon setup and deployment checklist.
- `docs/phase95-implementation-report.md`: this report.
- `packages/server/package.json`: migration status, migration-before-start wrapper, deployment tests.
- `packages/server/prisma/schema.prisma`: datasource `directUrl` only; no model/migration changes.
- `packages/server/src/config.ts`: production configuration validation.
- `packages/server/src/index.ts`: safe entrypoint validation and connectivity before listening.
- `packages/server/src/db/readiness.ts`: bounded, shared Prisma readiness probe.
- `packages/server/src/routes/healthRoutes.ts`: liveness and readiness endpoints.
- `packages/server/src/routes.ts`: liveness registration moved to the health route module.
- `packages/server/src/auth/httpSecurity.ts`: cookie configuration accepts an environment argument
  so startup can validate the existing rules; default behavior is preserved.
- `packages/server/src/tests/deployment.test.ts`: eight startup, readiness and DB-safety tests.
- `packages/server/src/tests/testDatabase.ts`: common guard re-export.
- `packages/server/src/tests/database.integration.test.ts`
- `packages/server/src/tests/auth.integration.test.ts`
- `packages/server/src/tests/profile.integration.test.ts`
- `packages/server/src/tests/match.integration.test.ts`
- `packages/server/src/tests/matchResult.integration.test.ts`
- `packages/server/src/tests/matchAction.integration.test.ts`
- `packages/server/src/tests/matchHistory.integration.test.ts`: all DB suites configure both URLs
  through the common guard, including the previously independent foundation guard.
- `scripts/testDatabase.cjs` and `scripts/testDatabase.d.cts`: shared local test target guard
  and TypeScript declaration.
- `packages/web/scripts/auth-smoke.mjs`
- `packages/web/scripts/multiplayer-smoke.mjs`
- `packages/web/scripts/match-history-smoke.mjs`: smoke cleanup utilities also use the common
  guard and pass the isolated direct URL to their backend processes.
- `packages/web/vercel.json`: general SPA fallback.

## Connection, environment and lifecycle behavior

Prisma Client still uses the existing shared process client and `DATABASE_URL`.
Prisma Migrate uses `DIRECT_URL`. Neon runtime must use the pooled URL; the direct
URL must target the same production branch/database/schema. Local PostgreSQL uses
equal URLs. No adapter, custom pool, Accelerate, domain feature or new migration was added.

Production requires both DB URLs, both independent JWT secrets (at least 32 UTF-8
bytes), exact HTTPS `WEB_ORIGIN`, and `NODE_ENV=production`. Use
`AUTH_COOKIE_SAME_SITE=none` and `ENABLE_TEST_ROOMS=false` for this deployment.
Render supplies `PORT`. Startup validates presence, URL syntax, origin, JWT/TTL
and cookie rules, then checks DB connectivity before listening. Errors are fixed
safe messages and exit nonzero. Development retains lazy database/auth initialization.

`/health` and `/api/health` perform no DB work. `/ready` performs `SELECT 1`, returning
200 with `{"ok":true}` or 503 with `{"ok":false}`, with a five-second response deadline.
Native Prisma queries cannot be cancelled by this deadline; an outstanding probe is
shared until it settles, preventing query accumulation.

Render builds from the repository root, migrates, confirms status, then starts Node.
The `start:deploy` alternative uses `&&` and blocks startup on migration failure.
Existing tracked gameplay/action persistence drains before Prisma disconnects.
Active rooms, GameState, RNG and sockets still live in RAM; restart recovery remains deferred.

Vercel's general SPA fallback covers all seven requested routes plus `/account`.
Static assets retain filesystem precedence. Auth still sends included credentials,
checks exact auth origin and uses HttpOnly/Secure/SameSite=None refresh cookies.
Third-party-cookie restrictions remain a browser limitation. Frontend configuration
contains only public `VITE_API_URL`, `VITE_WS_URL`, `VITE_ENABLE_TEST_ROOM`.

The shared test guard rejects production mode, remote/Neon hosts, malformed URLs and
ambiguous test names. Server DB suites and browser smoke cleanup configure both DB
URLs only after validating a local test target. Private environment files are ignored;
the Git index and inspected history contain no private `.env` files. Example assignments
are empty, and web source contains no backend DB/JWT environment references. No
production credentials were introduced, printed or committed.

## Commands executed and results

All PostgreSQL commands below targeted a newly created, disposable loopback Docker
PostgreSQL 16 database with a distinct `test` name segment. Its container was removed
after verification. Production credentials were not used.

| Command/check | Result |
| --- | --- |
| `npm install` | Exit 0; dependency versions/lockfile unchanged. |
| `npm run -w server prisma:generate` | Exit 0; Prisma Client 6.19.0 generated. |
| `npm run -w server db:validate` | Exit 0; schema valid. |
| `npm run -w web typecheck` | Exit 0; no TypeScript diagnostics. |
| `npm run lint` | Exit 0; **0 errors, 0 warnings**, including final rerun. |
| `npm run build` | Exit 0; rules/server/web compiled and web typechecked. |
| `npm run -w server build` | Exit 0; final server/test-source compilation after test additions/formatting. |
| `npm run test` | Exit 0; rules, boundaries, server, web auth/profile/match suites passed. |
| `npx tsx packages/server/src/tests/deployment.test.ts` | 8 passed, 0 failed/skipped/cancelled; final rerun passed. |
| Web auth/profile/match tests within `npm run test` | 31/11/15 passed, respectively; 0 failures/skips. |
| `npm run -w server db:migrate:deploy` | Exit 0; all 6 committed migrations applied to an empty isolated database. |
| `npm run -w server db:migrate:status` | Exit 0; database schema up to date. |
| `npx prisma migrate diff --from-url "$env:DIRECT_URL" --to-schema-datamodel packages/server/prisma/schema.prisma --exit-code` | Exit 0; no schema drift. |
| `npm run -w server test:db` | Passed. |
| `npm run -w server test:auth:db` | Passed. |
| `npm run -w server test:profile:db` | Passed. |
| `npm run -w server test:match:db` | Passed; service/concurrency/HTTP/WebSocket behavior. |
| `npm run -w server test:results:db` | Passed; transactions/races/rollback/results/retries. |
| `npm run -w server test:actions:db` | Passed; journal ordering/races/SQL failure/shutdown. |
| `npm run -w server test:history:db` | Passed; filtering/pagination/history/privacy. |
| Local `start:deploy` negative smoke | Exit nonzero when migration connection fails; neither status nor Node start executed. |
| `node .tmp/phase95-smoke.cjs` (temporary script removed) | Passed compiled production-mode startup, runtime URL independence, liveness/readiness, exact auth CORS and cookie flags. |
| `node .tmp/phase95-outage.cjs` (temporary script removed) | Passed real DB-outage readiness 503 within deadline, both liveness endpoints 200 and graceful close. |
| `node --check` on shared guard and three browser smoke scripts | Passed. |
| `git diff --check`, placeholder/frontend/index checks | Passed. |

Supporting commands included Docker availability/container readiness checks,
`docker run --detach --rm` for the temporary PostgreSQL instance, `docker port`,
and `docker stop --time 1` for its outage/cleanup check. Formatting was limited to
new configuration/readiness/test/guard files with `npx prettier --write`.

Two connection-path checks used only synthetic local targets: migrations succeeded
with an unreachable runtime URL and working direct URL; the compiled production
server succeeded with a working runtime URL and unreachable direct URL.

The production build emitted existing Vite CJS deprecation, Browserslist freshness
and chunk-size advisories. Installation reported 26 dependency audit findings
(2 low, 3 moderate, 20 high, 1 critical); dependency upgrades were outside this phase.
The eight deployment tests include negative execution of each browser smoke script's
DB guard; full browser smoke scenarios were not run. Live Vercel routing and Render/Neon
deployment remain unverified and require the documented manual deployment/smoke checks.

## Manual actions and first deployment order

1. Select Neon's Frankfurt production branch/database and privately configure Render's
   pooled/direct URLs and required backend environment.
2. Configure Render repository-root build, `/ready` health check and the applicable
   pre-deploy/start arrangement from the deployment guide.
3. Build the backend using the documented command.
4. Apply the committed chain using `db:migrate:deploy` before any new backend traffic.
5. Confirm `db:migrate:status` is up to date; stop if either database command fails.
6. Start the backend and require successful startup validation/connectivity.
7. Verify `/health` returns 200 and `{"ok":true}`.
8. Verify `/ready` returns 200 and `{"ok":true}`.
9. Configure Vercel's workspace settings and public variables, then rebuild/deploy.
10. Smoke registration/login/session refresh/profile/multiplayer/completed results/action
    journal/own and public history; verify direct URLs, refreshes, navigation and assets.

Prisma migrations create the tables in an empty database. Already managed databases
receive pending migrations. An existing manually created schema needs investigation
and a proper baseline; never reset blindly or use a production schema push workaround.
