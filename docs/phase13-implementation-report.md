# Phase 13 — Player Statistics Backend

Implemented public `GET /api/users/:id/statistics` as an on-demand derived view of finished
participant results. The endpoint returns overall counts, averages, streaks and mode groups.
Historical hero/loadout statistics are omitted because the lightweight persisted result model
does not preserve participant selections. No frontend Statistics UI or rating behavior was added.

## Repository inspection and durable sources

Inspection preceded implementation and covered Prisma User/Profile/Match/MatchParticipant,
MatchAction/MatchSnapshot, lifecycle/result persistence, history services/routes, current Figure Set
storage, room selection application, replay setup capture and guarded database tests.

- MatchParticipant has an immutable post-start competitor identity, a nullable canonical outcome,
  display-name snapshot and nullable resultData. Unique `(matchId, seat)` and `(matchId, userId)`
  constraints prevent duplicate competitors. `userId` is indexed.
- Match stores status, raw gameMode, persisted nullable durationMs/turnCount and completion date.
  Finalization atomically writes the finished match and both participant outcomes. Cancelled waiting
  rooms have a finish date but do not constitute competitive results.
- Match History directly uses the requested participant's outcome, including legacy nulls. Statistics
  use that same field; no winner-field fallback or different relative-result inference was introduced.
- Draws actually exist: `extractPersistentMatchResult` recognizes simultaneous king defeats under
  `chess_party`, persists both DRAW outcomes and `chessMutualKingDefeat`.
- Turn counts are meaningful battle turns including the terminal turn. Result extraction uses
  `gameOver.endedAtTurn`, or `state.turnNumber` for mutual king defeat. Missing legacy stamps stay null.
  Rules increment turnNumber in turn actions and reset it when battle starts. Revision/action count
  measures commands rather than turns and is not queried by statistics.
- Test rooms have `matchId: null`; MatchLifecycle only creates durable Matches for normal rooms and
  bypasses persistence for test rooms. The schema contains no persisted debug/test marker to filter.
- Current Figure Sets are client-local seven-class selections (`web/src/figures/storage.ts`) sent into
  runtime rooms. `ws.ts` stores these in `room.figureSets` and applies them to standard-mode armies;
  draft mode has its own selection flow. They are not a historical analytics source.
- ResultData v1 whitelists only version, remainingUnits and remainingHealth. It does not preserve
  hero IDs, heroes defeated, or the roster used at start. Match initialConfig describes creation
  configuration, not final participant selections. Private snapshots and accepted-action replaySetup
  contain historical armies, but selection/coverage validation through replay infrastructure is
  deliberately deferred. No replay/action/snapshot JSON is loaded by statistics.

## Files added and changed

Added:

| File | Responsibility |
| --- | --- |
| `packages/server/src/repositories/statisticsRepository.ts` | ID-only User lookup and ordered lightweight finished-participant read |
| `packages/server/src/services/playerStatisticsService.ts` | User existence, eligibility diagnostics and statistics orchestration |
| `packages/server/src/statistics/playerStatistics.ts` | Stable DTO types and pure eligibility/summary/streak/mode helpers |
| `packages/server/src/routes/statisticsRoutes.ts` | Public UUID-validated endpoint and sanitized API errors |
| `packages/server/src/tests/playerStatistics.test.ts` | Arithmetic, service and HTTP contract tests |
| `packages/server/src/tests/playerStatistics.integration.test.ts` | Guarded real PostgreSQL/API/query tests |
| `docs/phase13-implementation-report.md` | Inspection findings, decisions and verification results |

Changed:

- `packages/server/src/index.ts`: register statistics routes and allow service injection for tests.
- `packages/server/package.json`: focused statistics scripts and inclusion in the regular server suite.
- `packages/server/src/services/README.md`: document the service boundary.
- `README.md`: document endpoint contract, metric semantics, unavailable dimensions and verification;
  update references that previously deferred the entire statistics backend.

Prisma schema, migrations, Match History, result/replay implementations, gameplay, rules and frontend
source were not changed. npm install produced no dependency/lockfile content change.

## Architecture and queries

```text
GET /api/users/:id/statistics
  -> statisticsRoutes
  -> PlayerStatisticsService.getPlayerStatistics(userId)
  -> StatisticsRepository
  -> Prisma / PostgreSQL
  -> pure summary, streak and mode helpers
  -> PlayerStatisticsDTO
```

Only repositories access Prisma. The route validates UUIDs, sets no-store and applies existing
AuthError/API database-error mapping. The service verifies User existence before loading history,
filters incomplete records with a safe diagnostic and delegates arithmetic to pure helpers.

The repository first selects User.id alone. Its history read starts from MatchParticipant.userId
and filters related Match.status to FINISHED. The projection contains only outcome and Match
id/gameMode/finishedAt/durationMs/turnCount. It orders by Match.finishedAt ascending, then matchId
ascending (equal to Match.id). Null completion dates sort last and are excluded by the service.

There are two repository operations; current Prisma executes three SQL SELECTs: User existence,
participants with the parent filter/order, and one batched Match relation projection. SQL query
logging in the integration suite confirmed exactly three SELECTs for both 11 and 100 eligible games.
There are no queries per match/mode/hero. Private JSON/state and profile/authentication columns are
absent from selected data. PostgreSQL has the existing participant user index, Match primary key,
participant unique keys and Match status/createdAt index. No new index is justified for this scoped
read at current scale. SQL aggregation would duplicate a history read already required for streaks,
so all metrics use the same small projected dataset and consistent eligibility rules.

Computation uses O(n) projected history and arithmetic plus sorting the small set of mode groups.
There is no pagination of streak history, materialized statistics table, generic BaseRepository,
cache, worker, cron, Redis or second source of truth. This is a diploma-scale approach, not a claim
of a production load benchmark for unbounded player histories.

## Eligibility and legacy behavior

An eligible game is a MatchParticipant belonging to the requested User with:

1. related Match.status FINISHED;
2. participant outcome WIN, LOSS or DRAW;
3. a valid persisted completion date;
4. a nonempty raw gameMode ID.

WAITING, IN_PROGRESS and CANCELLED matches do not count even if manually seeded outcomes/durations
exist. Creator-only and spectator appearances do not count. User-less guest/deleted-identity rows
cannot join the requested User. Duplicate participation is prevented by database uniqueness.
Test/debug rooms never enter this durable pipeline; the integration suite exercises their lifecycle
and confirms that no Match is created and aggregates remain unchanged.

Finished rows with null outcomes, missing dates or empty modes are excluded from every competitive
aggregate. The service logs `statistics:invalid_history`, requested userId and excludedMatches,
without raw result data or private diagnostics. These exclusions do not create or interrupt streaks
in eligible history. History continues to expose its existing nullable legacy records without
fabricating a result or completion date. Unknown nonempty historical mode IDs retain their own
group. Schema gameMode is non-null, so there is no invented null-mode bucket.

## DTO, formulas and access policy

`PlayerStatisticsDTO` has exactly `userId`, `overall` and `byGameMode` at the top level.
Overall contains:

| Field | Semantics |
| --- | --- |
| gamesPlayed | Eligible participant rows; equals wins + losses + draws |
| wins / losses / draws | Counts of persisted participant-relative outcomes |
| winRate | Numeric wins / gamesPlayed in [0, 1], or 0 without games; draw denominator included |
| averageDurationMs | Mean of known nonnegative integer persisted durations, including real zero; null without samples |
| durationSampleSize | Number of durations used in the mean |
| averageTurns | Mean of known positive integer turnCount values, rounded to two decimals; null without samples |
| turnCountSampleSize | Number of turn counts used in the mean |
| currentStreak | `{ type: WIN / LOSS / DRAW / null, count }`, ending at the latest eligible game |
| longestWinStreak | Maximum consecutive WIN sequence in eligible completion chronology |
| longestLossStreak | Maximum consecutive LOSS sequence in eligible completion chronology |

Missing/negative/otherwise invalid numeric samples are excluded from their own mean, without
excluding a valid result from counts/streaks. Duration retains its numeric millisecond precision;
winRate retains the numeric ratio rather than a localized percentage string. Current consecutive
draws form DRAW streaks and break both win and loss sequences. No games yields null current type,
zero streak lengths, zero counts/rate, null averages and an empty mode list.

Each mode entry contains raw gameMode and all summary fields (counts, rate, averages and sample
sizes). Mode groups sort by descending gamesPlayed, then ascending raw mode ID. Group games sum
to overall games. Streaks are provided at overall level.

The endpoint is public, consistent with public profiles/history, and returns only aggregates.
It does not query/expose email, passwords, auth sessions, tokens, preferences, IPs, names, raw
resultData, hidden state, actions or snapshots. Cache-Control is no-store. Invalid UUID returns
400 INVALID_REQUEST; valid unknown UUID returns 404 USER_NOT_FOUND. Existing users without games
receive the valid zero DTO. Existing API error handling returns sanitized 500 INTERNAL_ERROR or
503 DATABASE_UNAVAILABLE; underlying diagnostics remain absent from responses.

## Hero and Figure Set decision

`byHero` and `byFigureSet` are omitted; neither is supported by this phase. There is no authoritative,
cheap participant result projection proving the historical roster or actual per-hero usage.
The presence of seven-class armies also means a single primary hero cannot be guessed.
Replay JSON/checkpoints are durable but require a different selection/coverage interpretation path;
the basic statistics endpoint does not decode or replay them. Current saved selections never
substitute for old selections. Arbitrary heroId properties manually inserted into resultData are
ignored. No hero/loadout historical source is claimed, no current-set backfill occurs, and no
forward-looking snapshot migration was necessary for the implemented metrics.

## Schema and migration safety

No schema/index change or new migration. All seven existing migrations were applied from an empty
database in the disposable `fate-phase13-postgres` Docker container (PostgreSQL 16-alpine) on
loopback port 53493, database `fate_phase13_test`. TEST_DATABASE_URL configured DATABASE_URL and
DIRECT_URL for DB commands; the existing guard refuses production mode, hosted hosts including
Neon, and databases/schemas without a test name segment. Migration status reported up to date.
Integration suites cleaned up their fixture rows; the disposable container/anonymous volume were
removed after verification. No production Neon migration, reset, database write or deployment
was performed.

## Tests added

The unit/service/API suite verifies zero counts/null means, 3/5 win rate, draw denominator,
nullable samples (1000/null/3000 -> 2000 and 10/null/20 -> 15), genuine zero duration,
invalid numeric values, two-decimal turn means, no/single/alternating games, WIN x4/LOSS x3
longest streaks, draw interruption/current draw streaks, per-mode metrics and stable group order,
invalid legacy rows, diagnostic counts, no history read for nonexistent users, public HTTP access,
UUID validation, no-store, zero/missing users, privacy and sanitized errors.

The PostgreSQL suite uses real stored participants/results and the registered server endpoint.
It checks participant-relative results, statuses with misleading seeded outcomes, creator-only and
zero-game users, missing legacy outcomes/dates, reverse insertion versus completion chronology,
deterministic tied completion dates, missing/invalid duration and turn samples, DRAW streaks,
mode totals/order/averages, finalRevision independence, test-room non-persistence, profile changes
and arbitrary hero JSON independence, safe projection SQL and exactly three SELECTs for 11/100 games.
Hero/loadout history tests are not applicable because those dimensions are not exposed.

## Commands executed and final results

Logs are in `.tmp/phase13-*.log`. Commands ran from the repository root; DB commands used the
guarded local test connection described above.

| Command | Final result |
| --- | --- |
| `npm install` | Exit 0; audited 635 packages, no dependency change |
| `npm run -w server prisma:generate` | Exit 0; Prisma Client 6.19.0 generated |
| `npm run -w server db:validate` | Exit 0; schema valid with local DB environment configured |
| `npm run -w server db:migrate:deploy` | Exit 0; all seven existing migrations applied to empty local test DB |
| `npm run -w server db:migrate:status` | Exit 0; database schema up to date |
| `npm run -w server test:statistics` | Exit 0; new arithmetic/service/API suite passed |
| `npm run -w server test:statistics:db` | Exit 0; new PostgreSQL suite passed, 3 SELECTs for 11/100 games |
| `npm run -w web typecheck` | Exit 0; TypeScript check passed |
| `npm run lint` | Exit 0; **0 errors, 0 warnings** |
| `npm run build` | Exit 0; rules/server/web compilation and web typecheck passed |
| `npm run -w server build` | Exit 0; final TypeScript compile after the test fixture lint correction |
| `npm run test` | Exit 0; complete configured workspace test chain passed |
| `npm run -w server test:history:db` | Exit 0; existing PostgreSQL history/privacy suite passed |
| `npm run -w server test:results:db` | Exit 0; existing PostgreSQL atomic results/rollback/races/conflicts/HTTP/retry suite passed |
| `npm run -w server test:replay:db` | Exit 0; existing real-history replay, RNG, read-only, independent validation and corruption suite passed |
| `npm run -w server test:replay-api:db` | Exit 0; existing replay HTTP/timeline/checkpoint/read-only suite passed |
| `git diff --check` | Exit 0; no whitespace errors |

The configured npm test chain passed rules tests and module boundaries, every configured server
suite (including statistics, gameplay/WebSocket/test-room/mode coverage), Replay API, and frontend
auth **31/31**, profile **11/11**, matches **15/15**, shell/lobby **9/9**, figures **9/9**, replay **9/9**.
All node:test summaries report zero failures. Standalone assertion-based suites report passed.

During iteration, the initial environment-only schema validation lacked DIRECT_URL and was repeated
successfully with both guarded local URLs. An integration assertion incorrectly expected undefined
for the existing null test-room matchId; it was corrected. An inner test fixture function triggered
one lint error and was converted to a block-local arrow function; final lint is clean. A PostgreSQL
regression pre-hook encountered a Windows Prisma DLL rename lock while another test process held
the engine; after the main suite finished, regression commands ran serially and all passed.

Build emitted the existing Vite CommonJS API deprecation, stale Browserslist data notice and
large-chunk advisory. These are build advisories, not ESLint warnings or build failures.
npm install reported 37 dependency audit findings (2 low, 3 moderate, 31 high, 1 critical);
dependency upgrades were outside this backend statistics change.

## Verification limits and deferred work

No production deployment/database operations, browser end-to-end run, hosted database performance
benchmark or production-history audit was performed. The checks establish behavior on the current
code and isolated fixtures, not completeness of any external legacy history. The three-SELECT check
is architectural/query-count validation rather than a latency benchmark.

Deliberately deferred: Player Statistics UI/charts, historical hero/roster analytics storage and
interpretation, Glicko-2 Rating/MMR/rank, Leaderboard/global ranking, achievements, matchmaking,
restart recovery and background/materialized analytics. No placeholders were added for them.
