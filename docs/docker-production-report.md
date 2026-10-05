# Docker production implementation report

Verified locally on 2026-10-05. No hosted production deployment, Neon access,
registry upload, infrastructure replacement or business-logic change was performed.

## Repository findings and final implementation

1. **Existing infrastructure:** `docker-compose.db.yml` was a development-only
   PostgreSQL 16 stack with a published 5432 port. There was no backend Dockerfile
   or production Compose stack. Deployment docs describe Vercel/Render/Neon;
   `packages/web/vercel.json` provides SPA routing. No Render YAML was present.
2. **Node/runtime contract:** README, CI and Render docs specify Node 22. There
   was no engines field, `.nvmrc` or `.node-version`. Docker preserves major 22;
   the tested official image ran Node 22.23.3, host verification used 22.14.0.
3. **Prisma architecture:** Client and CLI are locked at 6.19.0, with committed
   PostgreSQL migrations and datasource `url=DATABASE_URL`, `directUrl=DIRECT_URL`.
   Existing production scripts deploy/status-check migrations before starting;
   server prebuild generates Client and OpenAPI response schemas. All remain valid.
4. **Files changed:** added root `Dockerfile`, `.dockerignore`, `compose.yml`,
   `.env.production.example`, `scripts/docker-healthcheck.cjs`,
   `scripts/dockerSmoke.mjs`, and the three Docker/environment/report docs.
   Updated `.gitignore`, server manifest/root lockfile, README, hosted deployment
   docs, CI docs and `.github/workflows/ci.yml`.
5. **Dockerfile architecture:** official `node:22-bookworm-slim`, Debian glibc,
   OpenSSL 3 and CA certificates in matching build/runtime bases. No Alpine
   compatibility change, build-time credentials or frontend build.
6. **Stages:** `base` installs OS compatibility libraries; `build` performs
   locked npm workspace installation, explicit rules/Client/server build;
   `production-dependencies` prunes dev dependencies without lifecycle hooks or
   lockfile writes and removes compiled tests/manual runners and the optional
   TypeScript peer; `runtime` copies only the deployable artifacts.
7. **Runtime behavior:** direct `node packages/server/dist/index.js`, production
   environment, HTTP/WS container port 3000, runtime-only configuration. No
   generation/migration/build lifecycle on normal server startup. Compiled OpenAPI
   JSON and the server manifest required by version lookup are included.
8. **Workspace/rules packaging:** root lockfile plus all workspace manifests are
   available during install, while dependency filters select rules/server/root
   tooling. Rules source precedes npm ci because root postinstall builds it.
   Runtime keeps the workspace symlink target and compiled rules declarations/maps;
   web source, dependencies and assets are absent.
9. **Prisma generation:** forced explicitly in the Linux build stage using the
   existing generator, then the existing prebuild verifies/reuses that Client.
   Generated native Client is copied with node_modules. Generation requires no DB
   credentials and never runs inside normal server or migration startup.
10. **Migration architecture:** a one-shot `migrate` service uses the same image
    and existing `db:migrate:deploy` script. It waits for PostgreSQL health. Server
    depends on both PostgreSQL health and successful migration completion. The CLI,
    schema and migration SQL are present after dev-dependency pruning.
11. **Why a separate service:** schema mutation has one explicit owner and is
    separate from application crash/restart/recovery. Server-only restart does not
    rerun migrations. A deployment upgrade stops the existing sole server owner
    and recreates the one-shot migration gate before restarting traffic.
12. **PostgreSQL:** `postgres:16-bookworm`, env-provided DB/user/password, default
    PostgreSQL tuning, `unless-stopped`, no SQL table-init scripts or debug UI.
13. **PostgreSQL health:** TCP `pg_isready -h 127.0.0.1`, 5s interval/timeout,
    12 retries, 10s start period. TCP avoids treating the init-only Unix-socket
    server as final DB availability. There are no arbitrary startup sleeps.
14. **Server health/readiness:** Docker probes existing `/ready` using Node fetch,
    6.5s fetch deadline/8s Docker timeout, 30s start period, 15s interval/3 retries.
    `/health` remains DB-free liveness; readiness includes completed recovery and
    the existing bounded DB check. Unhealthy alone does not trigger Docker restart.
15. **Persistence:** project-scoped `postgres_data` named volume at PostgreSQL
    16's `/var/lib/postgresql/data`; server has no application-state filesystem
    volume. Normal recreation/down-up preserves data. `down -v` destroys it.
16. **DB network exposure:** no PostgreSQL host port; internal Compose DNS
    `postgres:5432`. Only backend is published, on configurable host port/interface,
    default `127.0.0.1:3000`. The development DB Compose file is unchanged.
17. **Non-root:** runtime `USER node`, artifact ownership `node:node`, verified
    nonzero UID. No application source, real env files or Git metadata in runtime.
18. **Signals/shutdown:** direct Node exec-form CMD, existing SIGTERM/SIGINT and
    Fastify/WebSocket hooks preserved; 30s stop grace accommodates the three
    existing 5s drain bounds. Smoke explicitly stops connected players' server and
    asserts exit code 0 before restarting, excluding a hidden forced SIGKILL.
19. **Restart recovery:** unchanged startup recovery runs before listen after
    migration/connectivity checks. Docker smoke exercised IN_PROGRESS match
    journaling, shutdown, reconstruction and authenticated same-seat reconnect.
    Existing acknowledged-but-not-yet-durable hard-crash limitations remain.
20. **Production env:** the complete variable/default/example/security table is
    in [production-environment.md](production-environment.md). Base Compose fixes
    NODE_ENV=production, PORT=3000, test rooms disabled and one backend process;
    forwards normal auth, logging, persistence, leaderboard, WS and matchmaking
    controls. Validation remains the existing application source of truth.
21. **Secrets:** only placeholders are committed. Real env files are excluded
    from Git and Docker context; no secrets in build ARG/ENV or image history.
    Docker smoke generates disposable local keys/passwords, then deletes its env
    file and test project. Its test DB password includes URL-special characters.
22. **Self-hosted URLs:** explicit DATABASE_URL/DIRECT_URL target internal
    `postgres`, same DB/schema, normally identical direct URLs. URL-encode credential
    components and keep raw POSTGRES_PASSWORD separate; env-file single quoting
    protects special characters from Compose interpolation.
23. **Neon URLs:** the same image accepts pooled runtime DATABASE_URL and direct
    non-pooled DIRECT_URL with provider TLS options. Managed-DB instructions run
    only the image and a one-shot job, without Compose's local PostgreSQL.
24. **CORS/cookies/proxy:** exact HTTPS WEB_ORIGIN for auth is preserved. Existing
    broader gameplay/WS origin allowances are documented without expansion.
    Refresh cookie stays HttpOnly/Secure/host-only, path `/api/auth`, production
    SameSite default `none`. No blind Fastify trustProxy enablement; public TLS
    termination belongs to the platform/proxy.
25. **Separate frontend:** Vercel remains independent. Docker does not build or
    serve web and does not replace the documented Render Node deployment flow.
26. **Frontend URLs:** VITE_API_URL is the public HTTPS backend origin and
    VITE_WS_URL is its WSS `/ws` endpoint, while WEB_ORIGIN is the frontend origin.
    VITE_ENABLE_TEST_ROOM=false. Frontend env is public and requires rebuilds;
    no DB/JWT/admin secrets belong there.
27. **Operator docs:** [docker-production.md](docker-production.md) includes
    PowerShell setup/start/upgrade, health/logs, migration/status, compiled admin
    CLI, restart/volume behavior, managed DB, frontend integration and troubleshooting.
    Shared env docs and README/hosted/CI links were updated.

## Executed verification

28. **Docker commands:** executed root `docker build --progress=plain -t
    fate-server:local .`, another build tagged `fate-server:clean-test` from a
    freshly created source-only directory, image inspect/history/runtime dependency
    probes, and `node scripts/dockerSmoke.mjs`. The script executes Compose config,
    up/wait, ps, migration status, psql checks, stop/restart, down/up, outage and
    failure runs against a random isolated project, then down with volume cleanup.
29. **Build result:** final production Dockerfile build exit 0. Clean-context
    build also exit 0 without local node_modules/dist/env files or frontend source.
    The clean build reused equivalent cached layers; npm ci and compilation were
    actually executed in earlier Docker build stages. Runtime tests verified absent
    TS/tsx/ESLint/Vite/React/sharp and present rules/Prisma Client/CLI/native argon2.
    Inspected final runtime has USER=node and CMD=[node, packages/server/dist/index.js].
30. **Compose config:** `docker compose --project-name <random-test-project>
    --env-file <generated-test-env> -f compose.yml config --quiet` exit 0. No
    resolved secrets were printed. Docker Desktop Engine 28.5.1 / Compose 2.40.3.
31. **Fresh DB:** PostgreSQL healthy, migration service exit 0; all 11 committed
    migrations have finished, non-rolled-back history entries. Migration status
    command exit 0 against that DB. Second full startup safely no-ops migrations.
32. **Liveness:** `/health` HTTP 200 with ok=true after fresh startup/restart;
    remains 200 during a stopped PostgreSQL service.
33. **Readiness:** `/ready` HTTP 200 with ok=true after recovery; HTTP 503 during
    DB outage; returns to HTTP 200 after DB restart. Compose server health passed.
34. **Smoke results:** REST registration/login, exact allowed/disallowed auth
    origin, Secure/HttpOnly/SameSite/path cookies, operator promotion, Admin users
    and Audit API passed. WS create/join/start/initiative action persisted. Connected
    server SIGTERM exits 0; server-only restart retains migration job identity,
    reconstructs durable match and accepts authenticated reconnect. Normal down/up
    retains two accounts, audit event and action journal; login still works. Invalid
    JWT exits nonzero before listen. Wrong migration credentials exit nonzero and
    prevent server running. Final smoke exit 0, test project/volume/env cleaned.
35. **Repository checks:** existing Prisma generate succeeded; db:validate
    succeeded using explicit disposable local validation URL syntax (no connection);
    `npm run typecheck` passed rules/server/web and smoke harness; `npm run lint`
    passed with 0 errors and 0 warnings; `npm run test` passed all 39 regression
    suite executions (including 463 frontend component/helper tests); `npm run build`
    passed rules/server/web. Build printed existing Vite CJS API, stale Browserslist
    and >500kB bundle notices; these are not lint warnings. Git diff whitespace check
    and both new Node script syntax checks passed.
36. **Verification limits:** no real production secrets/infrastructure were used;
    no managed Neon or externally terminated HTTPS browser deployment was exercised.
    Existing full DB integration/browser E2E CI layers were not rerun locally; root
    regressions plus real Docker REST/WS/recovery smoke were run. The new CI job is
    authored but has not been executed on GitHub. Automatic command review blocked
    recursive cleanup of the source-only temporary build copy with the generic
    reason `blocked by policy`; it remains under `%TEMP%/fate-clean-context-...`
    and contains no secrets. This does not include the disposable Compose DB/env,
    which the smoke successfully removed.
37. **Deferred intentionally:** registry/CD publishing, reverse proxy/certificate
    management, backup automation, Kubernetes/HA/replication and distributed owner
    coordination, and zero-downtime/automatic DB rollback frameworks. Named volumes
    are not backups and PostgreSQL major upgrades need a separate planned procedure.

The production image is immutable application packaging, configuration is supplied
at runtime, DB data lives in a separate volume, and committed production migrations
are applied exclusively with `prisma migrate deploy` before server recovery/readiness.
Application behavior, REST/WS/Admin/Audit and the hosted frontend architecture remain
unchanged. Dependencies use [npm's save=false behavior](https://docs.npmjs.com/cli/v10/using-npm/config/#save)
to prevent prune from writing the lockfile; the Compose gate uses documented
[healthy/completed dependency conditions](https://docs.docker.com/compose/how-tos/startup-order/).
