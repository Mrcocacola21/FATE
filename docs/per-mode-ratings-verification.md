# Per-mode ratings implementation report

Verified on 2026-10-04. Architecture and deployment policy are described in
[per-mode-ratings.md](per-mode-ratings.md).

1. **Previous architecture.** One global `Rating` per User (`userId` primary key),
   full Glicko state and global ratedGames; global per-user history period numbers.
   Match locks plus User locks, Serializable transactions and bounded retries.

2. **Prisma changes.** User now relates to `ratings: Rating[]` and optional archived
   LegacyGlobalRating. Rating adds required gameMode; history adds nullable gameMode
   for its explicit durable mode snapshot, with NULL reserved for legacy global
   records. Match/participants/replay schema is unchanged.

3. **Identity/constraints.** Rating primary key `(userId, gameMode)` and ranking
   index `(gameMode, rating DESC)`. Canonical IDs are `standard`, `draft`, `classic`.
   SQL CHECK constraints accept those IDs. No competing enum or stored rank tier.

4. **History schema.** Mode-specific period uniqueness and user/mode/time index;
   existing user/match uniqueness retained. A partial index also preserves old
   global period uniqueness when gameMode is NULL.

5. **Migration.** `20261004000000_per_mode_ratings/migration.sql`, an atomic SQL
   migration tested both on an empty database and representative previous schema.
   Prisma deploy rerun reports no pending migrations; status is up to date.

6. **Legacy policy.** Preserve old global rows in LegacyGlobalRating and all old
   history in its explicitly global NULL-mode stream. Start new ladders from
   INITIAL_RATING, never copy an earned global rating into three mode rows.
   Keep old ratingProcessedAt markers and recovery idempotence.

7. **Reconstruction.** Not performed or claimed. The configured local development
   DB was unavailable to read-only inventory, and no production DB was provided.
   Schema permits deleted/missing matches, participants and unnumbered audit rows;
   finish timestamps are insufficient to establish processing order. Complete
   historical evidence could not be proven. Audit data remains available for a
   future reconstruction after a separate completeness/order/configuration audit.

8. **RatingService.** Mode is required by `getPlayerRating` and batched
   `getPlayerRatings`; added `getAllPlayerRatings`. Processing resolves both players
   from persisted Match.gameMode and writes only that mode's full state.

9. **Exactly once/concurrency.** Match row lock, history consistency validation,
   atomic marker/history/both-player updates, stable-order native mode-row upserts,
   Serializable isolation and existing conflict retries. Both same-mode races and
   independent different-mode updates pass PostgreSQL tests.

10. **Public API.** `/users/:id/ratings` returns a keyed ratings object containing
    all three modes. Single rating/history and leaderboard reads accept gameMode;
    omitted mode explicitly selects Standard for older read URLs. Shared competitive
    config and existing volatility exposure policy remain unchanged.

11. **Play.** One selected mode controls the competitive panel and queue request.
    Restored active queues supply their actual mode, disabling the selector during
    active search. No second independent rank selector.

12. **RankEmblem.** Existing approved assets and canonical backend-derived
    rankTier/progress are reused. No artwork generation or frontend threshold copy.

13. **Qualification.** ratedGames and provisional/qualified state are independent
    per mode; 1500 still displays Full, including zero-game fresh modes.

14. **Leaderboard.** Candidates, numeric placements, sorts, qualification,
    wins/losses/draws, win rate and last Rated activity filter the same mode.
    Different fixture orderings across modes and unavailable incomplete metrics
    are verified. Selected mode is shareable/reloadable/back-forward URL state.

15. **Matchmaking.** Server loads the exact queued mode's rating/RD snapshot;
    existing dynamic range rules are unchanged. Waiting UI uses server queue state.
    Standard/Draft/Classic queue tests and actual browser queue/API reads pass.

16. **Manual Rated lobbies.** Discovery batches by room mode; displayed ratings
    and the Start gap check use that mode. DB regression: Standard 1900 vs 1300
    blocks, Draft 1450 vs 1500 passes at shared max 400. A subsequent incompatible
    Draft update blocks Start despite earlier eligible discovery. Real WS and
    browser Draft Start regressions also pass.

17. **Profiles.** Own/public Profile use compact mode controls, one medal,
    rating, RD, qualification and progress. General career statistics remain intact.

18. **History behavior.** New mode streams include full before/after state and
    deltas only for the queried mode. Legacy global before/after values are excluded
    from mode histories rather than relabeled. Match History and replay remain intact.

19. **Tests added/updated.** New per-mode DB suite; explicit untouched full-state
    and timestamp comparisons, all Rated/Casual modes, RD/volatility isolation,
    separate histories, duplicate deliveries, cross-mode concurrency, API validation,
    ranks, qualification, independent board order/metrics, real DB lobby gaps.
    Queue/lobby and frontend Play/Profile/Leaderboard/API regressions are added to
    existing suites. Old DB fixtures use the new composite key and explicit mode.

20. **Migration tests.** New isolated-schema suite builds the real old migrations,
    seeds global 1830 ratings/history/processed matches, applies cutover and verifies
    exact audit preservation, no triple-copy, fresh defaults, processed recovery,
    independent period numbers and valid/duplicate/unknown-mode constraints.

21. **Commands executed.** Primary checks:

    ```text
    npm run -w server prisma:generate
    npm run -w server db:validate
    npx tsc -p packages/server/tsconfig.json --noEmit
    npm run -w web typecheck
    npm run lint
    npm run build
    npm run test
    npm run -w server db:migrate:deploy
    npm run -w server db:migrate:deploy   (repeat, no pending migrations)
    npm run -w server db:migrate:status
    node --env-file=.env scripts/ratingMigrationInventory.cjs
    node packages/web/scripts/per-mode-ratings-smoke.mjs
    git diff --check
    ```

    DB deployment/tests explicitly used the task-owned local loopback test DB.
    Each suite was run as `npx tsx packages/server/src/tests/<suite>.integration.test.ts`:
    perModeRatings, perModeMigration, database, rating, leaderboard, matchmaking,
    matchTypes, profile, auth, playerStatistics, matchHistory and replay.
    Additional focused web tests ran during implementation, followed by full npm test.

22. **Results.** All final required checks exit 0: Prisma generation/validation,
    server/web TypeScript, ESLint (0 errors, 0 warnings), full workspace build,
    full npm test, all 12 DB suites, browser smoke and git diff check. Frontend tests:
    auth 31, profile 12, matches 15, statistics 15, leaderboard 12, matchmaking 7,
    shell 18, ranks 14, figures 9, replay 10: **143 passed, 0 failed**. Rules,
    boundaries and server suites also pass. Build retains the existing Vite CJS,
    old Browserslist-data and large-chunk advisories; they are not ESLint warnings.
    Initial development failures were corrected; final runs are the reported result.

23. **Verification limits.** No production migration/deployment or real legacy DB
    inventory succeeded. Browser automation used local Playwright because this
    session has no node_repl execution tool for the in-app browser. Browser rating,
    leaderboard, public-profile/statistics and lobby services use real PostgreSQL;
    authentication and own-profile delivery are fixtures. Draft completion is a
    fixture-persisted canonical result through the real RatingService, not a claim
    that a human played a complete Draft game in the browser. Full legal matches
    and deterministic replay are covered by existing DB suites.

24. **Deferred scope.** Historical reconstruction pending proven evidence; production
    deployment remains an operator release step. No new chart, promotion animation,
    season/reset, placement system, average/global rating, separate thresholds/artwork,
    decay, hidden MMR or cross-mode skill transfer was introduced.

Logs are `.tmp/per-mode-*.log`; the successful browser screenshots are in
`packages/web/test-results/per-mode-ratings/`. Browser verification includes
three Play medals/ratings and actual queue ratings, a 390px mobile layout, three
leaderboards with URL reload, own/public profiles, real Draft lobby gap and Start,
and persisted Draft result isolation. No captured page errors or horizontal overflow.

The task-owned container and its disposable test databases were removed after
verification. Both `fate_modes_test` and a fresh `fate_modes_final_test` were used;
the latter received the final DB suites and browser checks. Screenshots/logs remain.
