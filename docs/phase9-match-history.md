# Phase 9 implementation report

Implemented on 2026-10-02 in the existing FATE workspace. History reads persisted match
results through participation, and provides own/public history and informational match details.

## Files

Added backend files:

- `packages/server/src/matches/historySchema.ts`
- `packages/server/src/repositories/matchHistoryRepository.ts`
- `packages/server/src/services/matchHistoryService.ts`
- `packages/server/src/routes/matchHistoryRoutes.ts`
- `packages/server/src/tests/matchHistory.test.ts`
- `packages/server/src/tests/matchHistory.integration.test.ts`

Added frontend files:

- `packages/web/src/api/matchApi.ts`
- `packages/web/src/pages/MatchHistoryPage.tsx`
- `packages/web/src/pages/MatchDetailsPage.tsx`
- `packages/web/src/matches/types.ts`
- `packages/web/src/matches/presentation.ts`
- `packages/web/src/matches/MatchHistoryFilters.tsx`
- `packages/web/src/matches/MatchHistoryList.tsx`
- `packages/web/src/matches/HistoryPagination.tsx`
- `packages/web/src/matches/MatchLoadError.tsx`
- `packages/web/src/matches/api.test.ts`
- `packages/web/src/matches/components.test.tsx`
- `packages/web/scripts/match-history-smoke.mjs`

Changed files: root `README.md` and `package.json`; server `package.json`, `src/index.ts`,
`src/repositories/matchRepository.ts`, `src/services/matchService.ts`,
`src/tests/matchResult.integration.test.ts`; web `package.json`, `src/App.tsx`,
`src/auth/AccountControl.tsx`, `src/auth/AuthLayout.tsx`, `src/modes/modeLabels.ts`,
`src/pages/ProfilePage.tsx`, `src/pages/PublicProfilePage.tsx`,
`src/profile/components.test.tsx`, `src/i18n/locales/en.ts`, `src/i18n/locales/uk.ts`;
this report.

## Persistence and API contract

No Prisma schema changes, new indexes, or new migration. Existing `MatchParticipant.userId`
index and match/participant unique keys support participation lookup. The six existing migrations
were applied to a fresh, isolated PostgreSQL 16 test database.

`GET /api/users/:id/matches` → Zod validation → `MatchHistoryService` →
`MatchHistoryRepository` → PostgreSQL → explicit DTO. The repository verifies existence using
an ID-only select, filters `Match` using `participants.some({ userId, outcome })`, and reads count
and page in a short repeatable-read transaction with the same predicates. Relation selects
are bounded; the integration test observed at most seven SELECTs and no action/snapshot/session
queries. Neither creator identity nor current room/WebSocket state defines participation.

| Query | Supported values |
| --- | --- |
| `page` | Default 1, positive integer up to 21474836 |
| `limit` | Default 20, positive integer up to 100 |
| `result` | Optional `WIN`, `LOSS`, `DRAW` |
| `gameMode` | Optional `standard`, `draft`, `classic`, from shared rules metadata |

Only `FINISHED` records are included. Status filtering is not implemented. Sort is
`finishedAt DESC NULLS LAST, id DESC`, including deterministic ties. Pagination returns
`{ page, limit, total, totalPages }`; empty history has totalPages 0. Out-of-range pages
return empty items with real totals, and the UI moves to the last valid page. Invalid IDs
or filters return `400 INVALID_REQUEST`; an unknown valid user returns `404 USER_NOT_FOUND`.

History item DTO fields are `id`, `status`, user-relative `result`, `seat`, `gameMode`,
`createdAt`, `startedAt`, `finishedAt`, canonical `durationMs`, `finishReason`,
`finalRevision`, `turnCount`, and nullable `opponent`. Opponent fields are `userId`,
opposing `seat`, historical `displayName`, nullable current `username` and `avatarUrl`.
Opponents are selected by opposing seat and a different user ID; guest/deleted identities
and missing profiles remain readable. Display names always use `displayNameSnapshot`.
Missing duration/result/revision/turn metadata remains null. Displayed dates fall back from
finishedAt to startedAt, then createdAt; legacy null finish dates sort after dated results.

History and details APIs are public and expose only safe match/public profile metadata.
Own `/matches` UI requires authentication and uses restored `AuthUser.id`. Current profile
navigation fields are added when reading details; finalization and its canonical result DTO
retain their existing behavior. The existing results integration test now permits those two
public fields and compares canonical result metadata independently of profile navigation.

## Frontend behavior

Routes: `/matches`, `/matches/:id`, `/users/:username/matches`. Account/own/public profile
navigation exposes history. One shared list, filters and pagination component serve both
own and public history. The public username route first resolves the public profile's user ID.

`/matches/:id` reuses `GET /api/matches/:id`. It shows status, localized mode, primary date,
start/finish times, duration, finish reason, final revision, turn count, P1/P2 historical names,
participant outcomes, avatars and current profile links where available. History entry links
are keyboard accessible; select controls have explicit labels. Layout adapts to mobile and
desktop and supports existing light/dark themes and English/Ukrainian localization.

Filter/page state lives in the URL, survives refresh and back navigation, and resets page 1
when filters change. Loading, retryable errors, invalid filters, unknown users/matches,
normal empty history and filtered-empty history have distinct localized states. Stale requests
cannot replace a newer route/filter result. Dates/durations gracefully handle missing legacy data.
The client decodes safe DTOs and uses the existing public API helper.

## Executed verification

| Command | Final result |
| --- | --- |
| `npm install` | Exit 0 |
| `npm run -w server prisma:generate` | Exit 0 |
| `npm run -w server db:validate` | Exit 0, schema valid |
| `npm run -w server db:migrate:deploy` | Exit 0, all six existing migrations applied to isolated test DB |
| `npm run -w web typecheck` | Exit 0, zero type errors |
| `npx tsc -p packages/server/tsconfig.json --noEmit` | Exit 0 |
| `npm run lint` | Exit 0, zero errors / zero warnings |
| `npm run build` | Exit 0 for rules, server, web typecheck and production web build |
| `npm run test` | Exit 0, rules/boundaries/server/auth/profile/new match tests all passed |
| `npx tsx packages/server/src/tests/matchHistory.test.ts` | Exit 0 |
| `npm run -w web test:matches` | Exit 0, 15 passed / 0 failed / 0 skipped |
| `npm run -w web test:i18n` | Exit 0, 5 passed / 0 failed |
| `npm run -w server test:history:db` | Exit 0 |
| `npm run -w server test:results:db` | Exit 0 |
| `npm run -w server test:actions:db` | Exit 0 |
| `npm run -w server test:match:db` | Exit 0 |
| `npm run -w server test:profile:db` | Exit 0 |
| `npm run -w server test:auth:db` | Exit 0 |
| `npm run -w server test:db` | Exit 0 |
| `npm run -w web test:matches:e2e` | Exit 0, real Chromium browser smoke passed |
| `git diff --check` | Exit 0 |

New backend coverage includes perspective changes for A/B, authoritative snapshots, guests,
missing profiles/opponents, UUID/query validation, bounds, public access, errors and privacy.
PostgreSQL coverage includes creator/participant distinction, all outcomes and modes, combined
filters, multiple pages without gaps/duplicates, tied timestamps, identical count predicates,
legacy nulls, renames, deletion and bounded relation reads. Frontend tests cover URL/back/remount
behavior, filters, pagination boundaries, stale responses, session restoration, details, loading,
errors/retry and empty states.

Initial attempts surfaced and resolved a linked CommonJS import issue, an exact DTO field
allowlist needing the two new public fields, an implicit select-label accessibility issue,
and a test fixture using a non-normalized email. Concurrent Prisma generation while an engine
DLL was open caused a Windows EPERM; serial execution resolved it. Result concurrency tests
also timed out with localhost (the untouched baseline reproduced this); the isolated test DB
connection uses `127.0.0.1:55439` with `connection_limit=10`, and all assertions pass without
changing timeouts or suppressing failures.

Production build still reports Vite CJS API deprecation, old Browserslist data and the large
main-chunk warning. These are separate from lint, whose warning count is zero.

## Browser observations and limits

The automated browser smoke seeded 24 completed results in PostgreSQL, logged in through the
UI, navigated both pages, filtered wins/losses and classic mode, refreshed with URL filters,
opened details, followed public profile links, renamed the opponent's current profile while
keeping historical match names, logged out, and refreshed public history. It checked filtered
empty state and public response privacy. Desktop 1100×850 and mobile 390×844 screenshots of
history/details were generated; the mobile history and desktop details PNGs were visually inspected.

Screenshots are under `packages/web/test-results/match-history` (ignored generated artifacts).
This was automated browser verification with seeded results, not a manually played collection
of 24 matches. Actual runtime finalization, including wins and chess draws, was exercised by
the existing PostgreSQL results integration suite. No production deployment, production-data
benchmark, or crash-durability benchmark was performed.

Deferred as requested: Match Snapshots persistence, deterministic replay, player statistics,
rating calculations/history, leaderboard, matchmaking and achievements. History and details
do not load the action journal or implement replay controls.
