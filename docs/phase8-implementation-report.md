# Phase 8 — Persistent Action Log

Implemented in the existing workspace on 2026-10-02.

## Files

Added:

- `packages/server/src/persistence/acceptedAction.ts`
- `packages/server/src/persistence/matchActionQueue.ts`
- `packages/server/src/repositories/matchActionRepository.ts`
- `packages/server/src/services/matchActionService.ts`
- `packages/server/src/tests/matchAction.test.ts`
- `packages/server/src/tests/matchAction.integration.test.ts`
- This report.

Changed:

- Runtime integration: `persistence/matchLifecycle.ts`, `ws.ts`, `roomQueue.ts`, `index.ts`.
- Persistence/API: `services/matchService.ts`, `routes/matchRoutes.ts`, `repositories/index.ts`.
- Tests: `matchTestSupport.ts`, `matchLifecycle.test.ts`, `matchResult.test.ts`,
  `match.integration.test.ts`, `matchResult.integration.test.ts`, `authenticatedMultiplayer.test.ts`.
- `packages/server/package.json` and `README.md`.

All server source paths above are relative to `packages/server/src`.

## Schema, stored shape and revision

No Prisma schema changes or new migration. Existing `MatchAction` fields, JSONB columns,
relations and unique `(matchId, revision)` constraint already meet the requirements.
All six existing migrations were deployed to a fresh, isolated PostgreSQL 16 database.

Stored shape: `matchId`, `revision`, `actorUserId`, `actorSeat`, `actionType`,
`actionPayload`, `events`, `createdAt`. Prisma supplies the row UUID. `createdAt` comes
from the server acceptance timestamp of the runtime log entry, not from the client.

Rules apply synchronously first. A state/event-producing accepted action then increments
`room.revision`, updates memory and appends an `ActionLogEntry` at that new revision.
That post-action revision is copied to PostgreSQL. Revisions can have gaps: metadata
changes and readiness increment runtime revision without producing durable gameplay rows.
An accepted readiness no-op has no revision or runtime entry. Accepted draft start/ban/pick
commands now append a runtime entry and increment revision once through their separate
rules acceptance flow. The terminal journal row equals the captured `Match.finalRevision`;
subsequent room metadata changes do not alter the result's revision.

## Identity and sanitization

`actorSeat` comes from the server's accepted player context. `actorUserId` comes from
`room.seatIdentities[actorSeat].userId`, established by verified account authentication.
Client `userId`, connection IDs and tokens are never used as account identity. Account-less
legacy/internal contexts retain null rather than inventing a User. Normal WebSocket player
seats require verified accounts. A roll action's `player` is normalized to the runtime actor.

`toPersistedAction` reparses the domain action through the existing action schema, stripping
extra envelope fields. Extensible ability JSON is recursively normalized and strips named
credentials, cookies, authorization, account/connection IDs and transport metadata.
Draft commands use an explicit field mapping. Non-finite numbers, non-JSON values,
class instances and excessive nesting fail mapping visibly; accepted memory is preserved.

`toPersistedEvents` stores authoritative domain events, including roll results and hidden
information useful for future verification. It excludes `combatVisualBatchReady` and visual
sequencing metadata. Credentials and transport fields are also stripped recursively.
RNG seed/state, socket objects and raw WebSocket envelopes are not added to journal rows.

## Queue, retries, conflicts and finalization

`MatchLifecycle` immediately schedules normalized accepted records on `MatchActionQueue`.
Each match has an independent promise chain. Revision N finishes before N+1 is written;
another match can progress independently. Ordinary gameplay awaits neither action writes
nor action-history reads. The rules engine remains synchronous and database-free.

Each match permits 10,000 pending writes. Pending counts, active chains and failures are
tracked. Drained chains are removed; failure state is released on permanent room removal,
after remaining tracked work settles. Room deletion does not discard queued work.

Recognized Prisma connection/timeout/transaction errors receive up to three attempts,
with 50/100 ms backoff. Permanent integrity errors do not retry. On exhausted/permanent
failure, mapping error or overflow, safe context is logged (match, room, revision, type,
seat), subsequent writes for that match stop, and result publication is blocked. Memory
state is never rolled back. There is no automatic repair after such a blocked journal;
unpersisted records remain process-local and require operational attention.

The repository attempts a small insert without a large transaction. On unique conflict it
loads the canonical row and compares actor, type, JSON payload and events. Equivalent
duplicates succeed; informational timestamp differences are ignored. Contradictions raise
`MATCH_ACTION_CONFLICT`. Existing rows are never updated or overwritten.

Terminal action persistence is queued before result publication. A tracked completion waits
for its match's journal, then finalizes through the existing room command serialization.
Every lifecycle finalization path also checks the journal barrier. The accepted terminal
command returns while that work proceeds. An incomplete journal cannot publish `FINISHED`.

SIGINT/SIGTERM invoke Fastify close. Lifecycle retry scheduling stops; pending commands,
action chains and finalizations drain before Prisma disconnect. Command, action and
finalization drain stages each have a five-second bound and log timeouts. Underlying
in-flight SQL cannot be cancelled by the promise timeout; timed-out writes remain tracked
until the database operation settles. No process crash/restart recovery is implemented.

## Runtime and durable journals

`GameRoom.actionLog` remains a bounded runtime/debug journal under `MAX_LOG_EVENTS`.
PostgreSQL keeps the full accepted gameplay history independently of runtime truncation.
Lobby joins/readiness/mode changes, rejected actions and spectators do not generate durable
gameplay rows. Accepted draft choices do. Test/Sandbox rooms and rooms without `matchId`
never append durable actions. Old completed matches are not backfilled.

## Endpoint and hidden-data policy

`GET /api/matches/:id/actions?limit=100&revisionAfter=0` requires a valid Bearer access
token and existing account. Finished matches are readable by authenticated users through
the same player-neutral projection; the endpoint is not restricted to participants.

- Unknown match: `404 MATCH_NOT_FOUND`.
- Non-FINISHED status, including CANCELLED: `409 MATCH_NOT_FINISHED`.
- Malformed UUID or pagination: `400 INVALID_REQUEST`.
- Missing/invalid authentication: `401`.
- Persistence unavailable: `503 MATCH_PERSISTENCE_UNAVAILABLE`.

`limit` accepts 1–500; `revisionAfter` is an exclusive nonnegative revision cursor.
The response is `{ matchId, actions, nextRevisionAfter }`. Rows are ordered by revision
ascending, with one extra row used to detect the next page. Each action DTO contains
`revision`, `actor: { seat, userId, displayName }`, `type`, `payload`, `events`, and ISO
`createdAt`. Names are historical participant snapshots. Empty historical logs return
an empty page; the endpoint sends `Cache-Control: no-store`.

Payload is deliberately redacted to `{ type }`. Only selected turn/round/battle-start/end
event fields are returned. Without historical state, hidden unit IDs/positions, targets,
ability choices and private rolls cannot be safely projected; they stay server-side.
The API never returns raw Prisma rows, canonical event JSON, row UUIDs, email, credentials,
connection metadata, RNG state or hidden game state. Storage remains unchanged by projection.

## Tests and executed verification

New database-free tests cover sanitization, unsupported JSON, independent match queues,
ordered writes, queue bounds/timeouts, transient retry/exhaustion, permanent errors,
equivalent duplicates, conflicts, normalized roll actor, runtime truncation, sandbox
exclusion, accepted state while writes are blocked, terminal result barriers, failure
preserving memory, authenticated API, pagination, status errors and safe DTOs.

New PostgreSQL tests cover concurrent duplicate/conflicting inserts, canonical preservation,
ordering independent of timestamps, pagination, accepted rolls, rejected pending commands,
failed abilities and illegal moves, terminal/result revision agreement, an actual SQL trigger
failure blocking finalization, shutdown drain and absence of snapshots.

Existing authenticated multiplayer and PostgreSQL HTTP/WebSocket tests now verify trusted
actor identity, spectator rejection, reconnect without duplicate action rows, token omission,
completed-only history and final journal revision. Persistent result tests retain their
transaction rollback, conflict, draw and retry assertions.

Executed commands and results:

| Command | Result |
| --- | --- |
| `npm install` | PASS; no dependency changes. npm reported 26 audit findings. |
| `npm run -w server prisma:generate` | PASS, Prisma Client 6.19.0. |
| `npm run -w server db:validate` | PASS. |
| `npm run -w server db:migrate:deploy` | PASS, six existing migrations on isolated PostgreSQL. |
| `npm run -w web typecheck` | PASS. |
| `npx tsc -p packages/server/tsconfig.json --noEmit` | PASS. |
| `npm run lint` | PASS, 0 errors / 0 warnings. |
| `npm run build` | PASS; Vite reports its existing large-chunk warning. |
| `npm run -w server build` | PASS. |
| `npm run test` | PASS: rules/boundaries, server, web auth and profile suites. |
| `npm run -w server test` | PASS after runtime integration updates. |
| `npx tsx packages/server/src/tests/matchAction.test.ts` | PASS. |
| `npm run -w server test:db` | PASS. |
| `npm run -w server test:auth:db` | PASS. |
| `npm run -w server test:profile:db` | PASS. |
| `npm run -w server test:match:db` | PASS. |
| `npm run -w server test:results:db` | PASS. |
| `npm run -w server test:actions:db` | PASS, including final shutdown integration. |
| `git diff --check` | PASS. |

An initial typecheck found a fake repository's `Promise`/`PrismaPromise` mismatch, which was
fixed by declaring the repository read boundary as `Promise<MatchAction[]>`. One repeated
profile DB run collided with a concurrent build cleaning `rules/dist`; the remaining DB
suites were rerun sequentially after the build and passed. No failure was suppressed.

Database verification used the disposable owned container `fate-phase8-test`, database
`fate_phase8_test`, port 55438. Production/development application databases were not used.
Tests clean their owned fixtures and triggers; the owned container was removed after verification.
Detailed command output is in ignored
`.codex-dev-logs/phase8-*.log` files.

## Actual flows and limits

Automated integration performed real HTTP authentication, normal match creation/join,
readiness/start, a pending roll, reconnect, terminal action, result persistence and safe
history retrieval against PostgreSQL. Terminal victory/draw states were prepared with
controlled fixtures rather than playing an entire match naturally. Queue latency behavior
was verified using controlled unresolved promises; no benchmark claim is made.

No manual browser UI session, natural full-match playthrough, external deployment,
OS-level signal smoke test or forced process-crash test was performed. Shutdown behavior
was tested through the lifecycle/Fastify close integration and controlled pending writes.

Deferred deliberately: Match History UI, Match Snapshots, Replay/reconstruction/UI,
Restart Recovery, Statistics/aggregation, Rating/Glicko-2 and leaderboards. No placeholders
or infrastructure for those phases were introduced.
