# Phase 11 — Deterministic Replay Engine

Implemented on 2026-10-03. This report describes Phase 11 changes on top of the existing,
uncommitted Phase 10 snapshot work. That work was preserved. No production deployment or
production database operation was performed.

## Files added or changed

| File | Phase 11 change |
| --- | --- |
| `packages/server/src/services/replayService.ts` | New internal reconstruction and independent validation service; clean state/RNG/source DTO. |
| `packages/server/src/replay/initialState.ts` | Shared pure initial state creation and typed durable creation-input contract. |
| `packages/server/src/replay/actionSetup.ts` | Compact lobby setup capture/validation/restoration; pure bounded draft restoration. |
| `packages/server/src/replay/deserializeAction.ts` | Validated action boundary, payload/type/actor/setup-format checks. |
| `packages/server/src/replay/replayError.ts` | Controlled integrity/compatibility/storage error categories with safe metadata. |
| `packages/server/src/replay/stateRevision.ts` | Shared pure server-owned terminal revision stamping for live and replay execution. |
| `packages/server/src/tests/replayTestSupport.ts` | Real seeded rules fixture, complete draft, placement, movement and a naturally finished match. |
| `packages/server/src/tests/replay.test.ts` | Database-free reconstruction, corruption, RNG, mode/draft, concurrent and isolation checks. |
| `packages/server/src/tests/replay.integration.test.ts` | Guarded PostgreSQL reconstruction and actual READ ONLY transaction checks. |
| `packages/server/prisma/migrations/20261003000000_replay_initial_config/migration.sql` | New nullable creation-config JSONB column; no historical backfill. |
| `packages/server/prisma/schema.prisma` | `Match.initialConfig Json? @db.JsonB`. |
| `packages/server/src/store.ts` | Shared initial-state/revision helpers and synchronous lobby setup capture on accepted action entries. |
| `packages/server/src/persistence/acceptedAction.ts` | Durable readiness/mode commands; private `_replay` setup envelope. |
| `packages/server/src/persistence/matchLifecycle.ts` | Creation-input persistence and mode/draft journal boundary. |
| `packages/server/src/ws.ts` | Mode changes enter the existing durable queue; final draft pick rebuilds armies before checkpoint capture. |
| `packages/server/src/persistence/matchSnapshot.ts` | Export existing snapshot normalization for both serialization and replay equality. Snapshot v1 loader remains the authority. |
| `packages/server/src/repositories/matchActionRepository.ts` | Bounded ascending revision-range query. |
| `packages/server/src/services/matchService.ts` | Accept and check durable creation inputs during waiting-match creation. |
| `packages/server/src/tests/databaseFoundation.test.ts` | Update typed Match fixture for the nullable column. |
| `packages/server/src/tests/authenticatedMultiplayer.test.ts` | Expect durable readiness revisions; rejected commands/reconnect still append nothing. |
| `packages/server/src/tests/match.integration.test.ts` | Assert complete mode/readiness journal and unchanged counts on spectator rejection. |
| `packages/server/package.json` | Include replay in normal tests; focused replay and guarded DB scripts. |
| `README.md`, `packages/server/src/services/README.md` | Engine contract and updated journal/revision documentation. |
| `docs/phase11-implementation-report.md` | This implementation and verification report. |

Rules, frontend files, public routes, rating/statistics logic and prior migration files were not
changed by Phase 11. Existing Phase 10 RNG/checkpoint changes are not new Phase 11 work.

## Architecture and durable sources

ReplayService accepts small read capabilities: MatchRepository.findById,
MatchActionRepository.findInRevisionRange, and the read methods of MatchSnapshotService.
It has no Fastify, HTTP, WebSocket, GameRoom, socket/session or live-store dependency.
Rules and pure server domain helpers perform execution; all database access is through readers.

The service provides:

- `reconstructAtRevision(matchId, targetRevision)` for explicit FINISHED/IN_PROGRESS targets.
- `reconstructFinalState(matchId)` for FINISHED matches with a valid canonical finalRevision.
- `validateFinalDeterminism(matchId)` for a full independent run from revision zero.

The reconstruction DTO contains matchId, revision, state, rngState, base type/revision,
actionsApplied and an explicit verification category. No authoritative hidden state is exposed
through an HTTP endpoint.

Durable sources are Match (seed, initialConfig, current/final gameMode, status, finalRevision),
accepted MatchAction rows and validated MatchSnapshot v1 rows. Participant UUIDs stay outside
GameState; replay actor semantics use P1/P2. Participants are not needed to generate domain state.

## Exact initial inputs and persistence gaps

Creation needs seed plus original host seat, whether the host seat was occupied, arenaId and
gameMode. Match.gameMode can change before start, so the original configuration must survive
separately. The small typed initialConfig contains only:

`formatVersion: 1`, `rngAlgorithm: lcg32-numerical-recipes-v1`, original `gameMode`,
`hostSeat`, `hostOccupied`, `arenaId`.

The single nullable JSONB column is a compact creation contract, not a serialized GameState or
large miscellaneous configuration blob. Live room creation and replay both call
createInitialMatchState. It uses createEmptyGame, default armies and lobbyInit from rules,
matching the existing creation semantics (mode-specific army selection happens later).

Inspection found readiness and mode changes consumed runtime revisions without durable rows.
Those commands now enter the normal accepted-action queue, making new histories contiguous.
Joins, vacancy/readiness resets and figure selections can occur without revisions. Each accepted
lobby command therefore captures domain seats/readiness/host, mode, actual hero selections and
bounded accepted draft history in a private `_replay` v1 envelope. No tokens, sockets or User UUIDs
are included. Draft history has a strict size bound and is validated through pure draft rules;
consecutive journal commands must agree on its progression. A final pick captures its completed
armies before a snapshot is queued. Game rules and visible draft behavior are unchanged.

## Revision, snapshot and action contracts

Revision zero is the shared creation state before the first accepted command. Revision one is
state after accepted command one; every subsequent accepted journal command advances by one.
Creation-time lobbyInit does not consume a revision. Rejected commands and accepted no-ops
without a revision do not enter the journal. Server-owned terminal endedAtRevision uses the same
pure helper during live execution and replay.

Fast reconstruction selects the greatest snapshot revision <= target. Its state is cloned and
its RNG restored. If no suitable snapshot exists, replay requires validated creation inputs.
Only the following range is queried:

`matchId = requested match`, `revision > baseRevision`, `revision <= targetRevision`,
`ORDER BY revision ASC`.

An exact snapshot target needs no action query. Normal reconstruction uses a bounded number
of reads (match, nearest snapshot, action range and, if needed, final oracle); no per-action DB reads.
Missing, duplicated, out-of-range, unordered or invalid revisions fail rather than being skipped.
Targets are safe integers >= 0 and, for completed matches, <= canonical finalRevision.
Final reconstruction never guesses the maximum action revision.

Persisted JSON is parsed with the existing GameActionSchema plus strict server setup/draft
schemas. The stored actionType must match the discriminator, player must match actorSeat, and
unsupported `_replay` versions fail. Deep structural comparison rejects fields that validation
would silently erase. Ability payloads retain the existing extensible domain JSON contract.
There is no existing MatchAction formatVersion column, so no action migration framework was added.

Snapshot deserialization stays in the existing MatchSnapshotService/v1 loader. It validates the
database revision, payload shape and terminal endedAtRevision, preserves unit iteration order
through the ordered-unit format, and checks RNG algorithm/cursor. Unsupported or invalid snapshots
fail explicitly; there is no silent fallback to another historical format.

## RNG and read-only isolation

Replay re-executes accepted random intents through applyAction with a local SeededRNG. Persisted
events are history, not substitute random results. Initial replay seeds the unchanged uint32 LCG;
snapshot replay uses SeededRNG.fromState, including a valid zero continuation state. Rewinding to
Match.seed at a later checkpoint never occurs. Algorithm/version incompatibility is rejected.

Every call owns state, draft execution data and RNG. Loaded checkpoint objects are cloned before
rules run. There is no global replay cursor or cache. Concurrent replays cannot advance each
other's RNG or mutate another result. Replay never invokes live room action wrappers, queues,
result finalization, checkpoint capture/persistence, participant updates or broadcast functions.

Database tests compare Match+participants and action/snapshot/rating/ratingHistory counts before
and after replay. Independent final validation also runs inside an actual PostgreSQL transaction
with SET TRANSACTION READ ONLY, which would reject a hidden write.

## Independent determinism validation and equality

validateFinalDeterminism always starts at revision zero, executes every accepted action through
pure rules, then loads the exact finalRevision snapshot as the oracle. It never starts from the
final snapshot and compares that snapshot to itself. The real test match ends naturally after
629 accepted commands, with initiative, placement, random movement and combat.

State equality reuses normalizeSnapshotState from the checkpoint serializer: units become the
same ordered array, undefined object members are omitted, and presentation events become empty.
Node deep structural equality ignores JSONB object-key order while respecting meaningful arrays.
RNG equality separately compares algorithm and uint32 cursor, catching an invisible RNG mismatch.
Independent mismatch raises REPLAY_FINAL_STATE_MISMATCH or REPLAY_RNG_MISMATCH with identifiers
and revision metadata only, without hidden-state diffs or raw Prisma diagnostics.

Fast final loading reports checkpoint_loaded; that means reconstruction, not proof of determinism.
An independently executed segment reaching a final oracle reports checkpoint_matched. If no final
checkpoint exists, reconstruction can succeed but full validation reports deterministic: null and
no_final_checkpoint. There is no invented verification claim.

## Legacy behavior and controlled failures

Nullable old creation inputs are not inferred from defaults. A compatible historical checkpoint
plus the complete required following journal can reconstruct a segment. Missing creation inputs
prevent independent full validation, even when fast final checkpoint loading is possible.
Snapshot-less matches work with sufficient validated creation inputs and a complete accepted log.
Missing essential inputs/no usable log yield MATCH_NOT_REPLAYABLE; required revision gaps fail
with REPLAY_ACTION_GAP. WAITING/CANCELLED matches are deliberately excluded in this phase.

Other controlled categories include MATCH_NOT_FOUND, INVALID_TARGET_REVISION,
UNSUPPORTED_SNAPSHOT_VERSION, INVALID_SNAPSHOT, INVALID_ACTION_LOG,
REPLAY_DUPLICATE_REVISION, UNSUPPORTED_ACTION_FORMAT, RNG_RESTORE_FAILED and
REPLAY_STORAGE_UNAVAILABLE. Service calls reject safely without crashing the process or returning
a possibly wrong state. There are no full hidden-state production logs.

## Tests and verification actually performed

Focused tests cover revision zero, no snapshots, snapshots 20/40/60, targets 10/20/40/55/73/80,
exact final checkpoint loading, all three modes, complete draft history, live mode/readiness
journaling, a random-action checkpoint segment at 100..160, full independent final verification,
no final oracle, missing/gapped/duplicated/malformed histories, actor mismatch, unsupported setup
and snapshot versions, unknown hero inputs, invalid targets, legacy input absence, state/RNG
mismatches, controlled database errors, concurrency and conflicting live-room data.

All DB commands used guarded loopback PostgreSQL 16, a new disposable Docker container and
database `fate_phase11_test`. TEST_DATABASE_URL configured DATABASE_URL and DIRECT_URL for the
test commands. All seven migrations were applied to the initially empty test database. No deployed
migration was edited. The test fixtures remove their own durable rows.
The successful disposable container and the earlier unstarted fixed-port attempt were removed
after verification with `docker rm -f fate-phase11-db fate-phase11-postgres`; local logs remain.

| Command actually executed | Final result |
| --- | --- |
| `npm install` | Exit 0; no dependency or lockfile change retained. |
| `npm run -w server prisma:generate` | Exit 0; Prisma Client 6.19.0 generated, including build/test hooks. |
| `npm run -w server db:validate` | Exit 0; schema valid. |
| `npm run -w server db:migrate:deploy` | Exit 0; complete seven-migration chain applied locally. |
| `npm run -w server db:migrate:status` | Exit 0; local schema up to date. |
| `npx prisma migrate diff --from-url $env:DIRECT_URL --to-schema-datamodel packages/server/prisma/schema.prisma --exit-code` | Exit 0; no schema difference. |
| `npm run -w web typecheck` | Exit 0; no diagnostics. |
| `npm run lint` | Exit 0; **0 errors, 0 warnings**. |
| `npm run build` | Exit 0; rules/server/web typecheck/web build passed. Existing Vite large-chunk advisory remains. |
| `npm run -w server build` | Exit 0; final server and test sources compile. |
| `npm run test` | Exit 0; complete rules/boundaries/server/web auth/profile/matches/shell/figures chain passed. |
| `npm run -w server test` | Exit 0; server suite including replay passed after the shared revision-helper extraction. |
| `npm run -w server test:replay`, `npx tsx packages/server/src/tests/replay.test.ts` | Exit 0; focused replay suite passed. |
| `npm run -w server test:snapshots` | Exit 0; checkpoint regression suite passed. |
| `npx tsx packages/server/src/tests/modes.test.ts` | Exit 0; WebSocket mode/draft flows passed after final-pick checkpoint ordering change. |
| `npm run -w server test:replay:db` | Exit 0; guarded durable replay, READ ONLY and corruption tests passed. |
| `npm run -w server test:snapshots:db` | Exit 0; checkpoint PostgreSQL suite passed. |
| `npm run -w server test:actions:db` | Exit 0; action PostgreSQL suite passed. |
| `npm run -w server test:results:db` | Exit 0; result PostgreSQL suite passed. |
| `npm run -w server test:match:db` | Exit 0; lifecycle/HTTP/WebSocket PostgreSQL suite passed. |
| `npm run -w server test:history:db` | Exit 0; history/privacy PostgreSQL suite passed. |
| `npm run -w server test:db` | Exit 0; database foundation integration passed. |
| `git diff --check` | Exit 0; no whitespace errors under the workspace's configured CRLF normalization. |

The first full regression run exposed obsolete assertions that readiness/mode actions were absent.
Those assertions now check the new durable journal and unchanged counts after rejected commands;
the final suites pass. No game-rule defect or rule behavior change was needed.
Verification logs are in ignored `.tmp/phase11-*.log` files.

## Limits and deferred work

Production migration/deployment, production historical match validation and hosted Neon operations
were not performed. There is no migration/backfill for missing historical setup, no compatibility
framework for future rules changes, and no performance benchmark claim. Local migration/test
results do not claim validation of unavailable old production histories.

Replay API/access projection, Replay UI/timeline, Server Restart Recovery, replay/snapshot performance
research and caching remain deferred as requested. The internal service is available for those
future phases without introducing a live runtime dependency.
