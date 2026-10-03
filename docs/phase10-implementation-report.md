# Phase 10 — Match Snapshots

Implemented private durable GameState checkpoints for normal persistent FATE rooms.
GameRoom remains authoritative; ordinary gameplay never loads a checkpoint. Rules and
applyAction remain synchronous and database-free. No frontend, public snapshot endpoint,
replay reconstruction, replay API/UI, restart recovery or performance harness was added.

Prisma schema and migrations are unchanged. The existing MatchSnapshot model already has
id, matchId, revision, JSONB state, nullable JSONB rngState, formatVersion and createdAt,
with unique `(matchId, revision)` and a cascading Match foreign key. That index supports
exact and ordered latest/at-before queries without another index. Migration name: none.
The existing six-migration chain was deployed only to an empty disposable local test DB;
schema diff found no drift. Production Neon migrations/deployment were not performed.

## Files

| Added file | Purpose |
| --- | --- |
| `packages/server/src/persistence/matchSnapshot.ts` | Canonical version, typed v1/loaded DTOs, JSON copy/freeze, serialization/deserialization/errors. |
| `packages/server/src/persistence/snapshotStateV1.ts` | Explicit server-only Zod contract for GameState, unit fields, pending resolution and rule state. |
| `packages/server/src/repositories/matchSnapshotRepository.ts` | Idempotent insert/conflict verification and indexed exact/latest/at-before reads. |
| `packages/server/src/services/matchSnapshotService.ts` | Revision triggers, capture, persistence and validated typed loading. |
| `packages/server/src/tests/matchSnapshot.test.ts` | Database-free serialization, RNG, loading, conflicts, queues and lifecycle regressions. |
| `packages/server/src/tests/matchSnapshot.integration.test.ts` | Guarded local PostgreSQL concurrency, JSONB order, loading, terminal and failure tests. |
| `docs/phase10-implementation-report.md` | This implementation and verification report. |

| Changed file | Purpose |
| --- | --- |
| `packages/rules/src/rng.ts` | SeededRNG.exportState/fromState and the plain continuation type; existing sequence unchanged. |
| `packages/server/src/config.ts` | Typed, validated optional interval configuration and startup validation. |
| `packages/server/src/persistence/matchActionQueue.ts` | Snapshot writes share the tracked ordered chain, retry policy, failure barrier and drain. |
| `packages/server/src/persistence/matchLifecycle.ts` | Immediate accepted-revision/final capture; shared snapshot service and result barrier. |
| `packages/server/src/services/matchService.ts` | Injected/lazy snapshot persistence delegation and MatchPersistence contract. |
| `packages/server/src/repositories/index.ts` | Repository export. |
| `packages/server/src/tests/matchTestSupport.ts` | Explicit in-memory snapshot fake, including idempotency/conflicts/failures. |
| `packages/server/src/tests/matchLifecycle.test.ts` | Snapshot method in the injected persistence binding. |
| `packages/server/src/tests/matchResult.test.ts` | Snapshot method in the injected persistence binding. |
| `packages/server/src/tests/matchResult.integration.test.ts` | Binding and final-revision checkpoint assertions for P1/P2 victories and real chess draw. |
| `packages/server/src/tests/matchAction.integration.test.ts` | Final checkpoint/journal/result consistency assertions. |
| `packages/server/src/tests/match.integration.test.ts` | Final checkpoint and public DTO privacy assertions through authenticated HTTP/WebSocket gameplay. |
| `packages/server/package.json` | Snapshot assertions in ordinary tests; focused unit and guarded DB scripts. |
| `packages/server/src/services/README.md` | Persistence service boundaries. |
| `.env.example` | Safe optional MATCH_SNAPSHOT_INTERVAL=20 default and zero semantics. |
| `README.md` | Format, revision, RNG, ordering, configuration, privacy and loading contract; roadmap status. |

## Format, revisions and persistence

The single canonical constant is `MATCH_SNAPSHOT_FORMAT_VERSION = 1`. Columns carry
matchId/revision/formatVersion; there is no duplicate version or revision inside state JSON.
V1 state contains GameState domain fields, with two explicit representation choices:

- `units` is an ordered UnitState array, reconstructed as `Record<string, UnitState>` on load.
  Current rules use Object.values/entries(units); PostgreSQL JSONB object keys do not preserve
  their original iteration order. Array storage preserves that order without duplicate metadata.
- `events` is empty. It is presentation history, never authoritative continuation input;
  historical actions/events belong to MatchAction rather than another complete log.

Other fields retain their domain JSON representation, including hidden knowledge/positions,
markers, unit statuses/resources, rule declaration data, pending moves/rolls/combat and queues.
Room envelopes, sockets, identities, connection tokens, profiles and runtime debug controls
are excluded. The checkpoint contract covers rules GameState and RNG; it does not restore
rooms or the separate runtime draft-session envelope in this phase.

Snapshot N is the state **after accepted authoritative revision N**, aligning with its
MatchAction row and the terminal Match.finalRevision. Revisions are not action row counts.
Existing lobby readiness/init and room metadata can produce journal gaps; only journaled
accepted commands trigger checkpoints. Accepted draft commands share the journal path.
Rejected commands and accepted no-ops without a revision schedule no checkpoint.

Capture is synchronous before asynchronous persistence can run. A recursive plain-JSON
copy detaches every nested value, then the payload is recursively frozen. Optional undefined
object properties explicitly mean absence. Undefined/holey array items, non-finite numbers,
Map/Set/Date/BigInt, functions, custom prototypes and cycles fail instead of being silently
coerced/dropped. A mismatch between the action revision and current room revision fails capture.
Credentials/connection fields are also rejected inside extensible domain contexts.

No canonical full runtime GameState validator existed. V1 therefore has an explicit Zod
contract, reusing domain roll/rule enums and checked against all GameState/UnitState typed
keys. Loading validates the version, PostgreSQL-range revision, complete typed structure,
duplicate unit IDs, terminal revision consistency and RNG data. Extensible roll contexts and
rule data also pass recursive JSON validation. It never casts raw Prisma state to GameState.
Unsupported versions raise `UNSUPPORTED_SNAPSHOT_VERSION`; corrupt payloads raise
`MATCH_SNAPSHOT_INVALID`. The version switch is prepared for explicit later formats without
adding a migration framework now.

Normal rooms already use SeededRNG's Numerical Recipes uint32 LCG. V1 rngState is required
for new normal captures, even though the reused DB column is nullable:
`{ algorithm: "lcg32-numerical-recipes-v1", state: <uint32> }`. This is the exact internal
continuation value rather than the initial seed. Export/restore preserves subsequent values
including state=0, without changing constructor seed normalization or the RNG algorithm.
DebugDiceRNG/test dice queues are not persisted.

`MATCH_SNAPSHOT_INTERVAL` defaults to 20 and is parsed into typed configuration per lifecycle,
outside gameplay handlers. Nonnegative integer values within PostgreSQL's revision range are
accepted; negatives, decimals, NaN, infinity, invalid strings and empty values fail. Zero disables
periodic captures only. Trigger: accepted journaled revision N divisible by the positive interval,
or any accepted terminal revision. Twenty is an operational default, not a measured optimum.
It is an optional non-secret Render override; no new required production secret was added.

The existing tracked per-match chain persists action N, then snapshot N, then later writes.
Capture/validation costs run immediately; DB latency does not block ordinary interval gameplay.
Terminal capture uses the same path once, so finishing on an interval has no extra capture.
The result barrier waits for the chain: successful normal lifecycle FINISHED publication has
a checkpoint at finalRevision, including off-interval and interval=0 endings. Snapshot failure
does not revert ended gameplay. It blocks later writes/result publication under the existing
journal integrity policy. Transient Prisma errors have up to three attempts with bounded
backoff; permanent conflicts/errors do not retry indefinitely. Logs contain identifiers,
operation/revision/version/error codes and never snapshot payloads or database error details.

Repository create retries equivalent duplicates as success after unique-insert conflict and
targeted structural equality verification. Object property insertion order does not change
equivalence; array order remains meaningful. State/RNG/version disagreement raises
`MATCH_SNAPSHOT_CONFLICT`. Existing content, generated ID and createdAt stay canonical.

Internal loading methods are `loadSnapshot(matchId, revision)`, `loadLatestSnapshot(matchId)`
and `loadLatestSnapshotAtOrBefore(matchId, revision)`. Latest queries use database revision
DESC and one row rather than fetching/sorting history. Results contain typed GameState/RNG,
matchId/revision/version/createdAt. Missing snapshots return null, including legacy matches;
there is no automatic backfill. Public details/history/action history and spectators receive
no snapshot data. Test/debug rooms remain runtime-only.

Cleanup retains queued checkpoints; graceful shutdown drains the shared match chain and
terminal completions before database disconnect. Existing bounded drain behavior is preserved:
a stalled/unavailable DB can produce a logged drain timeout. Pending process-local queues
are not crash durable, and restart recovery remains a separate phase.

## Verification actually executed

All DB checks used PostgreSQL 16 in a newly created disposable loopback Docker container,
database `fate_phase10_test`. The existing TEST_DATABASE_URL guard configured both URLs and
rejected remote/production targets. No production environment files or credentials were used.

| Command | Final result |
| --- | --- |
| `npm install` | Exit 0; dependencies/lockfile unchanged. |
| `npm run -w server prisma:generate` (also through build/test hooks) | Exit 0; Prisma Client 6.19.0 generated. |
| `npm run -w server db:validate` | Exit 0; schema valid. |
| `npm run -w server db:migrate:deploy` | Exit 0; all six existing migrations applied to the empty local test DB. |
| `npm run -w server db:migrate:status` | Exit 0; schema up to date. |
| `npx prisma migrate diff --from-url $env:DIRECT_URL --to-schema-datamodel packages/server/prisma/schema.prisma --exit-code` | Exit 0; no difference detected. |
| `npm run -w web typecheck` | Exit 0; no diagnostics. |
| `npm run lint` | Exit 0; **0 errors, 0 warnings** on the final code. |
| `npm run build` | Exit 0; rules/server/web and web typecheck passed. |
| `npm run -w server build` | Exit 0; final server/test-source build after ordered-unit format change. |
| `npm run test` | Exit 0; full rules/boundary/server/web auth/profile/matches/shell/figures chain passed. |
| `npm run -w server test` | Exit 0; complete server regression rerun after the final format change. |
| `npm run -w server test:snapshots` / `npx tsx packages/server/src/tests/matchSnapshot.test.ts` | Exit 0; all snapshot assertions passed on final code. |
| `npm run -w server test:snapshots:db` / `npx tsx packages/server/src/tests/matchSnapshot.integration.test.ts` | Exit 0; PostgreSQL snapshot assertions passed, including final JSONB order preservation. |
| `npx tsx packages/server/src/tests/matchAction.integration.test.ts` | Exit 0; rerun on final format passed. |
| `npx tsx packages/server/src/tests/matchResult.integration.test.ts` | Exit 0; rerun on final format passed, including chess draw. |
| `npx tsx packages/server/src/tests/match.integration.test.ts` | Exit 0; rerun on final format passed, including public privacy and authenticated WebSocket lifecycle. |
| `npx tsx packages/server/src/tests/matchHistory.integration.test.ts` | Exit 0. |
| `npx tsx packages/server/src/tests/database.integration.test.ts` | Exit 0. |
| `npx tsx packages/server/src/tests/auth.integration.test.ts` | Exit 0. |
| `npx tsx packages/server/src/tests/profile.integration.test.ts` | Exit 0. |
| `git diff --check` | Exit 0; no whitespace errors. |

Focused tests cover representative battle/pending states and rule data, serialization round trip,
RNG continuation and zero state, exact interval boundaries, rejection, final revisions 73/80,
interval=0, duplicate callbacks, nested live mutation during stalled DB writes, frozen capture,
JSONB unit order, malformed/unsupported records, absence, SQL query ordering, equivalent and
contradictory concurrent inserts, action-before-snapshot SQL checks, bounded transient retries,
permanent failures, terminal result consistency, cleanup/shutdown and nonpersistent test rooms.
The real PostgreSQL failure trigger confirms the terminal action is durable, runtime stays ended,
the checkpoint is absent and Match remains IN_PROGRESS rather than publishing an incomplete result.
Snapshot suites use assertion scripts, so no invented aggregate test count is reported.

Initial verification failures were corrected: older DB suites required zero snapshots, test-only
typing/lint assertions needed adjustment, and one parallel rules rebuild briefly removed dist
modules during a DB test launch. Sequential reruns passed. Final server test output is retained
in the ignored `.tmp/phase10-server-test.log`.

Build output still has existing Vite CJS/Browserslist/chunk-size advisories, and tests have the
existing Node MockTimers experimental warning; these are separate from clean ESLint results.
Installation reported 37 dependency audit findings (2 low, 3 moderate, 31 high, 1 critical);
dependency upgrades were outside this phase. Live Render/Neon deployment, full browser smoke,
crash recovery, replay execution and snapshot performance were not verified or implemented.
Deferred work: Deterministic Replay Engine, Replay API/UI, Server Restart Recovery and
snapshot performance research.
