# FATE application shell implementation report

Implemented on 3 October 2026.

1. **Original problems.** `Lobby.tsx` combined branding, account/logout, preferences, feature navigation, rules, developer tools, creation, direct joining and room discovery in approximately 650 lines. Figure Set and Heartbreak were local screen state rather than router destinations. Profile/history used the standalone auth layout. Heartbreak had no capability guard; test-room visibility initially used the client DEV flag.

2. **Files changed.** The complete implementation is confined to the frontend, test scripts, workspace test command and this report:

   - `packages/web/src/App.tsx`, `main.tsx`, `components/Lobby.tsx`
   - `packages/web/src/layout/AppShell.tsx`, `Sidebar.tsx`, `AccountMenu.tsx`, `Capabilities.tsx`, `app-shell.css`, `AppShell.test.tsx` (new)
   - `packages/web/src/lobby/RoomBrowser.tsx`, `RoomConnectionDialog.tsx`, `Lobby.test.tsx` (new)
   - `packages/web/src/ui/Dialog.tsx` (new), `TacticalIcon.tsx`
   - `packages/web/src/pages/ProfilePage.tsx`, `FigureSetPage.tsx`, `Heartbreak.tsx`
   - `packages/web/src/i18n/locales/en.ts`, `uk.ts`
   - `packages/web/scripts/app-shell-smoke.mjs`, `app-shell-server.ts` (new)
   - `packages/web/scripts/auth-smoke.mjs`, `match-history-smoke.mjs`
   - `packages/web/package.json`, root `package.json`
   - `docs/app-shell-refactor.md` (new)

3. **AppShell architecture.** A shared `AppShell` wraps application content, with a single `CapabilitiesProvider` above it. The existing React Router remains authoritative. Its existing mounted-game-runtime arrangement is preserved: navigating away hides the game runtime while the current page renders alongside it. This avoids unmounting the game and replacing its connection. Login/register select the existing standalone `AuthLayout`; game/preview pages select immersive content. No global state library was added.

4. **Sidebar structure.** Compact FATE branding; Play, Figure Set, Match History and Profile; a separated Rules/Settings group; capability-gated DEV tools; bottom account block. The existing SVG `TacticalIcon` solution was extended. No future/disabled navigation items were added. History details/public history keep History active; public profiles keep Profile active. Active links use `aria-current="page"`, a crimson edge and restrained raised surface.

5. **Desktop behavior.** A fixed compact 232px sidebar leaves the content dominant. Its navigation scrolls when vertical space is limited; account controls stay at the bottom. Main pages use sensible maximum widths. The optional collapse feature was omitted in favor of the explicitly permitted fixed compact sidebar.

6. **Mobile behavior.** At 900px and below, the desktop sidebar is hidden and a compact FATE/menu bar opens a drawer. The drawer exposes the same navigation/account/actions, traps keyboard focus, closes on Escape/backdrop/navigation, locks background scrolling and restores its opener. Content becomes inert while the drawer is open. Opening Settings/Rules from the drawer lets drawer focus restoration finish before the new dialog takes focus. Reduced-motion preferences are respected.

7. **Lobby simplification.** Play now has a compact introduction, Create Match / Join by ID actions and a full-width room browser. Its giant branding hero, account/navigation controls, preference controls and permanent creation/direct-join panels were removed. An actionable restrained empty state and secondary Refresh remain. Room rows retain real IDs, phase, mode, seats, readiness and spectator counts.

8. **Create Match UX.** Create Match opens the shared room dialog. It offers the existing role options; game mode remains selected through the existing in-room flow. Submission uses the existing `joinRoom({ mode: "create", ... })` API. No invented configuration was added.

9. **Join by ID UX.** A focused dialog contains room ID and role; room-row actions use this same flow with a fixed ID, suggested role and occupied seats disabled. Full/active rooms default to spectator. Both local failures and asynchronously received WebSocket join errors remain visible inside the dialog. Switching routes closes the Lobby dialog, including login redirects.

10. **Account/settings refactor.** The account block reuses Avatar, auth identity, session state and logout. Sign out is available inside the account menu. Guest accounts get Sign in/Create account links. Settings reuses `LanguageSwitcher`, `ThemeToggle`, `changePreference`, the profile store and existing theme/i18n persistence. The redundant Profile logout/history buttons and Figure Set/Heartbreak preference controls were removed.

11. **Rules placement.** Rules is a secondary sidebar action opening the existing `RulesModal`. Its Markdown content and dialog behavior were reused; the component is loaded lazily.

12. **Heartbreak/test-room capability behavior.** The actual server contract is `{ testRooms: { enabled, requiresToken } }`. Only explicit `enabled === true` exposes the sidebar DEV section. Loading, false and failed requests render no Heartbreak control. Direct `/heartbreak` access waits for capabilities and redirects to Play when unavailable/disabled. Test-room creation uses the same capability state and existing debug-token requirement.

13. **Capability loading/reuse.** One shared request to `/api/capabilities` supplies the provider and all consumers. The request is shared across React StrictMode effect replay and provider consumers. There is no hostname/production detection, optimistic development flag or separate Lobby fetch. A failed request resolves UI state to disabled tools; reloading can retry.

14. **Active-game layout.** The application sidebar is omitted while viewing the current room/game. The existing full-width board/HUD and mobile game navigation remain intact. Browser checks verified that a profile round trip preserves the real room WebSocket with no extra connection or closure.

15. **Public-route behavior.** Existing `/`, `/login`, `/register`, `/account`, `/profile`, `/users/:username`, `/matches`, `/matches/:id`, `/users/:username/matches` behavior is preserved. `/profile` and own `/matches` retain their existing auth guards; public profiles, public history and details remain public. `/account` still redirects to `/profile`. `/figures` and capability-gated `/heartbreak` provide router destinations for the existing feature implementations. The existing Vercel catch-all rewrite already supports direct SPA URLs and was left unchanged.

16. **Tests added/updated.** Nine shell/Lobby component tests cover primary/active navigation, navigation changes, account identity/profile/logout, persisted language/theme controls, immersive/auth layouts, one capability request, DEV/Heartbreak DOM absence/presence, dialog-only forms, create/join payloads, spectator names, occupancy and asynchronous errors. `test:shell` is included in root `npm run test`. Existing database browser scripts now open the account menu/settings and submit the new creation dialog. The new database-free browser scenario covers public access, focus trapping/restoration, mobile drawer-to-settings transitions, guest player redirects, actual authenticated normal creation, test creation, public spectating and connection preservation.

17. **Visual review.** Screenshots were captured and inspected for Play at 1920×1080 and 1366×768; tablet Play/drawer at 768×1024; mobile Play/drawer/settings and gameplay at 390×844; desktop History, Profile and Figure Set; create/join/settings/Rules dialogs; public profile/details; enabled/disabled test UI; populated room browser; normal room and active test battle; spectator view. Artifacts are in `packages/web/test-results/app-shell/` (gitignored).

18. **Commands executed.** Final checks used `npm run -w web typecheck`, `npm run lint`, `npm run build`, `npm run test`, `npm run -w web test:shell`, `npm run -w web test:i18n`, `npm run -w web test:mobile`, `npm run -w web test:shell:e2e`, `git diff --check`, targeted Prettier formatting and `node --check` for both updated database browser scripts.

19. **Results and limits.** Typecheck passed. Lint passed with **0 errors / 0 warnings**. Full workspace build passed; Vite emits CJS API, Browserslist age and large-chunk advisory messages. Full workspace tests passed, including rules/boundaries/server and frontend auth (31), profile (11), matches (15), shell/Lobby (9). Additional i18n tests passed (5), mobile tests passed (62), and the browser smoke passed with no captured page errors. Build/test/lint logs are in `.tmp/app-shell-checks/`. The existing PostgreSQL-backed auth/history/multiplayer browser suites were not run because `TEST_DATABASE_URL` is not set. The new browser suite uses mocked account/profile/history responses and the existing server in-memory persistence/identity test doubles with real room/WebSocket handlers; it does not establish production database/auth integration results.

20. **Deliberately unchanged.** Backend source, game rules, WebSocket message handling, authentication contracts, room lifecycle, reconnect logic, match persistence, game modes, history filters/pagination, Figure Set editing/storage, Rules content, database schemas/migrations, deployment commands, secrets and Vercel configuration. No future features or preference system were introduced.
