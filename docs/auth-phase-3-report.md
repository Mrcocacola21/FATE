# Phase 3 — Authentication Frontend + Session Management

Implemented account authentication alongside the existing FATE game runtime. User identity remains
independent of GameRoom, P1/P2, spectators, seats, permissions and gameplay resume tokens.
The Phase 2 backend contract, Prisma schema and migrations were not changed during this phase.
Existing uncommitted Phase 2 work was preserved.

## Files added and changed

Added under `packages/web/src`:

- `api/config.ts`: shared existing API/WebSocket environment configuration.
- `api/client.ts`: typed HTTP client, credentialed requests, timeout and safe structured errors.
- `api/authApi.ts`: actual backend DTO validation and register/login/refresh/logout/me wrappers.
- `api/authenticatedClient.ts`: bearer credentials, refresh recovery and one retry.
- `auth/types.ts`, `auth/createAuthStore.ts`, `auth/authStore.ts`: safe identity types and isolated session state.
- `auth/refreshLock.ts`, `auth/safeReturnTo.ts`, `auth/errorMessage.ts`: cross-tab serialization, safe internal navigation and localized errors.
- `auth/RequireAuth.tsx`, `auth/SessionStatus.tsx`: protected content and loading/retry state.
- `auth/AuthLayout.tsx`, `auth/AuthForm.tsx`, `auth/AccountControl.tsx`: forms, existing visual language and minimal navigation controls.
- `pages/LoginPage.tsx`, `pages/RegisterPage.tsx`, `pages/AccountPage.tsx`.
- `auth/session.test.ts`, `auth/components.test.tsx`: focused lifecycle and React tests.

Also added `packages/web/scripts/auth-smoke.mjs`, `packages/web/vercel.json` and this report.
Changed App/main for routing/bootstrap, api.ts to reuse the shared environment configuration,
Lobby for account controls, English/Ukrainian locale trees, README, package manifests and lockfile.
React Router and React 18 test-renderer/types were added; no new global state framework was added.
The touched Lobby also removes an already-unused import and declares its stable translation dependency.

## Routing, session and token strategy

React Router BrowserRouter handles `/login`, `/register` and `/account`. Existing internal Lobby,
Figure Set, Heartbreak, Game and VFX-preview behavior remains intact. The game runtime stays mounted
while account routes are displayed; its wrapper uses display:contents when visible to preserve layout.
Vercel rewrites allow direct auth-page URLs without rewriting asset/game routes. Other static hosts
must serve index.html at the three auth routes.

The dedicated Zustand auth store has initializing/authenticated/unauthenticated/unavailable states,
safe user, memory access token, initialized flag, safe error and an orthogonal submit operation.
It does not use persistence or devtools middleware and does not import the game store. Access tokens
are never stored in localStorage, sessionStorage, IndexedDB, JavaScript cookies, URLs or history state.
Refresh tokens remain in the server-owned HttpOnly cookie and are never read by application JavaScript.

Bootstrap is shared across StrictMode mounts: one refresh request, then /me, then authenticated state.
A normal INVALID_REFRESH_TOKEN/UNAUTHORIZED 401 means unauthenticated. Network/server/malformed-response
failures remain explicit and retryable rather than being silently treated as a missing session.
Protected routes show session loading/retry until the outcome is known, then redirect guests to
login with a validated internal returnTo; authenticated users see account content.

Authenticated requests attach the access token and recover only from 401 UNAUTHORIZED. They await
one shared refresh operation and retry the original request once. A delayed original 401 uses a token
that another request already refreshed. A repeated 401 is final and clears the session. Ordinary
400/403/404/409/500 errors and login/register/refresh/logout endpoints never enter this interceptor.
Requests are not retried under a different newly signed-in account.

Within a tab, refresh is single-flight. Web Locks serializes refresh-cookie mutations across same-origin
tabs, including login, registration and logout; unsupported browsers fall back to single-tab single-flight.
Operation versions prevent late bootstrap/login/refresh replies from restoring state after logout.
All auth HTTP calls use credentials:include and the existing VITE_API_URL; VITE_WS_URL behavior is retained.

## Forms, account controls and errors

Login has email/password; registration has username/email/password/confirmation. Password confirmation
is frontend-only. Forms use accessible labels, appropriate input types/autocomplete, native validation,
localized errors, focus on error, responsive layout and a synchronous double-submit guard. Username
length/characters and registration password length mirror the backend; passwords are never trimmed.
Registration signs the user in immediately. Safe internal destinations are restored after sign-in;
external/protocol-relative and malformed destinations are rejected.

Account shows only username, email, optional display name, creation date, refresh identity and sign out.
Lobby account controls are subtle and appear under existing Settings on mobile. Existing theme and
language infrastructure is reused, with identical added locale keys in English and Ukrainian.
Error codes map to useful translated messages; raw server diagnostics/JSON/tokens are not displayed.

Logout clears local identity immediately and attempts server revocation/HttpOnly-cookie clearing.
Network failure does not leave protected content visible; it displays a retry message on the login
page and Lobby. Because JavaScript cannot delete an HttpOnly cookie, a failed server logout cannot
guarantee that the session will not return after reload; the UI explicitly asks to retry before reloading.
Successful logout and subsequent reload were verified against the real backend.

## Tests and verification performed

25 focused tests cover rendered fields and correct payloads, confirmation mismatch, duplicate errors,
double submission, login/registration state, protected-route loading/redirect/content, logout and failed
logout feedback, bootstrap success/no-session/infrastructure failure/retry, late response invalidation,
one-retry behavior, same-tab single-flight, delayed 401, refresh failure/no recursion, account-switch
safety, ordinary errors, real DTO parsing, safe error handling, Web Locks/fallback and returnTo.

| Command actually executed | Result |
| --- | --- |
| `npm install` | Passed, including the existing rules postinstall build. |
| `npm install -w web react-router` | Passed. |
| `npm install -w web -D react-test-renderer@18 @types/react-test-renderer@18` | Passed. |
| `npm run -w web typecheck` | Passed. |
| `npm run -w web build` | Passed with explicit build-only VITE_API_URL/VITE_WS_URL; existing large-chunk warning remains. |
| `npm run build` | Passed rules/server builds, frontend typecheck and production Vite build. |
| `npm run test` | Passed rules, boundary and server suites plus the new frontend auth suite; the root script now includes test:auth. |
| `npm run -w web test:auth` | 25 passed, 0 failed, 0 skipped. |
| `npm run -w server db:migrate:deploy` | Existing two migrations applied to isolated PostgreSQL 16 database fate_phase3_test. |
| `npm run -w web test:auth:e2e` | Passed the real Chromium/HTTP/Prisma/PostgreSQL lifecycle and all eight reported browser groups. |
| All web `*.test.ts`/`*.test.tsx` through `tsx --test` | 306 passed, 4 failed, 0 skipped, 310 total. The same four failures reproduced in an untouched HEAD source snapshot. |
| `npm run -w web test:i18n` | Locale-key equality passed; existing direct-English-label scanner failed on three unchanged legacy strings. |
| Untouched HEAD `tsx --test src/store.selection.test.ts src/i18n/i18n.test.ts` | 12 passed, 4 failed, 16 total; exactly the failures seen in the expanded current web run. |
| `npm run lint` | 3095 errors, 14 warnings, all remaining diagnostics in pre-existing code. |
| Targeted `npx eslint` on every added/modified web TypeScript file | Passed, zero diagnostics. No rules disabled. |
| `git diff --check` | Passed. |

The four existing expanded-web failures are: the i18n scanner finding Board's BL label, PendingBoardNotice's
Mongol Charge label and a Players test-fixture title; two store-selection deep equality assertions
differing by an undefined useSource property; and a board-UI test calling a React hook outside a renderer.
Those gameplay files/assertions were not edited or weakened to make this phase pass.

## Real browser flows and limits

The browser smoke uses installed Edge/Chromium through the existing playwright-core dependency,
with its own backend/Vite processes, random test credentials and a dedicated disposable PostgreSQL 16
container/database. Only its generated accounts are removed. No development/production database was
reset or modified. Full-stack/browser checks were supported and executed.
The disposable database container was stopped and automatically removed after verification.

Verified through real browser UI/API/database:

- Guest direct /account redirects only after initialization; StrictMode sends one bootstrap refresh.
- Registration signs in immediately and returns to the intended account page.
- Browser cookie is HttpOnly/path-scoped; application storage contains no JWT.
- F5 restores /account through refresh rotation and /me.
- Two tabs recover expired access tokens without refresh reuse revoking the session.
- Logout clears the cookie and revokes the session; reload remains unauthenticated.
- Login works against the real endpoint; Lobby account identity is displayed.
- Mobile account/forms fit at 390px; Ukrainian labels render.
- A guest creates a room and joins as P1.
- Subsequent login/logout preserves that room, P1, resume data and the same active WebSocket.

Visual QA inspected generated registration and mobile-account screenshots. Other screenshots are in
the ignored packages/web/test-results/auth directory. There was no interactive in-app manual session:
the browser-use skill's required Node REPL tool was unavailable, so the existing Playwright path performed
the UI flows instead. No production Vercel/Render deployment was contacted or changed.

Automated policy review rejected deletion of the temporary baseline directory with the reason
"blocked by policy". The ignored .tmp/phase3-baseline snapshot remains for comparison.

Profile editing, avatar upload, public profiles/statistics, password recovery/email verification, OAuth,
MFA, RBAC/admin UI, persistent matches/history, ratings/leaderboards, matchmaking, device management and
User-to-GameRoom integration remain deferred as requested. Account/session infrastructure is ready for
the later User Profiles phase.

References used for the new infrastructure: [React Router](https://reactrouter.com/start/declarative/routing),
[Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
