# Docker production deployment

Docker is an additive alternative to [Vercel → Render → Neon](production-deployment.md).
The frontend remains separately deployed on Vercel/static hosting. This stack runs
exactly one backend owner plus PostgreSQL, with a one-shot migration job:

```text
separate frontend -- HTTPS/WSS --> platform / TLS proxy --> server:3000
                                                           |
postgres healthy --> migrate exits 0 --> server recovery --> /ready = 200
```

Use modern Docker Engine with Docker Compose v2 (tested with Docker Desktop on
Windows). Run all commands from the repository root. No frontend build, local
`node_modules`, local `dist`, source bind mounts or bash-specific setup is required.
Node 22 matches README, CI and Render; PostgreSQL 16 matches existing CI/dev DB.

## Configure and start

```powershell
Copy-Item .env.production.example .env.production
# Edit .env.production privately: replace DB and JWT placeholders and WEB_ORIGIN.
docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d --wait --wait-timeout 180
docker compose --env-file .env.production ps -a
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/ready
docker compose --env-file .env.production logs -f server
```

The complete [environment reference](production-environment.md) applies to both
hosted and Docker deployments. Always pass `--env-file .env.production`; exported
shell variables override that file. This avoids reliance on unrelated root `.env`
files. `config --quiet` validates without printing resolved secrets; plain `config`
and container inspection expose runtime environment to the operator, so do not share
their raw output. Real `.env*` files are ignored by Git and the Docker build context.
The example contains only placeholders and its JWT placeholders intentionally fail
the application's minimum length validation.

Only the backend is published, on `127.0.0.1:3000` by default. Set `SERVER_PORT`
to change the host port. Container HTTP and `/ws` share port 3000 and bind to
`0.0.0.0`. PostgreSQL has no host port; it is reachable only through project Docker
networking. An external proxy may need `SERVER_BIND_ADDRESS` adjusted; public
production requires TLS termination for HTTPS/WSS at a platform/load balancer/proxy.
There is no TLS/certificate manager or proxy container in this base stack.

Local smoke uses native HTTP clients without a browser cookie jar. Browser auth
still requires an exact HTTPS frontend origin and Secure cookies: expose the backend
through HTTPS before using a real frontend. Do not weaken cookies for a local test.

## Image and migration ownership

`Dockerfile` uses `node:22-bookworm-slim` plus OpenSSL and CA certificates. The
build stage installs from the root lockfile with `npm ci` for rules/server and root
build tooling. It includes rules source before install because root `postinstall`
builds rules, explicitly builds rules again, forces Prisma Client generation on Linux,
then executes the existing server prebuild/build (including generated response JSON).
The web manifest is present for workspace metadata; web source/dependencies/build
are not required. The production dependency stage prunes dev tooling without
lifecycle hooks, removes Prisma's unused optional TypeScript compiler peer and
removes compiled tests/manual runners. Runtime copies only
production dependencies, compiled rules/server, required package manifests, Prisma
schema/migrations and a tiny Node health probe. Workspace symlinks retain their
`/app/packages/rules` target. No application source or secrets are copied to runtime.

Prisma CLI moved intentionally from server devDependencies to dependencies so
the **same image** supports migration jobs after pruning. No separate unlocked
tool installation is used. Prisma Client/CLI remain locked at the same existing
version. Client generation occurs during build, never on container startup.

`migrate` waits for PostgreSQL TCP `pg_isready`, runs only the existing
`npm run -w server db:migrate:deploy` (`prisma migrate deploy`), and has no restart
policy or health probe. Server waits for PostgreSQL health and migration exit 0.
Failure blocks new server startup. The server's direct Node command does not run
migrations; normal server restarts do not rerun them. The application still validates
production env and DB connectivity, restores recoverable matches, repairs pending
ratings through existing startup recovery, then listens.

Manual migration/status commands using the built image:

```powershell
docker compose --env-file .env.production run --rm migrate
docker compose --env-file .env.production run --rm migrate npm run -w server db:migrate:status
```

Run one migration job at a time. An empty DB receives all committed migrations;
later runs apply only pending migrations. Never use development/schema-push/reset
commands as deployment substitutes. Do not edit already applied migrations.

For an **upgrade**, stop the existing sole owner before migrating/replacing it.
Compose dependency conditions gate creation/startup, but do not stop a server that
was already running when a new migration fails. Use this explicit sequence:

```powershell
docker compose --env-file .env.production build
if ($LASTEXITCODE -ne 0) { throw 'Build failed; keep the existing server running' }
docker compose --env-file .env.production stop server
# Remove only the completed one-shot job, so this upgrade has a fresh migration gate.
docker compose --env-file .env.production rm -f migrate
docker compose --env-file .env.production up -d --wait --wait-timeout 180
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed; inspect migrate/server logs before retrying' }
```

This runs one migration service before the stopped server can start. There is no
automatic database rollback or zero-downtime guarantee. Keep migrations
compatible with rollback application versions and investigate failures before retrying.
Do not scale server replicas, Node cluster/PM2 workers, or overlap old/new owners:
rooms and matchmaking are process-local, with no distributed leases.

## Health, shutdown and persistence

`/health` (and `/api/health`) is process liveness with no DB query. `/ready` waits
for startup recovery and probes runtime DB connectivity with a five-second deadline;
it returns 200/503 with `{ "ok": true/false }`. Docker uses `/ready` with a 6.5s
probe deadline, 8s command timeout, 30s start period, then three retries at 15s.
Fastify completes recovery before listening; there is no partial-registry traffic.
Use `/ready` for platform/proxy traffic gates. Docker unhealthy status alone does
not restart a container. Server crash retries are bounded (`on-failure:3`) so
permanent invalid configuration remains visible; PostgreSQL uses `unless-stopped`.

Node runs as the official image's unprivileged `node` user. Its direct exec-form
command receives SIGTERM/SIGINT. Existing Fastify/WebSocket close hooks stop work,
drain room commands, action persistence and finalization (each bounded at 5s), then
disconnect Prisma. Compose allows 30s before forced termination. Logs remain existing
redacted JSON on stdout/stderr; no primary log files or runtime generated source are
needed. Deployments should configure their Docker/platform log retention separately.

```powershell
docker compose --env-file .env.production restart server
docker compose --env-file .env.production logs --tail 100 server
docker compose --env-file .env.production down
docker compose --env-file .env.production up -d --wait --wait-timeout 180
```

The project-scoped `postgres_data` named volume stores PostgreSQL data outside
the server image. Server restart/recreation and ordinary down/up preserve it. Keep
the same Compose project name/directory; changing it selects a different volume.
**`docker compose down -v` destroys the project's database volume.** Do not use it
for an upgrade. A named volume is persistence, not a backup. Serious deployments
need PostgreSQL/managed DB backups. PostgreSQL major upgrades require a planned
backup/migration/restore procedure; changing `postgres:16-bookworm` to another major
against the existing volume is not a supported upgrade procedure.

[Restart recovery](server-restart-recovery.md) restores durable IN_PROGRESS matches,
reserves participant seats and accepts authenticated reconnects. RAM-only waiting
rooms/unsafe matches follow existing neutral cancellation rules. A hard crash can
lose acknowledged actions whose asynchronous journal writes did not commit; the
container does not change that durability boundary. Audit events remain DB records.

The compiled operator CLI is available without tsx:

```powershell
docker compose --env-file .env.production exec server node packages/server/dist/scripts/promoteAdmin.js "existing_username"
```

## Managed PostgreSQL / existing Render

The current Render Node build/start and Vercel settings remain valid. Docker is an
optional platform runtime. For Neon/external PostgreSQL, do not start Compose's local
postgres service or use its dependency chain. Build the same image and use a private
env file containing only application variables (`NODE_ENV=production`, both DB URLs,
distinct JWT keys, HTTPS origin, `ENABLE_TEST_ROOMS=false`, etc.). Neon runtime URL
is pooled; migration URL is direct for the same branch/schema, retaining TLS options.

```powershell
docker build -t fate-server:local .
# Stop the existing sole server owner before this deployment migration.
docker run --rm --env-file .env.backend.production fate-server:local npm run -w server db:migrate:deploy
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; do not start the new server' }
docker run -d --name fate-server --restart on-failure:3 --stop-timeout 30 --env-file .env.backend.production -p 127.0.0.1:3000:3000 fate-server:local
```

Do not perform verification against production Neon. Platform pre-deploy jobs can
run the same migration command before starting the default image command. Put only
public HTTPS API/WSS endpoint URLs in Vercel; see the shared environment reference.

## Verification and troubleshooting

`node scripts/dockerSmoke.mjs` runs against a random isolated Compose project and
fresh local volume, with generated disposable credentials and a free loopback port.
It uses the already-built `fate-server:local` image, verifies config/migration status,
REST/auth/secure cookie/CORS, WS and durable match recovery, normal restart/down-up
persistence, migration failure gating and DB outage readiness. It removes only its
own project/volume in finally. It never reads production env files. CI builds the
image and runs this smoke separately from the existing quality job.

| Symptom | Inspect / action |
| --- | --- |
| PostgreSQL unhealthy | `logs postgres`; verify storage permissions and POSTGRES_*; old volumes retain their original credentials |
| Migration exits nonzero | `logs migrate`; check direct URL, matching credentials/schema and committed migration status; server must remain stopped |
| Server exits/restarts | `logs server`; fill all required env, use distinct strong JWT keys and exact HTTPS WEB_ORIGIN |
| `/health` 200, `/ready` 503 | DB connectivity/outage; migration success alone does not keep runtime DB reachable |
| Cannot connect while starting | Recovery finishes before listen; inspect server logs and allow startup to complete |
| CORS/refresh fails in browser | Match exact frontend origin, HTTPS/WSS, credentials include and Secure/SameSite cookie settings; check browser third-party-cookie policy |
| Port already allocated | Change SERVER_PORT or stop the conflicting local service; do not expose PostgreSQL to fix it |
| Fresh unexpected empty DB | Check project name/volume and DB URL, avoid changing Compose directory/project identity |

Registry publishing/CD, proxy/TLS management, backup automation, orchestration/HA,
multi-replica coordination and zero-downtime migration frameworks are outside this
packaging change. References: [Compose startup conditions](https://docs.docker.com/compose/how-tos/startup-order/),
[npm ci lockfile installs](https://docs.npmjs.com/cli/v10/commands/npm-ci/).
