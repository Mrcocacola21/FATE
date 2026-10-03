# Phase 15 — Glicko-2 Rating System

Implemented on 2026-10-03. Rating effects come from persisted eligible match results. Both players
use the same pre-match states; both current ratings, both histories and the processing marker commit
together. Existing/current room creation remains casual. No frontend, leaderboard or matchmaking changes.

## 1. Files added and changed

Added:

- `packages/server/prisma/migrations/20261003010000_glicko2_rating/migration.sql`
- `packages/server/src/rating/glicko2.ts`
- `packages/server/src/rating/types.ts`
- `packages/server/src/rating/constants.ts`
- `packages/server/src/rating/eligibility.ts`
- `packages/server/src/rating/ratingError.ts`
- `packages/server/src/rating/historySchema.ts`
- `packages/server/src/repositories/ratingRepository.ts`
- `packages/server/src/services/ratingService.ts`
- `packages/server/src/routes/ratingRoutes.ts`
- `packages/server/src/tests/rating.test.ts`
- `packages/server/src/tests/rating.integration.test.ts`
- `docs/phase15-implementation-report.md`

Changed:

- `README.md` — rating semantics, API, verification and current roadmap references.
- `packages/server/package.json` — rating test scripts and inclusion in the normal test suite.
- `packages/server/prisma/schema.prisma` — match eligibility/marker and additional audit metadata.
- `packages/server/src/index.ts` — lazy public rating routes and injectable read service.
- `packages/server/src/persistence/matchLifecycle.ts` — safe rating domain errors and bounded retry handling.
- `packages/server/src/repositories/index.ts` — rating repository export.
- `packages/server/src/repositories/matchRepository.ts` — rating repository using the same database client.
- `packages/server/src/repositories/userRepository.ts` — centralized registration rating defaults.
- `packages/server/src/services/matchService.ts` — server-only rated creation, post-commit rating processing.
- `packages/server/src/services/README.md` — application/repository responsibilities and recovery contract.
- `packages/server/src/tests/databaseFoundation.test.ts` — new Match fields in the typed fixture.
- `packages/server/src/tests/replayTestSupport.ts` — new Match fields in the typed replay fixture.

No runtime dependency was added; package-lock content did not change.

## 2. Existing models and additions

The repository already had `Rating`, the dedicated PlayerRating equivalent, and `RatingHistory`.
They were reused; no duplicate PlayerRating entity or profile rating preference was introduced.

`Rating` remains: userId UUID primary key, rating/RD/volatility Float, ratedGames Int, createdAt/updatedAt.
Its User relation cascades on deletion, and its descending rating index is retained.

`Match` adds `isRated Boolean @default(false)` and nullable `ratingProcessedAt Timestamptz(3)`.
`RatingHistory` adds nullable opponentUserId UUID, result MatchOutcome and ratedGameNumber Int.
Existing before/after rating, RD, volatility and createdAt are retained. Legacy history additions stay
nullable; every newly processed rated game supplies all three. A User opponent inverse relation is added.

## 3. Migration

`20261003010000_glicko2_rating` is a new incremental migration. Previous migrations were not edited.
All existing matches default to unrated. It adds the fields above, a pending-match index, opponent foreign
key/index, unique player/period index and a positive period-number check. No historical backfill runs.

## 4. Pure algorithm architecture

`rating/glicko2.ts` imports only rating types/constants. It has no Prisma, Fastify, WebSocket, HTTP,
Match or lifecycle dependency. `calculateRating(state, results, options)` is pure and validates all
input/output numbers. `RatingService` owns orchestration; `RatingRepository` and `RatingTransaction`
perform database access. There is no third-party algorithm package and no frontend calculation.

## 5–7. Defaults, configuration and volatility iteration

Initial rating/RD/volatility are **1500 / 350 / 0.06**, with ratedGames zero. Constants are canonical
and frozen. Registration uses those constants; schema defaults preserve the same values.
Tau defaults to **0.5**, epsilon to **0.000001**, and the defensive iteration limit to **100**.
Trusted server code may pass options as RatingService's third constructor argument; no route accepts them.

The algorithm converts rating/RD to mu/phi using `173.7178`, applies the official revised bracketed
Illinois volatility iteration, updates uncertainty/rating, then converts back. Both bracket search and
root iteration are bounded. Stable expectation/variance calculations avoid subtractive cancellation;
non-finite computation, nonpositive RD/volatility or invalid score/options throws `Glicko2Error`.
No arbitrary rating or uncertainty clamps exist. Database state is never rounded before the next game.

## 8. Reference calculation

The [official specification](https://glicko.net/glicko/glicko2.pdf) supplies the 1500/RD200/sigma0.06
example against 1400/30 (win), 1550/100 (loss), 1700/300 (loss), tau 0.5.
Actual full-precision output is:

```text
rating          1464.0506705393013
ratingDeviation 151.51652412385727
volatility      0.059995984286488495
```

Published values use rounded intermediate arithmetic and report approximately 1464.06, 151.52,
0.05999. The unit test uses corresponding tolerances 0.02, 0.005 and 0.00001, plus tighter
full-precision regression assertions. It does not assert raw floating-point bit equality.

## 9–10. Eligibility and Casual/Rated compatibility

`eligibleRatingPlayers` is the canonical application predicate. It requires explicit isRated,
FINISHED, supported standard/classic/draft mode, a valid finishedAt and finalRevision, and exactly
two distinct registered P1/P2 user IDs. Guest/missing/same-user participants cannot affect rating.
User foreign keys and transactional row locks verify durable registered identities.
WIN/LOSS must agree with winner/loser seats and user IDs. Existing chessMutualKingDefeat supports
real DRAW/DRAW with null winner/loser fields. Invalid competitive results raise a controlled error.

Normal rooms alone create persisted Match records; Heartbreak/test rooms never enter persistence.
Unknown/test/debug/sandbox game modes and debug finish reasons also cannot earn rating. Unit tests
exercise malformed self-play, and the existing DB unique match/user constraint rejects it at insertion.
All current routes omit isRated, so existing/current games remain casual. Trusted MatchService callers
may designate a new waiting match as rated; idempotent creation verifies that the designation agrees.
There is no full Casual/Rated UX, retroactive opt-in/backfill or client-controlled rating endpoint.

## 11–12. Current state and history

Existing registration still atomically creates Rating, Profile, User and initial AuthSession.
Older users with missing Rating read synthesized defaults without a write. A rated transaction
uses a native upsert after locking both User rows; missing-row initialization is safe under concurrency.

New RatingHistory records include user, match, opponent, result, before/after rating/RD/volatility,
processing date and ratedGameNumber. Existing unique **(userId, matchId)** already enforces the requested
one user/history per match invariant irrespective of column order. New unique **(userId, ratedGameNumber)**
records per-player serialization order, including tied millisecond timestamps. Rating delta is derived
for DTOs, not stored. No history update operation is exposed. Existing owner deletion Restrict and
Match deletion SetNull remain; opponent deletion also SetNull preserves audit data.

## 13–14. Transaction and pre-match snapshots

MatchService's canonical completion transaction commits first, after the existing action/snapshot
barrier. Rating processing then performs one Serializable transaction:

1. Lock/load Match and validate eligibility, processing marker and existing history.
2. Lock both User rows in sorted UUID order and obtain both current rating snapshots.
3. Calculate P1_after from P1_before/P2_before and P2_after from P2_before/P1_before.
4. Persist both rating states and increment both ratedGames once.
5. Insert both histories with the same processing date and each player's next period number.
6. Set Match.ratingProcessedAt and commit everything together.

Both calculations finish before either after-state is written. Any failure, including the final marker
write, rolls back both rating updates, both histories and all initialization. Full double precision is retained.
The integration suite compares both first-game outputs with independently invoked pre-state calculations.

## 15–18. Idempotency and concurrency

The durable match marker, unique match/user history, match lock and Serializable transaction guarantee
exactly-once effect. Duplicate calls return `outcome: alreadyProcessed, alreadyProcessed: true`.
A processed marker with missing/wrong participant histories, or histories without a marker, raises
RATING_INCONSISTENT_HISTORY rather than applying another update or swallowing a unique error.

Independent Prisma clients/pools are used in the race tests. Eight duplicate deliveries produce one
processed result, seven alreadyProcessed results, two histories and one increment per participant.
Different simultaneous games sharing an established player and simultaneous first games sharing a
missing Rating row preserve both updates. Per-player period numbers persist actual serialization order;
they do not claim finish-time ordering. Sorted User locks avoid opposite-seat deadlocks, and Serializable
isolation rejects stale reads/writes across processes. There is no application-only correctness mutex.

Expected Prisma P2034 conflicts, and P2010 raw-query errors carrying only PostgreSQL SQLSTATE 40001
or 40P01, retry at most five attempts with 25/50/75/100 ms delays. Genuine integrity errors, invalid matches
and algorithm errors are not retried by RatingService. Retry/exhaustion logs contain safe IDs/codes/counts.

## 19. Crash and retry behavior

If the server fails between result commit and rating commit, Match remains FINISHED with marker null.
The existing bounded lifecycle completion retry/drain retries rating while the process is alive.
After restart, `RatingService.processRatedMatch(matchId)` safely uses persisted canonical results;
retrying matching finalization also retries rating. Delayed recovery appends a period from the current
rating; it does not rewrite previously committed history. The pending index enables future recovery
tooling. No automatic startup scan, full worker, admin UI or repair HTTP endpoint is added.

## 20–21. Public read APIs

- `GET /api/users/:id/rating` returns userId, rating, ratingDeviation, volatility and ratedGames.
- `GET /api/users/:id/rating/history?page=1&limit=20` returns safe history items and pagination.

History items contain id, nullable match/opponent IDs (deletion/legacy), result, period number,
before/after state, derived ratingDelta and ISO processing date. Newest periods sort first, with stable
createdAt/id fallbacks for legacy rows. Defaults are page 1/limit 20; limit cap is 100. Count and items
share RepeatableRead. UUID/query validation returns 400; nonexistent users return 404; internal/DB
errors are sanitized. Both endpoints use no-store and follow existing public statistics/profile policy.
No email, password, token, session, match state or internal transaction ID is returned.
Statistics, match details, replay and all rating GET operations remain read-only.

## 22. Tests

`rating.test.ts` covers the official example, win/loss/draw, high-vs-low uncertainty, alternate volatility
bracket, mathematical empty period, immutability, invalid numbers/options/scores, convergence failure,
eligibility, real draw mapping, retry limits and exact retryable SQLSTATE selection, API contracts,
pagination validation, privacy and absence of writable rating routes.

`rating.integration.test.ts` covers first-game initialization, identical pre-states, sequential/concurrent
duplicates, different matches sharing players, concurrent lazy initialization, history chains/current
rating equality, a final-write DB trigger failure and rollback, corrupt persisted NaN rejection, casual/
unfinished/cancelled/test/debug/sandbox exclusions, guest/self-play/invalid results, draw, corrupt prior
history, trusted rated creation, the FINISHED crash gap, another-client repair, real action/snapshot
journal completion, lifecycle rating retry/drain, defaults without writes, paginated API/GET isolation,
owner deletion restriction and audit survival after match deletion. Fixture cleanup is guarded and local.

## 23–24. Commands and exact verification results

All final checks passed with exit **0**. Integration suites used the existing production/loopback/
test-name guard against a new disposable `fate-phase15-postgres` PostgreSQL 16-alpine container,
bound only to `127.0.0.1:53495`, database `fate_phase15_test`. DATABASE_URL and DIRECT_URL were
explicitly pointed to that local test target for migration/DB commands. The full eight-migration
chain was applied to this empty database and migration status reported up to date.

| Command actually executed | Final result |
| --- | --- |
| `npm install` | Exit 0; dependencies installed, rules postinstall build passed; no dependency changes. |
| `npm run -w server prisma:generate` | Exit 0; Prisma Client 6.19.0 generated. Also executed by build/DB pretest hooks. |
| `npm run -w server db:validate` | Exit 0; schema valid with explicit local DATABASE_URL/DIRECT_URL. |
| `npm run -w server db:migrate:deploy` | Exit 0; all eight migrations applied on a clean local database. |
| `npm run -w server db:migrate:status` | Exit 0; database schema up to date. |
| `npm run -w web typecheck` | Exit 0; also passed inside the final build. |
| `node node_modules/typescript/bin/tsc -p packages/server/tsconfig.json --noEmit` | Exit 0; final backend types, including new tests, passed. |
| `npm run lint` | Exit 0; **0 errors / 0 warnings**, enforced by `--max-warnings 0`. |
| `npm run build` | Exit 0; rules, Prisma generation, server TypeScript, web typecheck and Vite production build passed. |
| `npm run test` | Exit 0; all existing root suites plus the new rating unit/service/API suite passed. |
| `npx tsx packages/server/src/tests/rating.test.ts` | Exit 0; official reference and algorithm/service/API checks passed. |
| `npm run -w server test:rating:db` | Exit 0; new rating/concurrency/rollback/lifecycle/API suite passed. |
| `npm run -w server test:db` | Exit 0; database foundation integration passed. |
| `npm run -w server test:auth:db` | Exit 0; authentication/registration/default-rating integration passed. |
| `npm run -w server test:profile:db` | Exit 0; profile integration passed. |
| `npm run -w server test:match:db` | Exit 0; match lifecycle integration passed. |
| `npm run -w server test:results:db` | Exit 0; result persistence, rollback, conflicts and retries passed. |
| `npm run -w server test:actions:db` | Exit 0; action journal integration passed. |
| `npm run -w server test:history:db` | Exit 0; existing Match History integration passed. |
| `npm run -w server test:snapshots:db` | Exit 0; snapshot integration passed. |
| `npm run -w server test:statistics:db` | Exit 0; statistics integration passed. |
| `npm run -w server test:replay:db` | Exit 0; replay reconstruction and read-only SQL guard passed. |
| `npm run -w server test:replay-api:db` | Exit 0; Replay HTTP API in READ ONLY transaction passed. |
| `git diff --check` | Exit 0; no whitespace errors. |

Final verification ran sequentially to avoid the rules build's dist cleanup racing test imports.
Earlier setup/test failures were resolved: initial Prisma validation lacked exported DIRECT_URL,
overlapping build/test execution temporarily removed rules/dist, and the NaN fault test initially
attempted a Prisma read of an undecodable sentinel. The completed final run above passed all checks.
The real conflict test also established that raw FOR UPDATE serialization errors require precise
P2010/SQLSTATE handling in addition to P2034. PostgreSQL NaN decode failures now become a permanent
RATING_INVALID_STATE error, with a raw textual snapshot proving rollback.

Vite build retains existing CJS API deprecation, old Browserslist-data and >500 kB chunk notices;
they do not affect build success or the zero-warning ESLint result. No browser asset/dependency
optimization was added to this backend phase.

The local migration status was checked again after all suites and remained up to date. The owned
rating fault trigger was absent. The disposable container and its anonymous database volume were
removed after verification; no production database or deployment was involved.

## 25. Verification limits

Production Neon migration/deployment was not performed. All writes and fault-injection triggers are
restricted to a disposable local PostgreSQL test database. Browser visual smoke checks are outside
this backend-only change; existing frontend automated tests are included in the root test command.
Automatic startup/background recovery is deliberately absent; service-level recovery is implemented.

## 26. Deferred work

Leaderboard UI/policy, qualification thresholds, Casual/Rated UX, matchmaking, rating-history charts,
ranking tiers, inactivity scheduling, manual editing/reset and operational background workers remain
outside this phase. The existing Rating index, ratedGames/RD fields, immutable histories and explicit
rated marker provide the persistence foundation for subsequent phases.
