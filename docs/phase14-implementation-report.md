# Phase 14 — Player Statistics UI

Implemented in the existing Profile experience, using the actual Phase 13 statistics contract.
No Phase 14 server changes, schema changes, migrations or dependencies were introduced.
The pre-existing uncommitted Phase 13 backend work remains in place.

## 1. Files added and changed

Added:

- `packages/web/src/api/statisticsApi.ts`: public client and explicit runtime decoder.
- `packages/web/src/statistics/types.ts`: frontend DTO interfaces.
- `packages/web/src/statistics/useProfileResource.ts`: player/refresh/retry-scoped requests.
- `packages/web/src/statistics/PlayerStatisticsSection.tsx`: shared orchestration and states.
- `packages/web/src/statistics/StatisticsSummary.tsx`: metric cards and secondary averages/streak.
- `packages/web/src/statistics/RecentPerformance.tsx`: result links, SVG trend and text alternative.
- `packages/web/src/statistics/GameModeBreakdown.tsx`: mode rates, records, samples and averages.
- `packages/web/src/statistics/presentation.ts`: number/percentage/sample/recent-chart helpers.
- `packages/web/src/statistics/statistics.css`: token-based theme and responsive presentation.
- `packages/web/src/statistics/fixtures.ts`: test-only fixtures, excluded from production imports.
- `packages/web/src/statistics/api.test.ts`: contract/client/formatting/recent-transformation tests.
- `packages/web/src/statistics/components.test.tsx`: component/request/routing/error tests.
- `packages/web/scripts/statistics-smoke.mjs`: local browser smoke and screenshots.
- `docs/phase14-implementation-report.md`: this report.

Changed:

- `packages/web/src/pages/ProfilePage.tsx` and `PublicProfilePage.tsx`: identity surfaces and shared statistics integration.
- `packages/web/src/App.tsx`: wider Profile-specific container without enclosing the entire experience in another card.
- `packages/web/src/main.tsx`: stylesheet import.
- `packages/web/src/i18n/locales/en.ts` and `uk.ts`: complete statistics translations/plurals.
- `packages/web/src/profile/components.test.tsx`: deterministic statistics/history mocks for existing profile tests.
- `packages/web/package.json`: focused component/API and browser verification scripts.
- Root `package.json`: includes the focused statistics suite in `npm test`.
- `README.md`: Phase 14 behavior, contract boundaries, verification and updated roadmap references.

`npm install` changed no dependency or lockfile content. Existing modified/untracked server files
and the Phase 13 report belonged to the starting workspace, not to this frontend implementation.

## 2. Backend DTO actually found

`packages/server/src/statistics/playerStatistics.ts` exposes:

```ts
interface StatisticsSummaryDTO {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number; // fraction [0, 1], draws included in denominator
  averageDurationMs: number | null;
  durationSampleSize: number;
  averageTurns: number | null;
  turnCountSampleSize: number;
}
interface StatisticsStreaksDTO {
  currentStreak: { type: "WIN" | "LOSS" | "DRAW" | null; count: number };
  longestWinStreak: number;
  longestLossStreak: number;
}
interface PlayerStatisticsDTO {
  userId: string;
  overall: StatisticsSummaryDTO & StatisticsStreaksDTO;
  byGameMode: (StatisticsSummaryDTO & { gameMode: string })[];
}
```

`GET /api/users/:id/statistics` is public, requires a valid UUID, uses `Cache-Control: no-store`,
and returns the DTO directly. Invalid IDs return `INVALID_REQUEST`; missing users return
`USER_NOT_FOUND`. No eligible games means zero counts/rate/streaks, null averages and empty modes.
Persisted DRAW results are supported by the actual domain. Hero and Figure Set fields are absent.

## 3. Profile integration architecture

Both routes render `PlayerStatisticsSection`. Public identity resolves the username through the
existing profile API before supplying that **target player's ID**; the viewer's authenticated
identity is not used for public statistics. The own page uses its known profile/auth user ID,
allowing statistics to start while private profile data loads. Identity remains visible on a
statistics failure; editing/preferences and existing navigation retain their behavior.

Profile containers use `max-w-6xl`; identity, overview, recent performance and modes are adjacent
surfaces. Public identity and membership/navigation share a compact desktop row and stack on mobile.
No separate analytics route, query store or socket was added.

## 4. API and frontend types

`createStatisticsApi(client).getPlayerStatistics(userId)` reuses `createApiClient(API_BASE)`.
The public endpoint does not invoke session restoration or attach an Authorization header.
Existing timeout, credentials and sanitized API errors are preserved. The decoder validates
finite nonnegative metrics, integer counts, rate bounds, streak types/counts, required nullable
averages and mode rows, and verifies that the returned user ID matches the requested target.
Explicit allowlists remove unexpected fields; no `any` or Prisma imports are used.

Frontend types are `PlayerStatistics`, `StatisticsSummary`, `OverallStatistics`,
`StatisticsStreak` and `GameModeStatistics`, matching the current backend.
`useProfileResource` associates data/errors with user ID, refresh revision and retry attempt,
hides old data synchronously during a switch, and ignores late responses after cleanup.
Statistics and recent history start concurrently and retry independently. Revisits/reloads refetch;
own-profile Refresh refetches profile, statistics and the recent page.

## 5–7. Summary, zero/null semantics and streaks

Seven metrics are presented with different emphasis:

1. Win rate, the strongest number.
2. Games played, an integer career count.
3. Wins / losses, with draws in secondary text only when nonzero.
4. Current streak, localized outcome text and count, e.g. `Win × 4` or `Loss × 2`.
5. Average match duration.
6. Average turns, up to two fraction digits, preserving the DTO's precision.
7. Longest win streak, as a secondary metric.

Percentages and numbers use `Intl.NumberFormat` for English/Ukrainian. Duration reuses the
existing Match History formatter (`900000` becomes `15m 00s`). Null averages render `—`;
real zero duration remains `0m 00s`. Every duration/turn average includes its tracked sample
count against completed games; zero samples show a localized reliable-data explanation.
An empty streak renders `—`. WIN/LOSS/DRAW have restrained semantic token colors and explicit
text; longest loss streak is available in the DTO but is not given extra visual weight.

A zero-game player gets a deliberate empty state without summary cards or empty charts.
Play appears only on `/profile`. Stable skeletons do not flash zero counts; statistics failures
show a contained retry. A recent-history failure leaves career/mode statistics intact.

## 8–10. Recent performance, sample and every visualization

Recent results request only page 1, limit **10**, of the existing public
`GET /api/users/:id/matches?page=1&limit=10`. No full-history, replay, snapshot or action payload
is fetched. Rows without an outcome or completion date are excluded from the visualization;
the eligible bounded sample is ordered oldest to newest, with actual sample size displayed.

Result links use localized W/L/D equivalents. Opponent snapshot display name, mode, date and
duration are in the accessible link name and hover/focus context. Each link opens Match Details;
View all matches uses `/matches` for the owner or `/users/:username/matches` for a public profile.

Exactly two kinds of visualization are implemented:

| Visualization | Question answered | Source and semantics |
| --- | --- | --- |
| Recent sample win-rate line | How has the win fraction changed across the latest recorded results? | At chronological point k: wins among the first k results / k, **inside this bounded recent sample**. Draws are included in k. Requires at least three results. |
| Horizontal win-rate bars by mode | In which modes has this player won more often, and over how many games? | Backend `byGameMode.winRate`, accompanied by its sample count and full numeric record. |

The trend is not a rating or career aggregate. Its algorithm is explained beside the graph.
One/two results retain the strip with a small-sample explanation; an empty sample has no trend.
The native expandable list contains every match's context and exact chart percentage after that
match. Axis labels are HTML at a fixed readable font size rather than shrinking with mobile SVG.

## 11–14. Modes, heroes/loadouts and partial coverage

Mode rows resolve canonical `classic`, `standard`, `draft` labels through existing metadata/i18n;
unknown historical IDs remain visible verbatim. Each row shows games, rate, wins/losses, nonzero
draws, duration/turn averages and their coverage. All returned modes remain accessible and a
single-game mode is not hidden or presented as equal statistical confidence to a large sample.

Hero Performance and Figure Set/loadout analytics are **not available in the current DTO**, so
their sections are omitted. No current selections, roster JSON, replay states or private data
are interpreted as historical usage. There is consequently no hero chart, hero metadata request,
invented coverage count or misleading placeholder. Future hero UI requires reliable backend
historical identities and coverage first.

Partial historical coverage currently applies to duration/turn averages and is displayed honestly
using `durationSampleSize` and `turnCountSampleSize`. Missing averages do not suppress available
statistics or modes. Hero coverage cannot be demonstrated or tested as an available feature.

## 15–18. Libraries, dependencies, responsiveness and accessibility

Charts use lightweight SVG/CSS. No chart, icon, animation, cache or state-management dependency
was added. FATE's existing colors/surfaces, TacticalIcon, typography and button/focus styles are reused.

- Wide desktop: four primary columns, three secondary values, and adjacent recent/mode panels.
- Below 1200px: recent/modes stack, mode rows can use a two-column grid.
- Below 761px: primary metrics use two columns; secondary values wrap into two columns.
- Below 481px: mode rows stack; existing mobile navigation and shell padding are preserved.
- Text wraps for long identities, metric labels and modes. SVG width is fluid; result strips are bounded.

Semantic sections/headings and definition lists expose numeric values. W/L/D are never color-only.
Result links have complete context, keyboard focus and hover/focus tooltips; the expandable match
list also works on touch and provides exact chart values. Chart title/description are labelled;
the mode bars are decorative beside complete text. The 240ms panel entrance is disabled with
`prefers-reduced-motion`; no count-up or repeating chart animation is used.

## 19. Tests added/updated

The focused suite contains **15 passing tests**: DTO validation/unknown fields; public API and
target ownership/error propagation; locale-aware formatting; recent ordering/draw semantics;
seven summary metrics/coverage; null averages and WIN/LOSS/DRAW/empty streaks; zero-data owner CTA;
mode labels/low samples/rates/records; absent hero/loadout sections; bounded recent requests and
detail/history links; small samples; recent failure/retry; statistics failure preserving own profile
editing; player/refresh switching with late responses; and public route target changes.

Existing profile tests use deterministic empty-statistics/recent fixtures and remain green.
The root test script now includes the statistics suite alongside existing regression suites.
The local browser smoke checks complete routing, profile editing, correct history links,
match-detail navigation, refresh, error isolation/retry, mobile navigation, reduced motion,
long text, null/partial coverage, themes, locales and viewport overflow.

## 20. Browser/visual review

Playwright with local Microsoft Edge and mocked HTTP DTOs was used because this session did not
provide the in-app browser's Node REPL tool. Browser fixtures perform no database writes.
Screenshots and `verification.json` are generated under `packages/web/test-results/statistics/`.

Reviewed states include established player (64 games, three modes, draws), zero games, three games,
missing duration/partial turn samples, dominant Classic mode, long identity, statistics error,
expanded recent-match details and own profile after saving. The established profile was exercised
at **1920×1080, 1366×768, 768×1024 and 390×844**. Light-theme Ukrainian mobile was also exercised.
Browser assertions verify no horizontal document overflow, identity in its upper surface and
absence of uncaught page errors. Review corrected public identity ordering and small mobile axes;
screenshots disable entrance animations to capture the completed layout.

## 21–22. Commands and results

Executed:

```powershell
npm install
npm run -w web typecheck
npm run lint
npm run build
npm test
npm run -w web test:statistics
npm run -w web test:profile
npm run -w web test:statistics:e2e
npm run -w web test:i18n
```

Prettier was run on added components/styles/scripts and changed Profile components/translation
sections. Unrelated existing translation formatting was preserved.

Results:

- Install: exit 0, existing dependency graph unchanged.
- Web typecheck: exit 0.
- Lint: exit 0, **0 errors / 0 warnings**, enforced by `--max-warnings 0`.
- Root build: exit 0; rules, Prisma generation, server TypeScript, web typecheck and Vite pass.
- Root test: exit 0; existing rules/server/auth/profile/history/shell/Figure Set/Replay suites and statistics pass.
- Focused statistics: **15/15**, no failures/skips.
- Profile: **11/11**, no failures/skips.
- I18n: **5/5**, including identical translation keys and no direct English JSX labels.
- Statistics browser smoke: exit 0, no uncaught page errors, required viewport/state assertions pass.

The successful Vite build still reports its existing CJS API/Browserslist/chunk-size notices;
these are build notices, not ESLint warnings. `npm install` reports vulnerabilities in the existing
dependency tree; dependency upgrades were not part of this UI phase.

## 23. Verification limits

Browser checks use exact-contract fixture HTTP responses rather than a live PostgreSQL dataset.
The full root suite includes existing Phase 13 service/public-route tests, but its separate guarded
PostgreSQL integration command was not run in this frontend phase. No database/backend mutation
was needed. Real production hosting, live accounts and every theme/locale/viewport combination
were not tested. Unsupported hero/loadout history was deliberately not fabricated for fixtures.

## 24. Deferred work

Glicko-2 Rating System, rating-history visualization and Leaderboard remain future phases.
No Elo/MMR, rank/division, global percentile, comparison, skill score, prediction, achievement,
real-time statistics or report-export UI was introduced. The phase uses the existing statistical
source of truth and leaves a bounded, reusable Profile component ready for subsequent work.
