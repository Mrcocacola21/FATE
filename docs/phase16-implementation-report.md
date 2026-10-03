# Phase 16 — Leaderboard

Implemented on 2026-10-03 in the current working tree. Existing uncommitted Phase 15 changes were
preserved. No production Neon migration or deployment was performed.

## Files added and changed in Phase 16

Added:

- `packages/server/src/leaderboard/config.ts` — qualification policy and environment parsing.
- `packages/server/src/leaderboard/querySchema.ts` — strict HTTP query whitelist/bounds.
- `packages/server/src/repositories/leaderboardRepository.ts` — parameterized SQL reads.
- `packages/server/src/services/leaderboardService.ts` — policy, safe DTO and pagination metadata.
- `packages/server/src/routes/leaderboardRoutes.ts` — public read route and sanitized errors.
- `packages/server/src/tests/leaderboard.test.ts` — configuration/service/API unit tests.
- `packages/server/src/tests/leaderboard.integration.test.ts` — guarded local PostgreSQL integration.
- `packages/web/src/api/leaderboardApi.ts` — HTTP client and strict safe response decoder.
- `packages/web/src/leaderboard/types.ts` — frontend DTO/query types.
- `packages/web/src/leaderboard/query.ts` — URL state and normalization.
- `packages/web/src/leaderboard/LeaderboardStandings.tsx` — desktop table and mobile cards.
- `packages/web/src/leaderboard/leaderboard.css` — responsive presentation using existing tokens.
- `packages/web/src/leaderboard/fixtures.ts` — shared test data.
- `packages/web/src/leaderboard/api.test.ts` — decoder/client/URL tests.
- `packages/web/src/leaderboard/components.test.tsx` — routed frontend interactions/states.
- `packages/web/src/pages/LeaderboardPage.tsx` — page/loading/error/policy controls.
- `packages/web/scripts/leaderboard-smoke.mjs` — browser fixtures, interactions and screenshots.
- `docs/phase16-implementation-report.md` — this report.

Changed:

- `.env.example` — non-secret `LEADERBOARD_MIN_RATED_GAMES=5` example.
- `README.md` — Leaderboard semantics, contract, verification and current roadmap references.
- `package.json` — include frontend leaderboard tests in the root suite.
- `packages/server/package.json` — leaderboard scripts and standard server test inclusion.
- `packages/server/src/config.ts` — validate leaderboard configuration at startup.
- `packages/server/src/index.ts` — route registration and injectable leaderboard reads.
- `packages/server/src/repositories/index.ts` — repository export.
- `packages/server/src/services/README.md` — responsibilities and consistency handling.
- `packages/web/package.json` — frontend/browser leaderboard test scripts.
- `packages/web/src/App.tsx` — public `/leaderboard` route and full-width page wrapper.
- `packages/web/src/layout/Sidebar.tsx` — navigation and active-state handling.
- `packages/web/src/layout/AppShell.test.tsx` — sidebar and trailing-slash active-state regression.
- `packages/web/src/ui/TacticalIcon.tsx` — leaderboard icon within existing SVG system.
- `packages/web/src/main.tsx` — load leaderboard stylesheet.
- `packages/web/src/matches/HistoryPagination.tsx` — optional accessible label for reuse.
- `packages/web/src/i18n/locales/en.ts` and `uk.ts` — localized strings and plural forms.
- `packages/web/src/i18n/index.ts` — preserve the selected locale for count interpolation without plural variants.

No Phase 16 runtime dependency, schema model, index or migration was added. Phase 15 files present
before this task are not Phase 16 additions. Package lock dependency content is unchanged.

## Existing persistence and eligibility actually found

The current PlayerRating equivalent is **Rating**, not a model literally called PlayerRating.
It stores userId UUID PK, rating Float (1500), ratingDeviation Float (350), volatility Float (0.06),
ratedGames Int (0), createdAt and updatedAt. There is already a descending rating index.

RatingHistory stores before/after rating, RD and volatility, userId, nullable match/opponent IDs,
result, ratedGameNumber and createdAt. Unique user/match and user/period keys protect exactly-once
processing. Match has isRated (default false), status, finishedAt and nullable ratingProcessedAt.
MatchParticipant has participant-relative WIN/LOSS/DRAW, userId and unique match/user and match/seat.
Profile has unique username, optional displayName/avatarUrl and private preferences. Public profile
and Statistics reads are already unauthenticated; Leaderboard follows that policy.

Phase 15's eligibleRatingPlayers requires normal supported standard/classic/draft rated FINISHED
matches, valid finish time/revision, two distinct registered players, and consistent canonical
WIN/LOSS or real chessMutualKingDefeat DRAW outcomes. Normal test/Heartbreak rooms do not persist
matches; unknown/test/debug modes and debug terminal reasons cannot earn ratings. Both current
ratings, both numbered histories and ratingProcessedAt commit atomically. The crash gap before
rating commit does not increment ratedGames. Current room creation remains casual.

PlayerStatisticsService reads broader finished career outcomes through StatisticsRepository and
pure summary/streak/mode helpers. Its meaning was preserved; it was not reused as competitive metrics.
Existing RatingService, Glicko-2 math, processing/concurrency, replay, match history and gameplay
code were not modified by this phase.

## Architecture and qualification

`leaderboardRoutes -> LeaderboardService -> LeaderboardRepository -> PostgreSQL/Prisma`.
Routes validate requests and map safe errors. Service resolves qualified/provisional DTO semantics,
integrity availability, games remaining and response metadata. Repository owns filtering, aggregation,
ranking, sorting and pagination. No generic repository framework was introduced.

Default minimum is the centralized **LEADERBOARD_MIN_RATED_GAMES = 5**. The environment override
must be an integer from 1 through 2147483647; invalid values fail configuration validation.
Response metadata supplies the frontend's actual threshold. Qualification does not use RD.

- Zero rated games: omitted from both lists.
- Positive ratedGames below threshold: PROVISIONAL, ratingRank null, server-computed games remaining.
- ratedGames at/above threshold: QUALIFIED, global competitive ratingRank and zero games remaining.

A current public Profile is required for an identity/linkable leaderboard row. Registration already
creates it. Legacy users lacking a Profile are omitted safely rather than receiving broken links.

## Metrics and integrity

Rating, RD and games come directly from Rating. **Games played means ratedGames** everywhere.
Wins/losses/draws aggregate MatchParticipant.outcome joined to rated FINISHED matches with non-null
processed marker/completion time, supported mode, and matching numbered successful RatingHistory
attribution. RatingHistory verifies processing attribution; its rating snapshots never supply the
current rating. Reads do not rerun eligibility/Glicko processing or load histories into Node.

Win rate is **ratedWins / ratedGames**, with draws in the denominator, matching the Statistics fraction
convention. Zero-game accounts are excluded, so no zero division reaches SQL/UI. Last activity is
**MAX(Match.finishedAt)** over those processed rated results. Casual/pending/failed/test/debug/sandbox/
cancelled games, login and profile updates do not contribute.

The current schema allows Match deletion while keeping current counters/audit history. When processed
result count disagrees with ratedGames, performanceAvailable is false and wins/losses/draws/winRate/
lastActivity are null. Rating, games, qualification and rank remain authoritative. Both missing win rate
and activity sort last in either direction. UI explains unavailable performance; no false losses or
invented denominator reconcile the discrepancy. Delayed successful rating commits naturally appear
on the next read without leaderboard mutation or counters maintained by this feature.

## Ranking, sorting, query efficiency and indexes

Canonical order: **rating DESC, ratingDeviation ASC, ratedGames DESC, userId ASC**.
ROW_NUMBER() over qualified candidates produces ordinal 1, 2, 3, … before display sorting/limit/offset.
Ranks remain canonical for alternate metrics/directions and pages. Provisional ranks are suppressed.
Equal floating rating values use real unrounded RD/games/UUID tie-breakers; persistence is never rounded.

Supported sort/order and deterministic keys:

| Sort | Primary key/direction | Secondary keys |
| --- | --- | --- |
| rating | rating asc/desc | RD ASC, ratedGames DESC, userId ASC |
| gamesPlayed | ratedGames asc/desc | rating DESC, userId ASC |
| winRate | wins/ratedGames asc/desc, NULLS LAST | ratedGames DESC, rating DESC, userId ASC |
| lastActivity | max eligible finishedAt asc/desc, NULLS LAST | rating DESC, userId ASC |

Exactly **two SELECT statements** share a RepeatableRead snapshot: total population count and a
candidate/window + grouped performance + standings query. SQL sorts before pagination; Node maps
at most limit rows. No per-row profile/statistics/history/rank/activity query, full match-state read,
cache, socket, cron or derived mutable table is used. Raw SQL uses Prisma.sql/join and bound values.
Only explicitly selected trusted column/direction fragments enter ORDER BY; user strings cannot be SQL.

Existing Rating descending index, Profile PK, MatchParticipant.userId index, Match eligibility index,
and RatingHistory user/match uniqueness cover current-scale access. Window ranking and aggregate
sorts necessarily scan the relevant population in PostgreSQL; no unmeasured large-scale performance
claim or materialized view is made. No redundant Phase 16 index/migration was needed.

## API and pagination contract

Public **GET /api/leaderboard** with Cache-Control no-store.
Defaults: status=qualified, page=1, limit=20, sort=rating, order=desc.
Supported status: qualified/provisional; sorts and directions above. Limit is 1–100, page is a positive
integer up to 21474836 (existing pagination bound). Invalid/unknown/repeated fields return existing
**400 INVALID_REQUEST**; errors follow the existing sanitized AuthError conventions.

Response: items, pagination { page, limit, total, totalPages }, qualification { minRatedGames }.
totalPages = ceil(total/limit), including zero for an empty population. Out-of-range pages return empty
items with correct metadata; the frontend replaces their URL with the last available page, or page 1.

Each item contains ratingRank, user { id, username, displayName, avatarUrl }, rating, ratingDeviation,
ratedGames, wins, losses, draws, winRate, lastActivity ISO/null, performanceAvailable, status
QUALIFIED/PROVISIONAL and gamesUntilQualified. Performance fields can be null only under the integrity
policy above. No position alias silently changes meaning, volatility, email, auth/session/token/private
preference, actions, replay/checkpoint or resultData payload is exposed.

## Frontend and responsive presentation

Public route **/leaderboard** sits inside normal AppShell and uses the existing full-width wrapper.
Sidebar entry has one active state, including a trailing slash. Links navigate to current public profiles;
existing Vercel rewrites support refresh/direct routes. Profile and runtime routing semantics remain intact.

Ranked is selected by default. Provisional omits the official rank column/badge and shows games/threshold
and games until ranked. Rating is rounded visually; RD appears as ±value under **Uncertainty**, with a
visible explanation and tooltip. No fake confidence percentage, skill badge, tier or volatility column.
Rated games, win rate, compact W/L/D and localized last rated activity are shown. Avatar fallback accepts
safe existing URLs; long identities wrap. Top three receive restrained warm numeric/background accents.

Desktop uses the table; widths <=1150px use two-column cards, and <=600px use one-column cards.
All styling follows existing theme tokens and supports both themes. No row animations were introduced.
Tabs support arrows/Home/End and roving focus; sort headers are buttons with aria-sort, profile links
are keyboard links, loading has aria-busy/skeletons, errors have alert/Retry, and both empty states explain
qualification. Pagination reuses HistoryPagination with a leaderboard-specific accessible label and two
buttons regardless of total page count.

All five query parameters live in URL state. Tab/metric/direction changes reset page 1, malformed values
normalize, reload/back restore selection, and stale async responses cannot replace current rows.
Both English and Ukrainian locales include qualification supplied by the backend; their key trees match.
No polling/WebSocket or matchmaking was introduced.

## Tests and verification

Added server tests cover configuration, strict/default queries, DTO precision/privacy, provisional/null
ranks, configured thresholds, safe errors and read-only routes. New local PostgreSQL fixtures use real
RatingService processing, including draws, one-game high-rating provisional, zero-game exclusion, exact
3W/2L + 100 casual wins, pending rating exclusion, test/debug/sandbox exclusions, current identity,
deterministic ties/all sorts/both directions, 29 qualified players, global rank 21 on page 2, no duplicate
pages, repeatability, read-only snapshots, two SQL reads and explicit Match-deletion handling.

Frontend tests cover strict DTO decoding/private-field removal, client params, default Ranked, metrics,
profile navigation, provisional progress/no rank, URL sorting/direction/pagination/back, invalid/out-of-
range recovery, skeleton loading, stale response protection, both empty states, error/retry, configured
threshold and translation. AppShell tests include leaderboard navigation/active state.

Browser smoke uses HTTP fixtures independently of DB integration. It checks 1920x1080, 1366x768,
768x1024 and 390x844, all core interactions/states, long names/top three, Ukrainian, large page counts,
profile/AppShell navigation and no horizontal overflow or uncaught page errors. Screenshots are saved
under `packages/web/test-results/leaderboard/`.

Local DB verification used an owned disposable **postgres:16-alpine** container named
`fate-phase16-postgres`, bound only to **127.0.0.1:53496**, database **fate_phase16_test**. DB commands
explicitly targeted that loopback test database using DATABASE_URL/DIRECT_URL/TEST_DATABASE_URL.
All eight existing migrations applied to its empty database using migrate deploy; the final migration
status was up to date. No old migration was edited and no production connection was used.

Commands actually executed and confirmed results:

| Command | Result |
| --- | --- |
| `npm install` | Exit 0; workspace/rules postinstall completed; dependencies unchanged |
| `npm run -w server prisma:generate` | Exit 0, Prisma Client 6.19.0 generated |
| `npm run -w server db:validate` | Exit 0, schema valid |
| `npm run -w server db:migrate:deploy` | Exit 0, all 8 migrations applied to fresh LOCAL TEST DB |
| `npm run -w server db:migrate:status` | Exit 0, local schema up to date |
| `npm run -w web typecheck` | Exit 0 |
| `npm run lint` | Exit 0, **0 errors / 0 warnings** with `--max-warnings 0` |
| `npm run build` | Final rerun exit 0: rules, server, web typecheck and production Vite bundle |
| `npm run test` | Final rerun exit 0: rules/core/boundaries, full standard server suite and root frontend suites |
| `npm run -w web test:leaderboard` | Exit 0, **11 passed / 0 failed** |
| `npm run -w web test:i18n` | Exit 0, **5 passed / 0 failed**, locale parity and JSX audit |
| `npm run -w server test:leaderboard:db` | Exit 0, complete real-PostgreSQL/API suite |
| `npm run -w web test:leaderboard:e2e` | Exit 0, complete browser smoke at all 4 viewports |
| `npm run -w server test:history:db` | Exit 0 |
| `npm run -w server test:profile:db` | Exit 0 |
| `npm run -w server test:replay-api:db` | Exit 0, persisted rows unchanged/read-only HTTP |
| `node node_modules/tsx/dist/cli.mjs packages/server/src/tests/rating.integration.test.ts` | Exit 0, including rollback, concurrent shared/first players and duplicate processing |
| `node node_modules/tsx/dist/cli.mjs packages/server/src/tests/playerStatistics.integration.test.ts` | Exit 0, 3 SELECTs for both 11 and 100 games |
| `git diff --check` | Exit 0 |

Server leaderboard unit/API tests also passed through both direct tsx and the root suite:
**5 passed / 0 failed**. Earlier iterations exposed ES2020-incompatible test helpers and inaccurate
JSX-text assertions; those were fixed. A Statistics query-event assertion failed once during concurrent
validation and passed unchanged on the serial rerun. An initial rating DB launch raced a rules dist
cleanup; its complete direct rerun above passed. These were not treated as successful first attempts.

The browser run also caught a real locale fallback defect: a count-interpolated base string without
plural variants fell back to English. The i18n resolver now tries the selected locale's base key before
English. A regression test covers Ukrainian configured qualification/empty/progress strings. Browser
smoke was rerun successfully after this fix and preserves language across refresh.

Visually reviewed screenshots:

- **1920x1080:** ranked desktop table, all columns, top three and long identity.
- **1366x768:** ranked and provisional tables, no official provisional ranks.
- **768x1024:** two-column qualified cards, wrapped identities and complete metrics.
- **390x844:** qualified/provisional cards, both empty states, loading, error/Retry and Ukrainian.
- Full-page large-count capture: **Page 1 of 10000**, two navigation buttons, no horizontal overflow.

Both full-page and exact-viewport PNGs are in `packages/web/test-results/leaderboard/` (ignored generated
artifacts). Browser automation additionally verified filter/sort/direction requests, page-2 rank 21,
URL reload/back/normalization, keyboard tab switching, public profile navigation with AppShell, Retry,
and no uncaught page errors. Final root build/test reruns completed successfully after the locale fix;
new leaderboard tests are included in the normal root suite. Final build/test/lint transcripts are in
`.tmp/phase16-final-build.log`, `.tmp/phase16-final-test.log` and `.tmp/phase16-final-lint.log` (ignored).
Build verification supplied non-secret localhost API/WS URLs and the isolated local DB variables.
Vite's existing CJS/Browserslist/large-bundle advisories remain; they do not affect build success or the
zero-warning ESLint result. No asset/dependency optimization was added to this phase.

The owned local PostgreSQL container and its anonymous volume were removed after verification using
`docker rm --force --volumes fate-phase16-postgres`. Screenshot artifacts were preserved. No required
local verification remains unfinished. Production deployment, production migrations and real large-scale
load benchmarks were not performed; browser fixture tests and real persisted-data tests are distinct.

## Deferred work and verification scope

Full Casual/Rated UX, Matchmaking Queue, seasons, rank tiers/divisions, advanced leaderboard filters,
decay/inactivity scheduling, history graphs, cache and background recovery remain out of scope. Existing
trusted server-only isRated and rating processing provide future-phase integration points. No future UI
placeholders were added. Browser fixtures verify UI behavior/layout; local DB suites verify persisted
semantics. Production Neon/Render/Vercel deployment and production migration were not performed.
