# Admin UI implementation report

Implemented on 2026-10-04 in the existing FATE workspace. Pre-existing backend,
RBAC, auth DTO and test changes were preserved. This report describes only the
administration interface work and its small additive backend rank field.

1. **Frontend architecture found.** React 18, React Router 7, Vite, Zustand auth
   state, a shared AppShell/Sidebar, RequireAuth session guard and authenticated API
   client with token refresh. Gameplay runtime is preserved while account routes
   mount separately. Shared Dialog, focus trap, buttons/theme tokens, pagination,
   TacticalIcon and RankEmblem already existed. Supported locales are en/uk.

2. **Admin contracts found.** The working tree already contained summary, user
   list/detail, block/unblock, role PATCH, match list/detail and action-history GET
   endpoints. Role/status are loaded authoritatively from the database. Pagination
   uses items and page/limit/total/totalPages. Search/filter/sort whitelists and
   domain errors were read from the actual schemas, repository, DTOs and policies.
   See [contract details](admin-ui.md#data-contracts).

3. **Files added/changed by this work.** Added `packages/web/src/admin/` with
   `types.ts`, `decoders.ts`, `api.ts`, `policy.ts`, `query.ts`,
   `useAdminResource.ts`, `components.tsx`, `AdminLayout.tsx`,
   `AdminOverviewPage.tsx`, `AdminUsersPage.tsx`, `AdminUserPage.tsx`,
   `ModerationDialog.tsx`, `AdminMatchesPage.tsx`, `AdminMatchPage.tsx`,
   `AdminActionHistory.tsx`, `admin.css`, `locales.ts`, `fixtures.ts`,
   `api.test.ts`, `components.test.tsx`. Added
   `packages/web/scripts/admin-smoke.mjs`,
   `packages/server/src/tests/adminUiRating.test.ts`, `docs/admin-ui.md`, and this
   report. Integrated through web `App.tsx`, `layout/Sidebar.tsx`, `main.tsx`, both
   locale files, root/web/server package scripts and README. Added `rankTier` in
   the existing server `services/adminService.ts` user-detail DTO.

4. **Routes.** Nested `/admin` with index overview, `users`, `users/:userId`,
   `matches`, `matches/:matchId`. Unknown administration children return to overview.

5. **Access guard.** RequireAuth resolves the session before RoleGuard permits
   MODERATOR/ADMIN. USER sees access denied without a child page mounting or an
   admin request. Session/role changes remount the feature to clear old data. A
   revoked access revision immediately closes the area and invalidates late
   responses, even if current-user refresh fails. ACCOUNT_BLOCKED signs out.

6. **Sidebar.** One role-gated Admin link in the secondary/system area, with active
   state covering all nested routes. Shared desktop/mobile navigation uses it.

7. **Overview.** Six actual metric cards, compact role/mode/lifecycle lists and
   backend-provided recent activity windows. Links lead to filtered lists. No fake
   trends, system-health percentages or decorative analytics.

8. **Users.** Server-paginated semantic table with identity, role, state, creation
   time and a View link. Search is explicitly submitted and supports the actual
   backend name/username/exact-ID search. No client-only dataset filtering.

9. **Query/pagination.** URL state restores page, filters, sorting and page size.
   Filter changes reset page; 20/50/100 are the bounded UI sizes. Backend enum
   values remain unchanged; lowercase account status and mode/type/participant
   URL aliases are normalized. Obsolete requests cannot overwrite current data.

10. **User details.** Human identity, role/state, timestamps, block date/reason,
    safe email only when supplied, match count, secondary ID and filtered match
    navigation. Three compact mode rating rows reuse shared presentation.

11. **Block/unblock.** Shared focus-trapping confirmation dialog. Optional plain
    text reason is capped at the backend's 500 characters. Pending submissions
    disable duplicate actions and closing. Only successful server responses update
    state; the page announces success. Unblock explains that old revoked sessions
    do not automatically resume.

12. **Role changes.** ADMIN-only deliberate selection and confirmation. Self-role
    changes are absent; blocked accounts only allow demotion to USER where useful.
    Backend last-admin protection appears as a controlled dialog error. Neutral
    bronze confirmation avoids treating role changes as red destructive actions.

13. **Permission-aware controls.** Moderators can moderate only USER. Admins can
    moderate USER/MODERATOR. ADMIN blocking and self-blocking are absent. The
    frontend mirrors the inspected policy; backend authorization still decides.

14. **Matches.** Paginated list with status/mode/Casual-Rated filters, sort/order,
    exact match/participant lookup and creation/finish date ranges. UUID formats
    and reversed date ranges are checked before submit. API queries use the
    backend's real names; UTC date windows and Kyiv display time are explained.

15. **Match details.** Read-only lobby, participants, status, mode/type, origin,
    timestamps, winner/result, duration/turns, final/durable/latest-action revisions,
    rating processing, action/snapshot counts and latest snapshot metadata. Server
    restart recovery failures receive a concise explanation, without internals.

16. **Action history.** Independent server pagination, ascending/descending
    revision order, actor seat/name, type and timestamp. Actor names use historical
    context and link to current accounts where available. Corrupt payloads remain
    inspectable as metadata only.

17. **Payloads.** Native details disclosure with escaped, wrapping read-only JSON
    in a panel bounded to 260px height. Recursive credential-key exclusion is
    repeated at the frontend boundary. HTML-like payload strings remain text.

18. **IDs.** Detail-only technical rows support clipboard copy and an accessible
    success/failure message. List identities use names/context rather than UUIDs.

19. **Rank presentation.** The existing server `getRatingTier` adds canonical
    `rankTier` to each admin detail rating. Shared RankEmblem and rating formatting
    display Standard 1800/Black Moon, Draft 900/Half and Classic 2050/Destiny.
    Unrecorded modes remain explicitly empty; no client threshold table was added.

20. **Errors.** Network, invalid response/request, auth/access loss, not-found,
    rate limit, self/target policy, blocked-role target and last-admin errors have
    en/uk explanations. Arbitrary backend messages, JSON errors and traces are not
    rendered. Target-policy 403 does not incorrectly sign staff out.

21. **Responsive behavior.** Three/two-column metric grids, wrapping controls and
    metadata, stacked participant panels and card-like table rows below 820px.
    Core actions do not require horizontal scrolling.

22. **Accessibility.** Semantic captions/headers, explicit control names using
    aria-labelledby, labelled pagination, text badges, visible keyboard focus,
    shared dialog trap/Escape/focus restoration, native disclosure and announced
    loading/error/success states. Clipboard failures retain selectable IDs.

23. **Localization.** Every new interface string is supplied in English and
    Ukrainian. Locale-key parity and direct-JSX-label checks pass. Action type
    codes and JSON payload keys are persisted data, retained for inspection.

24. **Tests added.** 25 frontend API/component tests cover routing/sidebar roles,
    summary accuracy, query restore/filter reset/pagination, loading/empty/errors,
    hierarchy, confirmed block/unblock/role changes and failures, last-admin error,
    safe field selection, ranks/IDs, read-only match/actions and request races.
    One backend service regression verifies canonical per-mode rank mapping.
    The existing five backend admin tests remain green.

25. **Browser review.** Local headless Edge/Playwright fixtures exercise USER,
    MODERATOR and ADMIN, with captures at 1920×1080, 1366×768, 768×1024 and 390×844.
    Overview, Users, User Details, Matches, Match Details, expanded Action History,
    block and role dialogs were captured at all four sizes. Additional captures
    cover empty/error/access-lost states: 35 PNGs under
    `packages/web/test-results/admin/`. Representative captures for every page
    type and all four viewport sizes were visually inspected. All captures pass
    document-overflow checks. Modal Tab trapping/Escape/opener restoration, native
    input names, moderation, search/date filters, UUID/date URL forwarding,
    clipboard copy, reload and stale-role data removal pass. No page JavaScript
    errors occurred. Browser calls use isolated fixtures rather than real accounts.

26. **Commands executed.** `npm run -w web typecheck`, `npm run lint`,
    `npm run build`, `npm run test`, `npm run -w web test:admin`,
    `npm run -w server test:admin`, `npm run -w web test:i18n`,
    `npm run -w web test:admin:e2e`, targeted `npx prettier --write` and
    `git diff --check`. Changed code was checked again after the accessibility and
    confirmation-style refinements; focused tests passed again.

27. **Exact final results.** Web typecheck exit 0; lint exit 0 with 0 errors and
    0 warnings; complete root build exit 0; complete root test command exit 0.
    Focused frontend admin: 25 passed, 0 failed/skipped. Backend admin: 6 passed,
    0 failed/skipped (five existing tests and one new rank regression). i18n:
    5 passed, 0 failed/skipped. Browser smoke exit 0, four viewports, 35 captures,
    0 page JavaScript errors. Diff whitespace check exit 0. Build still reports
    toolchain warnings about Vite's CJS API, Browserslist data age and bundle size;
    these do not fail the build. Node's existing MockTimers experimental warning
    appears in the regression suite.

28. **Limits of verification.** No live PostgreSQL admin integration suite,
    production accounts, deployment, live-browser gameplay walkthrough or
    screen-reader session was run. Existing Play/Lobby/auth/Profile/Leaderboard/
    History/Replay/rank behavior is covered by the passing repository suites.
    Browser API fixtures validate the frontend against inspected current DTOs;
    backend HTTP/policy and service checks validate server behavior separately.

29. **Deliberately separate work.** Audit Log UI, advanced moderation, OpenAPI
    publication and operational observability remain later phases. No GameState,
    action/snapshot/result/rating editing, force-win/draw/finish, user impersonation,
    deletion, SQL console, secrets/logs/filesystem browser or debug sandbox was added.
