# Logging, health and observability implementation report

Repository: `C:\codes\FATE`. Verification date: 6 October 2026 (Europe/Kyiv).

## What existed before this change

- Fastify 4.29.1 and its Pino logger, JSON output, an unvalidated `LOG_LEVEL`,
  default `reqId` correlation and three request/response-header redaction paths.
  Game/Pong adapters emitted considerable INFO diagnostic metadata. Match,
  rating, statistics and Pong services had `console` defaults; the entrypoint
  wrote plain startup errors to stderr. CLI/test console output was separate.
- `/health` and `/api/health` already returned 200 `{ok:true}` without DB access.
  `/ready` already combined a startup boolean and read-only `SELECT 1`, used
  `{ok:boolean}`, and shared an outstanding query with a five-second deadline.
  Startup recovery ran in `onReady`, blocking the HTTP listener. Shutdown did not
  explicitly clear readiness before draining.
- No application metric registry, `/metrics`, prom-client, collector, or external
  monitoring stack existed. Room/socket registries, durable projections, replay
  wrappers, action/snapshot queues and recovery summary logs were available.
- Prisma 6.19.0 used a lazy process singleton, with no query instrumentation.
  Docker ran migration deployment separately, used `/ready` for availability,
  sent SIGTERM directly to Node and allowed 30 seconds for draining. AuditLog,
  admin aggregates and MatchAction had distinct durable purposes.

## Final implementation

`observability/logger.ts` is the canonical Pino factory for Fastify and fallback
service loggers. JSON is retained in development and production; no pretty
transport/dependency was added. One completion access log replaces Fastify's
default request pair and includes method, normalized route, status and duration.
Probe/metrics access events are excluded. Errors use sanitized bounded frames,
allowlisted type/code and no raw message, Prisma arguments, metadata or cause.
The entrypoint also handles fatal process errors with JSON logging and bounded
termination. Before logger construction, validated static startup messages use
JSON stderr so errors remain visible with invalid config or `LOG_LEVEL=silent`.

Correlation fields are `requestId`, `userId`, `matchId`, `roomId`, `connectionId`,
`commandCorrelationId`, `command`, `revision`, `durationMs`, `errorCode`. Legacy
game event adapters keep established tags, but emit only allowlisted metadata.
Lifecycle diagnostic codes now use `errorCode`; REST/WS business error envelopes
continue using their existing `code` fields.

HTTP reuses a bounded inbound `X-Request-Id` or generates a UUID, returns it on
responses and exposes that response header through CORS. Request children bind
the same ID throughout processing. Auth middleware/identity helpers and successful
register/login handlers add internal user IDs. Match-scoped request children,
lifecycle projections and recovery/replay boundaries add match/room identifiers.
WS connection and join/leave events share a stable server-generated physical
transport ID; every parsed message has its own server-generated command ID.
Internal seat ownership `connId` is unchanged. No AsyncLocalStorage or business
requestId parameters were added.

Redaction is recursive and case-insensitive for authorization, cookies,
Set-Cookie, passwords/hashes, access/refresh/resume/debug tokens, seat/reclaim
secrets, JWT keys and database URLs. It also covers child bindings and excludes
body, state/GameState, snapshot and action payload fields. Native Pino redaction
adds another layer; HTTP serializers expose only method/status. Gameplay logging
uses compact allowlists, without hidden state, choices, rolls, names or payloads.
The level policy and a synthetic JSON example are in [the operational guide](observability.md).

Health retains the existing API/OpenAPI response shape. `/health` stays an
in-memory 200 independent of PostgreSQL. `/ready` requires startup/recovery
completion, a non-draining process and successful `SELECT 1`, returns safe 503
otherwise, and never mutates business data. The deadline is now **2 seconds**;
shared native probes prevent accumulating work while a query hangs. Readiness
transitions log once rather than logging every failed probe.

Production now listens during recovery, allowing `/health`, `/ready` and metrics
to answer while normal traffic is gated. `buildServer` retains its synchronous
startup default for existing embeddings, with an explicit production option and
`waitForStartup()` for background recovery. Existing per-match failure isolation
is retained; global recovery failure aborts startup. Shutdown signals and
programmatic `preClose` clear readiness before existing drains and close.

Metrics use `prom-client` 15.1.3 and a dedicated in-process Registry. It provides
standard text exposition/histograms without a custom serializer, default global
registry, network exporters, process timers or external monitoring deployment.
Pino 9.14.0 is an explicit runtime dependency and deduplicates with Fastify's
Pino. `/metrics` is read-only, has no-store caching and is hidden from JSON OpenAPI.
`METRICS_ENABLED` defaults true, accepts exactly true/false, and false omits the
route. Public deployments must restrict access at their proxy/network layer or
disable it; no OAuth subsystem was added.

The [metric catalogue](observability.md#metrics) gives every exact name, type,
label, allowed value and bucket. There are two unlabelled gauges, five unlabelled
lifecycle counters, command/replay/DB histograms, a classified DB failure counter,
candidate recovery duration/count and coordinator duration. IDs, raw SQL/URLs,
revision, user data and error messages are never labels. Runtime counters reset
on restart, rather than pretending to be admin/database all-time totals.

Room collection reads registry size in O(1), covering publication, recovery,
removal and cleanup without increment/decrement drift. It includes retained ended
rooms until actual removal. Socket collection tracks all accepted transports,
including spectators and sockets without a room, and removes close/error events
idempotently. Failed origin handshakes are never registered.

Lifecycle observations occur after successful creation/publication or persistent
start/finalization/cancellation/interruption. Weak runtime ownership prevents
duplicate counts without retaining an unbounded ID history. A successfully
finalized restored projection recognizes repeated finalization; failed rating/
result attempts continue through the existing retry path and count after success.

WS command duration begins after successful schema parsing, includes socket/room
queue wait, validation/domain processing and required synchronous persistence,
and ends at acknowledgement/rejection/broadcast decisions. Ordinary asynchronous
journal persistence is excluded according to the existing gameplay architecture.
All finite protocol/action names normalize through canonical Zod schemas; unknown
values use `UNKNOWN`. Expected illegal commands record `rejected`; unexpected
exceptions and known infrastructure failure responses record `error`.

Replay duration wraps service loading and actual reconstruction. Successful
observations distinguish initial state from snapshot tail; errors use `unknown`
when a usable base has not been established. Pure replay helpers are untouched.
Expected invalid/not-found replay requests log DEBUG; reconstruction/storage
failures log ERROR with match context. Recovery observations wrap each candidate
and the existing coordinator, including rating repair in coordinator duration.

DB latency wraps the public Prisma `$allOperations` query extension, forwarding
original arguments/query in the original transaction. Model and raw operations
through the application singleton are covered, including individual operations
inside interactive/batched transactions. Readiness has a separate deadline
boundary; its eventual native singleton query also appears as `query`. Full
transaction wall time, commit/connection errors outside individual operations and
separately constructed/injected clients are not claimed as covered. Error labels
are bounded: timeout, connection, constraint, transaction, unknown. Expected P2002
conflicts retain latency observations but do not increment infrastructure errors.
Disconnect now releases the process/hot-reload singleton so later builds do not
reuse a disconnected client configured for a previous test datasource.

## Tests and compatibility

Added `observability.test.ts` (10 tests) and `observability.integration.test.ts`
(2 PostgreSQL tests), included in the normal contract/integration orchestration.
The focused script is `npm run -w server test:observability`.

Tests use sentinel passwords/tokens/cookies and hidden state, capture actual JSON,
check parent/child redaction and stacks, request ID normalization and auth/match
context, readiness timeout/outage/restoration/startup/shutdown, two actual sockets
with 2→1→0 counts, accepted/rejected latency, recovery publication, all lifecycle
transitions and repeated terminal finalization, replay success/error/source,
finite labels with many IDs/unknown commands, DB categories/expected conflicts,
read-only scrapes, disabled exposure, real transaction commit/rollback and local
unreachable DB behavior. No wall-clock latency equality is asserted.

Existing tests were adjusted for intended log contracts: startup diagnostics are
JSON, logging codes use `errorCode`, and `/metrics` is an explicit hidden OpenAPI
route. The OpenAPI readiness example now injects an unavailable probe instead of
depending on a previously cached fake datasource. Existing rules tests had
prefer-const/unused-variable lint errors; bindings were corrected without changing
fixtures or rules. Marker projection and real WS projection tests now expect the already-existing
safe `hiddenSetupCompleted` notice instead of an empty list, retaining hidden
position protection. The PostgreSQL realtime test now waits, with a bounded poll,
for its precise action revision to persist: ordinary acknowledgements deliberately
precede journal writes. No production persistence timing or rules were changed.

There are no Prisma schema/migration changes, metric/application-log tables,
MatchAction instrumentation entries or AuditLog replacements. Gameplay, Glicko-2,
per-mode ratings/ranks, matchmaking, rated protection, deterministic replay,
recovery policy, RBAC and business DTOs remain covered by the full existing suites.

Documentation adds this report and `observability.md`, links it from README and
updates production environment docs, both env examples and Compose. New variable:
`METRICS_ENABLED`; existing `LOG_LEVEL` gains explicit validation. Docker still
uses `/ready`; Render remains compatible with JSON stdout and operational probes.

## Verification results

All required checks passed on the completed source. Initial failures were corrected
and the affected full suites rerun; no failing test is reported as a skip.

| Command actually executed | Result |
| --- | --- |
| `npm install -w server prom-client@^15.1.3 pino@^9.14.0` | Runtime dependencies/lockfile updated |
| `npm run -w server prisma:generate` | Exit 0; client matches schema/version |
| `npm run -w server db:validate` | Exit 0; valid schema, local test URLs only |
| `npm run typecheck` | Exit 0; rules, server, web and smoke typechecks |
| `npm run lint` | Exit 0; 0 errors / 0 warnings |
| `npm run test:unit` | Exit 0; 13 suite executions; also rerun within regression |
| `npm run -w server test:observability` | Exit 0; 10 tests passed, 0 failed/skipped |
| `npm run test:integration` | Exit 0; 41 suite executions, including 2 new real PostgreSQL observability tests |
| `npm run test:ws` | Exit 0; 12 suite executions, including real PostgreSQL recovery and realtime lifecycle |
| `npm test` | Exit 0; 40 regression suite executions |
| `npm run build` | Exit 0; rules/server/web production builds and web typecheck |
| `npm run -w server openapi:validate` | Exit 0; schema consistency and valid OpenAPI |
| `npm run -w server test:openapi` | Exit 0; all 5 OpenAPI tests passed |
| `npm ls -w server pino prom-client` | Pino 9.14.0 deduplicated with Fastify; prom-client 15.1.3 |
| `docker compose --env-file .tmp/observability/compose.env -p fate-observability-smoke config --quiet` | Exit 0; valid production stack |
| Same Compose project: `up --build --detach` | Exit 0; migration job completed; server/PostgreSQL healthy |
| `python .tmp/observability/docker_smoke.py` | Final image: endpoint, real DB outage/restoration, JSON startup/shutdown and secret checks passed |
| `git diff --check` | Exit 0; no whitespace errors |

The existing Vite build emits its bundle-size advisory; build succeeds. Node's
existing MockTimers tests emit an experimental API notice. Neither is a lint
warning or an observability failure.

Integration/WS orchestration used a dedicated loopback PostgreSQL container on
port 5433 and separate run-owned schemas. The production Compose smoke used its
own project/network/volume and port 3310. No root `.env`, hosted database or
production endpoint was used. Docker Desktop was initially stopped and was
started to make the local checks possible.

| Final production Docker probe | HTTP result |
| --- | --- |
| Normal `/health`, `/ready`, `/metrics` | 200 / 200 / 200; expected metric families |
| PostgreSQL stopped: `/health`, `/ready` | 200 / 503; safe `{ok:false}` readiness |
| PostgreSQL restored: `/ready` | 200 without restarting the application |
| SIGTERM shutdown | Structured started/complete events; no test DB/JWT credentials in logs |

Only test-owned resources were removed: Compose project `fate-observability-smoke`
including its verified project-labelled volume, and the standalone
`fate-observability-postgres` container. Test orchestrators dropped their own
schemas. Detailed ignored logs and smoke JSON remain under `.tmp/observability/`;
latest layer reports are in `test-results/testing/`.


## Deliberate limits

- No SQL arguments, authoritative state or persisted payload diagnostics.
- Protected development REST debug action latency and malformed/rate-limited WS
  frames are outside the WS command histogram; normal production gameplay uses WS.
- No total transaction timer or instrumentation of externally injected DB clients.
- No optional HTTP latency or Node/process collectors in this phase.
- No metrics persistence, dashboard, browser analytics, scraper/server deployment,
  log collector, tracing platform or alert system. Future monitoring can consume
  these JSON logs and standard Prometheus series without changing domain logic.

The implementation uses the documented [Prisma v6 query extension](https://www.prisma.io/docs/orm/v6/prisma-client/client-extensions/query)
and [prom-client Registry API](https://github.com/siimon/prom-client#registry).

## Exact files added/changed

- [.env.example](../.env.example)
- [.env.production.example](../.env.production.example)
- [README.md](../README.md)
- [compose.yml](../compose.yml)
- [docs/observability-implementation-report.md](../docs/observability-implementation-report.md)
- [docs/observability.md](../docs/observability.md)
- [docs/production-environment.md](../docs/production-environment.md)
- [package-lock.json](../package-lock.json)
- [packages/rules/src/tests/heroes/boatInterruption.test.ts](../packages/rules/src/tests/heroes/boatInterruption.test.ts)
- [packages/rules/src/tests/heroes/sans.regression.test.ts](../packages/rules/src/tests/heroes/sans.regression.test.ts)
- [packages/server/package.json](../packages/server/package.json)
- [packages/server/src/auth/authMiddleware.ts](../packages/server/src/auth/authMiddleware.ts)
- [packages/server/src/auth/bearer.ts](../packages/server/src/auth/bearer.ts)
- [packages/server/src/config.ts](../packages/server/src/config.ts)
- [packages/server/src/db/client.ts](../packages/server/src/db/client.ts)
- [packages/server/src/db/readiness.ts](../packages/server/src/db/readiness.ts)
- [packages/server/src/fateLogger.ts](../packages/server/src/fateLogger.ts)
- [packages/server/src/index.ts](../packages/server/src/index.ts)
- [packages/server/src/observability/logger.ts](../packages/server/src/observability/logger.ts)
- [packages/server/src/observability/metrics.ts](../packages/server/src/observability/metrics.ts)
- [packages/server/src/observability/requestContext.ts](../packages/server/src/observability/requestContext.ts)
- [packages/server/src/persistence/matchActionQueue.ts](../packages/server/src/persistence/matchActionQueue.ts)
- [packages/server/src/persistence/matchLifecycle.ts](../packages/server/src/persistence/matchLifecycle.ts)
- [packages/server/src/pong/logger.ts](../packages/server/src/pong/logger.ts)
- [packages/server/src/pong/rooms.ts](../packages/server/src/pong/rooms.ts)
- [packages/server/src/routes.ts](../packages/server/src/routes.ts)
- [packages/server/src/routes/apiErrorHandler.ts](../packages/server/src/routes/apiErrorHandler.ts)
- [packages/server/src/routes/authRoutes.ts](../packages/server/src/routes/authRoutes.ts)
- [packages/server/src/routes/healthRoutes.ts](../packages/server/src/routes/healthRoutes.ts)
- [packages/server/src/routes/matchRoutes.ts](../packages/server/src/routes/matchRoutes.ts)
- [packages/server/src/routes/matchmakingRoutes.ts](../packages/server/src/routes/matchmakingRoutes.ts)
- [packages/server/src/routes/replayRoutes.ts](../packages/server/src/routes/replayRoutes.ts)
- [packages/server/src/services/matchRecoveryService.ts](../packages/server/src/services/matchRecoveryService.ts)
- [packages/server/src/services/matchService.ts](../packages/server/src/services/matchService.ts)
- [packages/server/src/services/playerStatisticsService.ts](../packages/server/src/services/playerStatisticsService.ts)
- [packages/server/src/services/ratingService.ts](../packages/server/src/services/ratingService.ts)
- [packages/server/src/services/replayService.ts](../packages/server/src/services/replayService.ts)
- [packages/server/src/store.ts](../packages/server/src/store.ts)
- [packages/server/src/tests/deployment.test.ts](../packages/server/src/tests/deployment.test.ts)
- [packages/server/src/tests/markerProjection.test.ts](../packages/server/src/tests/markerProjection.test.ts)
- [packages/server/src/tests/matchResult.test.ts](../packages/server/src/tests/matchResult.test.ts)
- [packages/server/src/tests/matchSnapshot.integration.test.ts](../packages/server/src/tests/matchSnapshot.integration.test.ts)
- [packages/server/src/tests/observability.integration.test.ts](../packages/server/src/tests/observability.integration.test.ts)
- [packages/server/src/tests/observability.test.ts](../packages/server/src/tests/observability.test.ts)
- [packages/server/src/tests/openapi.test.ts](../packages/server/src/tests/openapi.test.ts)
- [packages/server/src/tests/realtime.integration.test.ts](../packages/server/src/tests/realtime.integration.test.ts)
- [packages/server/src/ws.ts](../packages/server/src/ws.ts)
- [scripts/testLayers.mjs](../scripts/testLayers.mjs)
