# Backend observability

FATE runs without a monitoring platform. Pino writes JSON to stdout (fatal errors
before logger construction use the same JSON shape on stderr), and the server
provides liveness, readiness and Prometheus text metrics. No telemetry is sent
over the network or written to PostgreSQL. AuditLog remains durable administrative
accountability; MatchAction remains authoritative replay history.

## Logs and correlation

Production and development both use JSON. `LOG_LEVEL` accepts `fatal`, `error`,
`warn`, `info` (default), `debug`, `trace`, `silent`. CLI/test console output is
independent. Services with no injected logger use the same Pino factory.

Use `requestId`, `userId`, `matchId`, `roomId`, `connectionId`,
`commandCorrelationId`, `command`, `revision`, `durationMs`, `errorCode`.
The legacy game adapters retain their established `tag` events; lifecycle events
retain the existing `match:*` event names. Gameplay event metadata is DEBUG;
connections, startup, shutdown and committed match transitions are INFO. Expected
illegal actions are DEBUG; readiness transitions to unavailable are WARN;
unexpected reconstruction, persistence, HTTP or process failures are ERROR/FATAL.

HTTP accepts `X-Request-Id` only when it matches `[a-zA-Z0-9._-]{1,64}`;
otherwise it generates a server UUID. Every response returns `X-Request-Id`.
Fastify children bind `requestId` once. Authentication adds an internal `userId`,
including successful register/login and protected identity routes. Match routes
bind `matchId`; lifecycle and recovery logs include durable match and runtime room
identifiers. One HTTP completion event records normalized route, method, status and
duration after authentication. It excludes operational probes and metrics. Raw
request URLs, bodies and headers are never access-log fields.

Each WS transport has a server-generated connection identifier. Each parsed
command receives a new `commandCorrelationId`; completion/error events include
the authenticated user, room, match, revision and safe result metadata. Join/leave and command
events share the same transport `connectionId`, stable across room/role changes.
The existing internal seat ownership `connId` remains separate runtime state. Clients' command
request IDs and resume credentials are not trusted as operational correlation.

Example (synthetic identifiers):

```json
{"level":20,"event":"game_command_complete","requestId":"example-http","connectionId":"example-connection","commandCorrelationId":"example-command","userId":"example-user","matchId":"example-match","roomId":"example-room","command":"endTurn","revision":38,"result":"success","durationMs":4.7}
```

The logger recursively removes password/passwordHash, authorization, cookies and
Set-Cookie (case-insensitive), access/refresh/token/resume/debug credentials,
seat/reclaim secrets, seat token collections, JWT keys and DB URLs from structured
objects and child bindings. Pino path redaction adds a second layer. Request and
response serializers expose only method/status. State, GameState, snapshot, body
and action payload fields are removed. Game event adapters allow only compact
metadata; hidden units, choices, rolls, names and event payloads are omitted.

Exceptions retain bounded stack frames and allowlisted type/code. Arbitrary error
messages, causes and Prisma metadata are intentionally omitted because they may
contain SQL arguments, credentials or URLs. Client 500 responses remain canonical
and contain no stack. Do not put credentials in free-form log messages: redaction
protects structured fields, not arbitrary prose. Deployment platforms own stdout
retention; the application does not rotate files or create log tables.

## Operational endpoints

| Endpoint | Meaning | Success | Unavailable |
| --- | --- | --- | --- |
| `/health`, `/api/health` | Process answers HTTP; no DB or room work | 200 `{"ok":true}` | Independent of DB/recovery |
| `/ready` | Startup and recovery complete, not draining, PostgreSQL answers `SELECT 1` | 200 `{"ok":true}` | 503 `{"ok":false}` |
| `/metrics` | Read-only in-process measurements | 200 Prometheus text, version 0.0.4 | 404 when disabled |

The existing `{ok:boolean}` health contract and OpenAPI schemas are preserved.
Operational 503 responses deliberately use this small response instead of a
business API error envelope. `/metrics` is excluded from OpenAPI JSON contracts.
Readiness and metrics send `Cache-Control: no-store`.

The readiness deadline is **2 seconds**. Concurrent/repeated probes share an
outstanding native query until it settles; the HTTP timeout cannot cancel Prisma.
This prevents probe-driven accumulation during outages. Probes perform only a
read and never create actions, snapshots or audit events. Once a transient failed
query settles, later probes retry and readiness recovers without restart.

The production entrypoint listens while startup recovery runs. During recovery,
liveness and metrics answer, readiness is 503 and normal traffic is rejected with
the existing safe `DATABASE_UNAVAILABLE` response. Isolated unrecoverable matches
are interrupted by the existing coordinator and do not prevent readiness; global
storage/coordinator failures abort startup. The embedding `buildServer` factory
awaits recovery by default for existing callers/tests; `serveDuringRecovery:true`
enables production behavior and `waitForStartup()` observes its result.

SIGINT/SIGTERM set readiness false before close/drain. `preClose` also covers
programmatic close. New normal traffic is gated; command, persistence and
finalization drains retain existing bounds. Fatal uncaught errors/rejections log
structurally and terminate after bounded best-effort close.

## Metrics

`prom-client` uses a dedicated registry, without its global registry or default
process collectors. The production process registry is shared by bootstrap,
Prisma, lifecycle, replay and recovery; tests can inject a separate registry.

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `fate_active_rooms` | Gauge | none | Published runtime GameRooms, including ended rooms retained until cleanup |
| `fate_active_websocket_connections` | Gauge | none | Accepted open sockets, including spectators, unauthenticated clients and sockets without a room |
| `fate_matches_created_total` | Counter | none | Persistent rooms published after successful creation/binding |
| `fate_matches_started_total` | Counter | none | Successful persistent start projection |
| `fate_matches_finished_total` | Counter | none | Successful result/rating finalization observed by runtime lifecycle |
| `fate_matches_cancelled_total` | Counter | none | Successful waiting-room cancellation |
| `fate_matches_interrupted_total` | Counter | none | Successful expiration/recovery interruption |
| `fate_game_command_duration_seconds` | Histogram | `command`, `result` | Parsed WS message through server decision; includes socket/room queue delay |
| `fate_replay_reconstruction_duration_seconds` | Histogram | `source`, `result` | Full service reconstruction including match, snapshot and action reads |
| `fate_db_operation_duration_seconds` | Histogram | `operation`, `result` | Prisma call duration or readiness HTTP deadline |
| `fate_db_errors_total` | Counter | `operation`, `category` | Unexpected failed instrumented calls/probes; P2002 unique conflicts excluded |
| `fate_match_recovery_total` | Counter | `result` | Per-candidate startup recovery outcomes |
| `fate_match_recovery_duration_seconds` | Histogram | `result` | Candidate recovery including loading and terminal finalization |
| `fate_startup_recovery_duration_seconds` | Histogram | `result` | Coordinator work, including rating repair |

Finite label values:

- Command names come directly from canonical protocol/action schemas; other values
  normalize to `UNKNOWN`. Results: `success`, `rejected`, `error`.
- Replay sources: `initial_state`, `snapshot_tail`, `unknown`; results:
  `success`, `error`. Errors use `unknown` because reconstruction may fail before
  determining the usable base. Determinism verification uses `initial_state`.
- DB operations: `query`, `readiness_probe`; results: `success`, `error`;
  categories: `timeout`, `connection`, `constraint`, `transaction`, `unknown`.
- Recovery candidate results: `recovered`, `finalized`, `skipped`, `unrecoverable`,
  `error`; coordinator results: `success`, `error`.

**Never add userId, matchId, roomId, connectionId, requestId, revision, email, IP,
raw URL, SQL, payload or exception message as a metric label.** IDs belong in logs.
Lifecycle counters have no mode labels so malformed historical metadata cannot
create series. Transition ownership uses weak references to runtime objects;
retries/repeated terminal recovery do not inflate finish counters or retain an
unbounded history of IDs. Room gauges read registry size rather than arithmetic
increments; socket tracking uses a set with idempotent removal on close/error.

Command timing starts when parsing succeeds, before waiting on the per-socket
chain, and ends after processing/response/broadcast decisions. It covers all
schema-valid WS commands, including join/draft/setup, and expected rejections.
Malformed JSON/payload/rate-limited frames are rejected before this timer.
It excludes client network, browser rendering and asynchronous action persistence
which the existing gameplay pipeline intentionally enqueues. It includes any
synchronous persistence required by start/seat changes.

DB instrumentation uses Prisma's public `$allOperations` query extension and
forwards original arguments and query unchanged. It covers model/raw calls
through the application's singleton client, including calls inside interactive
and batched transactions. It measures Prisma operations (nested writes are one
operation), **not** full transaction wall time, connection setup, commit errors
outside individual calls, or separately constructed/injected clients. Readiness
has its own deadline observation; its underlying singleton query also appears as
`query` when it settles. These are different boundaries, not a SQL query count.
P2002 conflicts still record error latency but do not inflate the DB failure
counter. Other constraints remain failures because they require attention.

Fast command/DB buckets in seconds: `.001,.005,.01,.025,.05,.1,.25,.5,1,2,5`.
Replay/recovery buckets: `.01,.05,.1,.25,.5,1,2,5,10,30`. Histograms expose normal
`_bucket`, `_sum`, `_count` series. Counters and gauges live in process and reset
on restart; they are not all-time database/admin totals. An external scraper can
retain historical time series.

## Deployment and verification

`METRICS_ENABLED` accepts exactly `true` or `false`, default `true`, including
Compose. Restrict `/metrics` at the reverse proxy/network layer for public
deployments, or disable it; it intentionally has no OAuth scheme. Docker health
checks still use `/ready` as deployment availability. Platforms that distinguish
liveness from readiness should use `/health` for process restart decisions and
`/ready` for traffic routing. Render's existing availability probe remains
compatible with `/ready`; logs are JSON on its normal stdout stream.

```sh
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
curl http://127.0.0.1:3000/metrics
docker compose logs -f server
npm run -w server test:observability
npm run test:integration
npm run test:ws
```

Use only an isolated local test database for outage tests. Tests exercise
sentinel secrets, hidden state, HTTP correlation, timeouts/recovery/shutdown,
actual sockets, room/recovery ownership, lifecycle idempotency, cardinality,
reconstruction success/error, Prisma query/transaction rollback and safe DB
unavailability. Pure rules, ratings and deterministic replay helpers do not import
logging/metrics. No Prisma migration or frontend monitoring change is needed.

Future deployments may attach Prometheus/Grafana and log collectors without
changing these boundaries. Process metrics, HTTP latency histograms, distributed
tracing, dashboards and alert infrastructure are deliberately deferred.
