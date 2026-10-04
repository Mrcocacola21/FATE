# Phase 9.5: production deployment

```text
Vercel (packages/web) -> Render (packages/server) -> Neon PostgreSQL
```

Neon production is the `production` branch, database `neondb`, AWS Europe Central 1
(Frankfurt). Configure credentials privately in Render. Nothing in this repository
needs a production URL, password, or JWT key. Do not copy backend variables to Vercel.

## Database connections

Prisma 6.19 uses this datasource in `packages/server/prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

The shared Prisma Client sends runtime queries through `DATABASE_URL`. In Neon,
select **Connection pooling** when copying that URL: its hostname contains `-pooler`.
Prisma Migrate and direct CLI database operations use `DIRECT_URL`: disable pooling
when copying it, and verify that its hostname does not contain `-pooler`. Both URLs
must target the same production branch, database and schema. Preserve Neon's TLS
connection parameters. There is no adapter, Accelerate, or additional pool to configure.

## Render backend

Use a Node web service with **Root Directory left blank** (repository root), Node 22,
and the existing repository's deployment branch. Render provides `PORT`; the server
binds to `0.0.0.0`. Set Health Check Path to `/ready` so database connectivity gates
deployment readiness. `/health` and `/api/health` remain lightweight process liveness.

Configure these backend variables privately:

| Variable | Production requirement |
| --- | --- |
| `DATABASE_URL` | Neon pooled URL, including its TLS parameters. |
| `DIRECT_URL` | Neon direct URL for the same branch/database/schema. |
| `JWT_ACCESS_SECRET` | Independently generated random key, at least 32 UTF-8 bytes. |
| `JWT_REFRESH_SECRET` | A different independently generated key, at least 32 UTF-8 bytes. |
| `WEB_ORIGIN` | Exact deployed Vercel HTTPS origin; no path or trailing slash. |
| `NODE_ENV` | `production` |
| `AUTH_COOKIE_SAME_SITE` | `none` |
| `ENABLE_TEST_ROOMS` | `false` |

Optional existing room/WebSocket limits retain their defaults when omitted.
`FATE_DEBUG_TOKEN` is needed only if deliberately enabling protected debug REST
operations; the production frontend must never receive it. Do not configure
`TEST_DATABASE_URL` on this service.

**Build Command**:

```sh
npm ci --include=dev && npm run -w rules build && npm run -w server build
```

The Prisma CLI is a development dependency, so explicitly include dev dependencies
in the build even when `NODE_ENV=production`. The server prebuild generates Prisma Client.

If the service supports **Pre-Deploy Command**, use:

```sh
npm run -w server db:migrate:deploy && npm run -w server db:migrate:status
```

Then use **Start Command**:

```sh
npm run -w server start
```

Render's pre-deploy command is available on paid services. If unavailable on the
service tier, leave it unset and use this **Start Command** instead:

```sh
npm run -w server start:deploy
```

That script runs `db:migrate:deploy`, then `db:migrate:status`, then `start`, joined by
`&&`. A failed migration or status check exits nonzero and prevents Node startup.
Never replace this with a semicolon, background migration, or ignored error.
The order is always **build -> migrate deploy -> migration status -> start -> readiness**.
Migrations are infrastructure commands, never HTTP request handlers or application hooks.
Keep migrations compatible with the previous version while Render transitions deployments.

The production entrypoint validates required variables, PostgreSQL URL syntax, exact
HTTPS origin, existing JWT key/TTL rules, and cookie configuration before creating
the server. It then runs a bounded database probe before listening. Missing/invalid
configuration or failed connectivity exits nonzero with a fixed safe message, without
printing values, underlying Prisma errors, or stacks. This entrypoint validation does
not force database/auth configuration on development startup or injected unit-test servers.

## Health and readiness

| Endpoint | Check | Response |
| --- | --- | --- |
| `GET /health` | Process is alive; no database work. | `200 {"ok":true}` |
| `GET /api/health` | Compatible liveness alias. | `200 {"ok":true}` |
| `GET /ready` | Startup recovery complete and `SELECT 1` through the shared runtime Prisma Client. | `200 {"ok":true}` or `503 {"ok":false}` |

Readiness has a five-second response deadline and `Cache-Control: no-store`. Concurrent
probes share an outstanding query; a response timeout does not cancel Prisma's native
query, so the query remains shared until it settles. No diagnostics or credentials
appear in readiness responses or logs. Neon cold starts may temporarily yield 503;
retry the probe after compute wakes. The check verifies connectivity, not migration
history or every application table; the deployment migration/status steps establish those.

Shutdown keeps the existing ordering: stop accepting server/WebSocket work, drain
tracked room commands and action persistence, report pending projections, disconnect
Prisma last. Active rooms, GameState, RNG and sockets remain in RAM. Startup recovery
reconstructs active persistent matches from the contiguous durable action journal,
compatible checkpoints or exact initial inputs, then reserves seats to persisted user IDs.
Sockets/tokens are replaced on authenticated reconnect. Asynchronous acknowledged actions
not committed before a hard crash can be lost. Waiting/unsafe matches are neutrally cancelled;
finished/unprocessed Rated matches are repaired idempotently. See
[Server restart recovery](server-restart-recovery.md) for the full boundary.

Run exactly one active backend owner. MATCHMAKING_SERVER_PROCESSES=1 is only a config
assertion; deployment must prevent overlapping old/new processes during replacement.
No distributed room lease or multi-replica ownership is implemented. Fastify completes
recovery before listen, so normal traffic cannot observe a partially rebuilt registry.

## Vercel frontend

| Setting | Value |
| --- | --- |
| Framework Preset | Vite |
| Root Directory | `packages/web` |
| Include source files outside Root Directory | Enabled (workspace dependencies). |
| Install Command | `cd ../.. && npm ci --include=dev` |
| Build Command | `cd ../.. && npm run -w rules build && npm run -w web typecheck && npm run -w web build` |
| Output Directory | `dist` |

Only public frontend build configuration belongs here:

- `VITE_API_URL`: Render's HTTPS origin.
- `VITE_WS_URL`: Render's WSS endpoint ending in `/ws`.
- `VITE_ENABLE_TEST_ROOM=false`.

All `VITE_*` values are public and compiled into browser assets. Never set
`DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, or `JWT_REFRESH_SECRET` in Vercel
or add any `VITE_*` version of them. Rebuild/redeploy after public configuration changes.

`packages/web/vercel.json` provides the general Vite SPA fallback to `/index.html`.
Existing static files are served by Vercel's filesystem before the fallback. Direct
URLs and refreshes for `/login`, `/register`, `/profile`, `/users/:username`, `/matches`,
`/matches/:id`, `/users/:username/matches` (and `/account`) load the React app; its
BrowserRouter selects the page. Client navigation continues through that router.
JS/CSS/image assets keep their file responses. Frontend API/WS calls use their
configured absolute Render URLs, not Vercel's SPA fallback.

Auth keeps `credentials: "include"`, exact `WEB_ORIGIN` auth CORS/POST checks,
credentialed CORS responses, and the host-only HttpOnly refresh cookie with
`SameSite=None; Secure=true; Path=/api/auth`. Existing gameplay/WebSocket origin
policies remain as implemented. Browser third-party-cookie blocking can still stop
refresh/session restoration between Vercel and Render; verify in the intended browsers.
No cookie workaround is introduced here.

## Local development and isolated tests

Local development uses local PostgreSQL, optionally:

```sh
docker compose -f docker-compose.db.yml up -d
```

Set `DATABASE_URL` to that database and `DIRECT_URL` to the same URL, then use local
Prisma development commands from the README. Export server variables into its process;
the server does not automatically load the root `.env`. Put only public Vite variables
in `packages/web/.env.local`. Fill required placeholders and omit unused optional
variables rather than exporting empty strings as overrides. Development/Test rooms
and liveness can still start without database/JWT configuration; auth uses explicit keys.

DB integration tests require `TEST_DATABASE_URL` on `localhost`, `127.0.0.1` or `::1`,
with a database or schema containing a distinct `test` name segment. They refuse
`NODE_ENV=production`, remote hosts (including Neon), and malformed URLs with safe
errors. All suites use the common guard and set both DB URLs to the validated test
target. Provision and migrate a dedicated test database first; never migrate test
fixtures using production `DIRECT_URL`. Tests clean up their fixtures and some create
temporary failure triggers, so use an isolated database and run the DB suites serially.

```powershell
# Use your separately provisioned local test connection, never a Neon URL.
$env:NODE_ENV = 'test'
$env:TEST_DATABASE_URL = '<isolated-local-test-connection>'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
$env:DIRECT_URL = $env:TEST_DATABASE_URL
npm run -w server db:migrate:deploy
npm run -w server db:migrate:status
npm run -w server test:db
npm run -w server test:auth:db
npm run -w server test:profile:db
npm run -w server test:match:db
npm run -w server test:results:db
npm run -w server test:actions:db
npm run -w server test:history:db
```

## First deployment to an EMPTY Neon database

1. In Neon, select the Frankfurt project's `production` branch and `neondb`. Copy
   pooled and direct connections privately into the corresponding Render variables.
   Prisma migrations create the FATE tables; do not create them manually in SQL editor.
2. Configure all Render environment/settings above, including the final Vercel origin,
   build command, health path and one of the two migration/start arrangements.
3. Deploy the backend commit. The build installs dependencies and generates/compiles the app.
4. Run `npm run -w server db:migrate:deploy` through pre-deploy or `start:deploy`.
5. Confirm `npm run -w server db:migrate:status` reports the schema up to date. If either
   command fails, stop and investigate; the new backend must not start.
6. Start the backend with `npm run -w server start` (the wrapper does this automatically
   after successful migration/status). Startup validates configuration and connectivity.
7. Call Render's `/health` and confirm HTTP 200 with `{"ok":true}`.
8. Call Render's `/ready` and confirm HTTP 200 with `{"ok":true}`.
9. Configure Vercel's public variables/settings above and deploy the frontend commit.
10. Smoke test registration, login, refresh/session restoration, profile/public profile,
    two authenticated players joining a multiplayer room, gameplay, completed match
    results, action history and own/public match history. Use actual supported gameplay
    to complete a match. Verify direct URLs, refreshes and client navigation for every
    route above, and check that JS/CSS/images retain their content types. Confirm API
    and WebSocket requests target Render and the refresh cookie has the expected flags.

No production migrations or production smoke tests were performed by the code-editing task.

## Existing databases

- **Empty Neon DB:** normal `db:migrate:deploy` applies the complete committed chain.
- **Already managed by these migrations:** the same command applies only pending migrations.
- **Manually created schema without migration history:** inspect, back up and investigate
  a proper baseline against the migration chain before deploying. Never blindly reset,
  mark migrations applied, or change an existing schema to force a deployment through.

Only `prisma migrate deploy` is used for production schema application. Development,
push and reset commands are not production alternatives. Keep the committed migration
files immutable after application.

Provider references: [Render deployment lifecycle](https://render.com/docs/deploys),
[Vercel Vite SPA routing](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas),
[Prisma 6 datasource reference](https://www.prisma.io/docs/orm/v6/prisma-schema/overview).
