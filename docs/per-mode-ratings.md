# Independent competitive ratings

FATE owns three independent Glicko-2 ladders, using the existing rules IDs
`standard`, `draft`, and `classic`. Competitive identity is `(userId, gameMode)`.
Each row owns rating, rating deviation (RD), volatility, and ratedGames. There is
no combined, averaged, or highest-mode rating used for competition.

The shared canonical defaults remain `INITIAL_RATING`: 1500, RD 350, volatility
0.06, zero games. Public reads return virtual defaults when a mode has no row;
account registration creates all three fresh rows. Initial 1500 derives Full.
Rank thresholds/artwork and Glicko math are unchanged. Qualification uses the
shared `LEADERBOARD_MIN_RATED_GAMES` separately for each mode. Playing Standard
cannot qualify Draft or reduce its RD.

## Storage and processing

Previously `Rating.userId` was the primary key; User had a single optional rating.
`RatingHistory.ratedGameNumber` was unique per user. Rating processing locked the
Match and User rows and updated both players in a Serializable transaction.

Now User has `ratings: Rating[]`, with composite primary key `(userId, gameMode)`
and an index `(gameMode, rating DESC)`. Rank tier remains derived, never stored.
SQL CHECK constraints accept only the existing canonical mode IDs. The archived
`LegacyGlobalRating` relation preserves the old row separately from competition.

New RatingHistory records snapshot the authoritative Match.gameMode and both
full before/after Glicko states. Period uniqueness becomes
`(userId, gameMode, ratedGameNumber)`; history pagination indexes that mode too.
The existing `(userId, matchId)` unique constraint remains. Legacy global history
has `gameMode = NULL`, explicitly identifying the old global stream. A partial
unique index preserves period uniqueness for that archived stream.

`getPlayerRating(userId, gameMode)` and batched
`getPlayerRatings(userIds, gameMode)` require a mode. Both players are resolved
from the persisted match's mode, and calculated from immutable pre-match states.
Native upserts acquire the actual mode-row locks in stable user-ID order,
including lazy initialization. Other modes do not share a User-row lock.
Serializable isolation and the existing bounded retry policy protect lost
updates/deadlocks; transactions include both ratings, both history rows and
ratingProcessedAt. The Match row lock serializes duplicate deliveries. Recovery
validates both histories and returns alreadyProcessed without writing twice.
Casual matches return ineligible before any rating rows are created or locked.

## API and presentation

- `GET /api/users/:id/ratings` returns `{ ratings: { standard: {...}, draft:
{...}, classic: {...} } }`.
- `GET /api/users/:id/rating?gameMode=draft` returns that mode's state plus
  backend-derived rankTier/rankProgress. For older read URLs, omitted mode
  explicitly selects Standard, never a global rating.
- `GET /api/users/:id/rating/history?gameMode=draft` returns only that stream.
  Archived global records are preserved in storage and excluded from these
  per-mode responses. Omitted mode selects Standard.
- `GET /api/leaderboard?gameMode=draft` filters candidates, qualification,
  numeric ratingRank, games, wins/losses/draws, win rate and last processed Rated
  activity to Draft. Incomplete history continues to yield unavailable metrics.
- `/api/competitive/config` stays shared. Volatility exposure follows the existing
  API policy; UI does not display it.

Play has one mode selector controlling its medal, rating, uncertainty, progress,
qualification and queue request. A restored active queue supplies its actual mode
and locks the selector. Queue range calculation is unchanged and uses that mode's
rating snapshot. Waiting display reads the queue's server-owned rating directly.
Profile/public Profile reuse the same compact selector and approved RankEmblem.
Leaderboard selection lives in `gameMode` URL state, preserving reload/back/forward.
No frontend threshold copy or per-mode rank artwork is introduced.

Manual Rated lobby discovery batches rating reads by lobby gameMode. It displays
those same ratings and compares their gap with the existing shared maximum.
Server Start revalidates current ratings, including mode changes. Standard
1900 vs 1300 fails a maximum gap of 400; Draft 1450 vs 1500 passes for those same
players. Career statistics and Match History remain career-wide as before;
replay/history still retain the match's actual mode.

## Legacy cutover policy

Migration: `20261004000000_per_mode_ratings`. It runs atomically, renames the
global Rating table to LegacyGlobalRating without rewriting its earned state,
creates an empty mode Rating table and adds nullable history mode snapshots.
It preserves all old RatingHistory rows and Match.ratingProcessedAt values.
Old global before/after records must never be labeled as earned mode states.
No global rating is copied into Standard, Draft, or Classic.

**The deliberate fallback is fresh independent ladders from canonical defaults.**
Existing processed matches remain alreadyProcessed, so recovery cannot award
them again after cutover. Previously unprocessed eligible matches can recover
once into their actual mode. This is not a historical replay or season feature.

The schema permits deleted Matches (history.matchId uses SET NULL), deleted
participants/opponents, unnumbered foundation-era history and missing historical
results. Before the earlier Glicko migration, matches also defaulted to Casual.
There is no durable total ordering across all matches; numbered histories encode
per-player commit order, while finish timestamps need not equal processing order.
A trustworthy replay would first require proving complete eligible matches,
canonical results, both histories, coherent per-player ordering and applicable
algorithm configuration. Replaying by timestamp alone is not justified.

The workspace's `.env` points to a local development database; its read-only
inventory could not connect during this task. No production connection was
provided or accessed, and historical completeness could not be established.
Consequently no reconstruction is claimed or attempted. The fallback preserves
all evidence for a separately audited reconstruction if completeness is later
proven.

`scripts/ratingMigrationInventory.cjs` is a read-only preflight. It reports only
aggregate counts, mode coverage and missing-history indicators, without printing
connection strings or player data. Counts alone cannot prove replay completeness.
Run with the intended DIRECT_URL/DATABASE_URL before an operator deploys:

```powershell
npm run -w server db:rating:inventory
```

For deployment, stop/drain old server writers and pending completion work,
take the normal database backup, inspect inventory, and deploy the migration
and matching server release together. Follow existing DIRECT_URL and
`db:migrate:deploy` architecture. Do not run old global-rating binaries against
the new schema. Prisma's migration ledger makes subsequent deploys a no-op;
the SQL is an atomic one-time migration, not an ad-hoc rerunnable backfill.
Do not use db push or reset against production.

## Verification and limits

DB tests use the existing guard: loopback PostgreSQL and a database/schema name
with a test segment. The task-created PostgreSQL 16 container is
`fate-mode-ratings-test`, bound to `127.0.0.1:15440`, database `fate_modes_test`.
Only this disposable database receives migration deployments and test mutations.
The migration regression creates another randomly named test schema, runs all
previous SQL migrations, seeds actual old ratings/history/processed matches,
then verifies the cutover, fresh defaults, audit preservation, recovery and
independent constraints.

New integration suites are `perModeRatings.integration.test.ts` and
`perModeMigration.integration.test.ts` (`npm run -w server test:rating:modes:db`).
They cover all Rated/Casual modes, full-state/timestamp isolation, independent RD,
history streams, duplicate processing, different-mode concurrency, ranks,
qualification, leaderboard metrics and public APIs. Existing rating races test
same-mode serialization/lazy initialization/rollback and crash recovery.
Queue and manual lobby regressions compare radically different mode ratings.
Frontend tests exercise mode-specific medals, values, qualification, queue
alignment and leaderboard browser history.

`packages/web/scripts/per-mode-ratings-smoke.mjs` uses real local PostgreSQL
competitive APIs/services and a real queue/WebSocket lobby. Test authentication
and own-profile delivery are fixture responses. A fixture persists a completed
Draft result through the real RatingService to inspect unchanged other rows;
it does not claim a human played a whole Draft game in the browser. Existing
DB suites exercise complete legal matches and deterministic replay.

No production migration or deployment occurred. No rating chart/delta/promotion
redesign, historical reconstruction, seasons or cross-mode transfer was added.
Final commands/results are recorded in `docs/per-mode-ratings-verification.md`.
