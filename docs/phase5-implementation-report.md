# Phase 5 — Persistent Match Model + Room Integration

Implemented on 2026-10-02. Normal REST/WebSocket rooms now have durable PostgreSQL
match metadata. Authoritative GameState, RNG, runtime actions and sockets remain in RAM.

## Files

Added:

- `packages/server/prisma/migrations/20261002030000_persistent_match_lifecycle/migration.sql`
- `packages/server/src/services/matchService.ts`
- `packages/server/src/persistence/matchLifecycle.ts`
- `packages/server/src/tests/matchLifecycle.test.ts`
- `packages/server/src/tests/match.integration.test.ts`
- `packages/server/src/tests/matchTestSupport.ts`
- `docs/phase5-implementation-report.md`

Changed:

- Prisma schema: nullable `Match.winnerSeat: MatchSeat?`. Existing room/seat unique keys
  and nullable User relations were reused. Prior migrations were not edited.
- `repositories/matchRepository.ts`: room lookup, waiting creation, participant upsert,
  game-mode projection and conditional start/finish/cancel writes. Participants remain
  owned by the Match aggregate rather than a new generic CRUD repository.
- `store.ts`: `matchId: string | null`, private room staging/publication and a cleanup
  metadata callback. Store constructors and `applyGameAction` remain synchronous.
- `roomQueue.ts`: expose busy room IDs to cleanup; release queue entries correctly
  on success/failure and avoid unhandled rejected `finally` promises.
- `index.ts`, `routes.ts`, `ws.ts`: construct/inject the lifecycle coordinator and use
  it in every production creation path and accepted start/end path.
- `db/client.ts`, `services/README.md`, `README.md`: clarify database requirements and
  the runtime/persistence boundary; document the Persistent Match Lifecycle.
- `packages/server/package.json`: include runtime/failure tests; add `test:match:db`.
- Existing `auth.test.ts`, `ws.smoke.ts`, `hardening.test.ts`, `modes.test.ts`,
  `testRoom.test.ts`, `testRoom.ws.test.ts`: inject explicit fake match persistence
  for database-free regression tests. Existing assertions were retained.
- `databaseFoundation.test.ts`: add the nullable field to its typed Match fixture.

No frontend or rules source files changed.

## Architecture and policy

`routes / WebSocket -> MatchLifecycle -> MatchService -> MatchRepository -> Prisma`.
GameRoom stores only the Match ID; `/rooms` still reads runtime rooms. There are no
database reads/writes for ordinary movement, attacks, abilities, pending-roll
resolution or turns. The ending action writes only durable finish metadata.

Normal room creation stages an invisible runtime room, creates/reuses one WAITING
Match by unique `roomId`, then binds and publishes the room. Test/Sandbox rooms keep
`matchId = null` and write no Match/participant/lifecycle rows. Gameplay auth is
optional; current production creation/join paths provide no verified User context,
so creator, participant and winner User IDs remain null. Client `userId` is ignored.

| Transition | Authoritative trigger and durable behavior |
| --- | --- |
| WAITING -> IN_PROGRESS | Accepted `startGame` requests initiative. This precedes the GameState phase change out of lobby. A draft begins persistence only when its completed picks successfully start gameplay. The start transaction stores mode/timestamp and freezes current competitors. |
| IN_PROGRESS -> FINISHED | An accepted action changes state to `ended`. Persist original finish timestamp, reliable `gameOver.winnerPlayerId`/reason, nullable winner User, and revision after the ending action. |
| WAITING -> CANCELLED | Permanent removal of an unstarted lobby room: TTL/capacity cleanup or explicit internal removal. Also applies when the creator disconnects while Match creation is pending. Cancellation records a terminal timestamp. |
| Removal during an active match | Preserve IN_PROGRESS without inventing a finish/result. Temporary disconnects, leaves and reconnect grace do not cancel matches. |
| Repeated lifecycle calls | Preserve original start/finish/cancel timestamps. Repeated identical results are safe. Conflicting final results and invalid transitions are rejected. |

P1/P2 snapshots upsert by `(matchId, seat)` during WAITING. Lobby departures retain
temporary occupancy until replacement or the start transaction. A resumed seat with
no new name preserves its previous snapshot. Start atomically writes final occupants;
afterward competitors/names remain immutable, including reconnect and seat replacement.
Spectators are runtime-only. Names use joined names or seat fallback and fit the
existing varchar(100). User deletion retains participant rows with `userId = null`.

Creation failure returns HTTP 503 or the existing WebSocket error envelope with
`MATCH_PERSISTENCE_UNAVAILABLE`; no usable unbound room is published. Participant,
start, finish and cancellation failures log safe identifiers and preserve runtime.
Original metadata is retried every five seconds from a small process-local projection,
with start before finish. Ordinary actions do not run reconciliation queries.

Per-room command queues serialize runtime changes, participant updates, lifecycle
writes and retries. Cleanup protects connected/busy rooms. PostgreSQL unique keys
and conditional writes protect durable concurrency. Short parent-row transactions
serialize participant replacement against start/cancel. Empty-update Prisma upserts
can race; creation now explicitly handles P2002 by retrieving the existing room Match.

## Verification actually executed

PostgreSQL 16 was provisioned in a separate disposable Docker container, on local
port 55435, with database `fate_phase5_test`. `DATABASE_URL`/`TEST_DATABASE_URL` for
database checks pointed only at that database. No unknown development/production
database was migrated or reset. All four committed migrations applied successfully,
including `20261002030000_persistent_match_lifecycle`.

| Command | Result |
| --- | --- |
| `npm install` | Exit 0. Dependency audit reported 26 existing vulnerabilities; no dependency upgrade was performed. |
| `npm run -w server prisma:generate` | Exit 0, generated Prisma Client 6.19.0. |
| `npm run -w server db:validate` | Exit 0, schema valid. |
| `npm run -w server db:migrate:deploy` | Exit 0, all four migrations applied to the isolated test database. |
| `npm run build` | Exit 0: rules/server TypeScript, frontend typecheck and Vite build. Vite retained its large-chunk/CJS/Browserslist warnings. |
| `npm run test` | Exit 0: rules and boundary checks, every existing server runner plus new runtime/failure tests, frontend auth (25/25) and profile (11/11). |
| `npm run -w server test:db` | Exit 0, foundation PostgreSQL integration passed. |
| `npm run -w server test:auth:db` | Exit 0, auth PostgreSQL integration passed. |
| `npm run -w server test:profile:db` | Exit 0, profile PostgreSQL integration passed. |
| `npm run -w server test:match:db` | Final exit 0; real service/repository/HTTP/WebSocket integration passed. |
| `npx tsx packages/server/src/tests/match.integration.test.ts` | Two additional consecutive final runs passed, exercising concurrent creation after the race fix. |
| `npx tsc -p packages/server/tsconfig.json --noEmit` | Exit 0 on final source. |
| Targeted ESLint over new modules and touched store/repository/queue/server setup | Exit 0. |
| `npm run lint` and final direct ESLint JSON verification | Exit 1: 3086 errors, 14 warnings. An isolated extraction of HEAD produced exactly the same diagnostics, compared by file/rule/message; **zero new lint diagnostics**. |
| `git diff --check` | Exit 0. |

During implementation, concurrent DB testing exposed a real P2002 upsert race; it was
fixed and rechecked. One repeated DB invocation overlapped the existing rules build's
dist cleanup and failed with MODULE_NOT_FOUND; final repeated DB runs were performed
after the full test/build process completed. An attempted npm formatter-argument
invocation also failed; final JSON lint comparison used the ESLint binary directly.

New coverage includes invisible staging, creation failure, failed participant/start/
finish writes and reconciliation, no database work on ordinary roll actions, ordered
start/finish recovery, immutable start snapshots, TTL policies, busy-room protection,
queue release after failures, missing-DB HTTP errors and creator disconnect during
pending creation. Real PostgreSQL coverage checks room/seat unique constraints,
concurrent duplicates, nullable identities and SetNull behavior, idempotent lifecycle
timestamps/results, invalid/conflicting transitions and absent action/snapshot rows.

Automated real HTTP/WebSocket flows verified `/rooms` and `/api/games` creation,
runtime discovery, concurrent P1/P2 joins, spectator join, resume token/reconnect
without duplicate participant IDs, mode selection, rejected start, ready/start,
pending roll, deterministic authoritative end, participant retention after leave,
WebSocket creation, sandbox isolation and waiting/active cleanup. The end scenario
used a controlled runtime fixture followed by an accepted normal action, rather than
playing an entire match through the UI.

Manual browser flows were not performed: no callable browser/Node REPL control tool
was available in this session. No visual/full-match manual verification is claimed.
The temporary PostgreSQL container was removed after verification.

## Limitations and deferred work

Pending retries live only in process memory and are lost on process exit. Shutdown
logs outstanding projections; restart recovery and administrative reconciliation
remain future work. The migration still needs deployment to the user's configured
database before creating normal rooms there. Global lint retains its existing debt.

Authenticated P1/P2 identity, persistent MatchAction writes, MatchSnapshot writes,
replay/restart recovery, match history/API/UI, statistics, ratings and leaderboards
remain deliberately deferred. No Redis, outbox, message queue or placeholder systems
were introduced.
