# Phase 4 — User Profiles

Implemented persistent own/public profiles and editing through the existing authentication, API client,
router, Prisma and UI conventions. Gameplay identity remains independent.

## Files

Added:

- Server: `src/profile/{dto,schemas}.ts`, `src/repositories/profileRepository.ts`,
  `src/services/profileService.ts`, `src/routes/{profileRoutes,apiErrorHandler}.ts`,
  `src/tests/{profile.test,profile.integration.test}.ts`.
- Database: `packages/server/prisma/migrations/20261002020000_profile_preferences/migration.sql`.
- Web: `src/api/profileApi.ts`, `src/pages/{ProfilePage,PublicProfilePage}.tsx`, `src/theme.ts`,
  `src/profile/{types,createProfileStore,profileStore,errorMessage,store.test}.ts`,
  `src/profile/{Avatar,ProfileForm,ProfileSync,components.test}.tsx`.
- This report.

Changed:

- Root `package.json`, server/web `package.json`: include focused profile tests and database/browser commands.
- Prisma schema: typed preference enums and two Profile fields.
- Server auth schemas/errors, auth routes, route registration, repository exports: reuse username validation
  and the existing safe HTTP error mapping.
- Web App routes, account navigation, auth component tests, language/theme controls, EN/UK locales,
  Vercel rewrites, browser smoke suite.
- README: profiles, API/privacy/settings behavior, route compatibility and verification commands.

Removed `packages/web/src/pages/AccountPage.tsx`. The old `/account` URL redirects to `/profile`.
No dependencies were added; no gameplay/rules/WebSocket source files or earlier migrations were changed.

## Data and API

Existing Profile fields remain `userId`, unique `username`, nullable `displayName`/`avatarUrl`,
`createdAt`, `updatedAt`. Added:

- `preferredLanguage: ProfileLanguage`, values `en | uk`, default `en`.
- `preferredTheme: ProfileTheme`, values `light | dark`, default `light`.

The incremental migration is `20261002020000_profile_preferences`. It preserves existing rows,
handles and sessions. Existing database column widths remain unchanged; request validation supplies
the phase's narrower editable limits.

Architecture: `profileRoutes -> ProfileService -> ProfileRepository -> Prisma -> PostgreSQL`.
Repositories perform persistence queries; the service normalizes/validates updates, maps DTOs and
translates database uniqueness violations. HTTP/authentication stays in route middleware.
Registration's existing nested transaction creates exactly one Profile with the account/session.
Legacy users without profiles receive a deliberate `404 USER_NOT_FOUND`; importers/fixtures must
create their profiles explicitly.

| API endpoint               | Behavior                                                               |
| -------------------------- | ---------------------------------------------------------------------- |
| `GET /api/profile`         | Authenticated owner, derived exclusively from verified JWT `sub`.      |
| `PATCH /api/profile`       | Partial updates to the same owner, with strict validation.             |
| `GET /api/users/:username` | Public exact, case-sensitive username lookup; 404 for missing handles. |

Successful responses use `{ profile }`. Public DTO: `id`, `username`, `displayName`,
`avatarUrl`, `createdAt`. Own DTO adds `email`, `preferredLanguage`, `preferredTheme`,
`updatedAt`. Account creation date comes from `User.createdAt`; update metadata comes from Profile.
Credentials, sessions and internal entities are never serialized. Public DTOs exclude email/preferences.
`/api/auth/me` retains its existing small identity contract; JWT payloads remain unchanged.

Errors retain `{ error: { code, message } }`: `INVALID_REQUEST` (400), `UNAUTHORIZED` (401),
`USER_NOT_FOUND` (404), `USERNAME_ALREADY_TAKEN` (409), `INTERNAL_ERROR` (500),
`DATABASE_UNAVAILABLE` (503), with existing auth configuration errors where applicable.

## Editing and frontend behavior

- Protected `/profile` displays avatar, handle/name, email, account creation date and preferences.
  Edit/save/cancel work without reloading, with loading, retry, validation/conflict and success states.
- Public `/users/:username` displays only public data, handles loading/not-found/retry and reloads the
  target on client-side username navigation. Vercel rewrites support both routes.
- Usernames share the registration validator: trimmed, case-sensitive, 3–32 ASCII letters, digits,
  underscores or hyphens. PostgreSQL's unique constraint arbitrates racing claims. Unchanged handles
  succeed; a renamed user's old URL returns 404.
- Display names support Unicode/spaces, trim to null when empty and have a 64-character limit.
  Avatars accept HTTP/HTTPS URLs up to 2048 characters; null/empty values clear them. Unsafe schemes
  are rejected. Image failures and unsafe legacy URLs show initials, with no referrer sent on image requests.
- PATCH sends only changed fields from the form. Absent fields stay untouched, explicit null clears
  nullable fields, and unknown fields—including identity/credentials—are rejected.
- Guests retain local preferences/system-theme fallback. Once authenticated profile data loads,
  persisted EN/UK and light/dark values take precedence. Profile editing and existing global controls
  persist preferences through the API before applying them. UI caching remains in localStorage;
  access tokens remain memory-only.
- Successful edits update presentation fields in the existing auth state. The profile store guards
  account/session changes and stale reads, shares concurrent loads, prevents duplicate saves and
  clears private profile state on logout. Existing refresh/retry handles expired access tokens.
  No replacement login/JWT or profile-specific refresh mechanism is introduced.

## Verification

Executed repository commands:

```text
npm install
npm run -w server prisma:generate
npm run -w server db:validate
npm run -w server db:migrate:deploy
npm run -w server build
npm run -w web typecheck
npm run -w web build
npm run build
npm run test
npm run lint
npm run -w server test:profile
npm run -w server test:profile:db
npm run -w server test:auth:db
npm run -w server test:db
npm run -w web test:profile
npm run -w web test:auth
npm run -w web test:profile:e2e
npm run -w web test:i18n
```

Production builds used local fixture `VITE_API_URL`/`VITE_WS_URL` values. Database tests/migrations
used an isolated PostgreSQL 16 Docker container and explicitly named test database.
The first two committed migrations were applied before creating a legacy account/profile/session;
the new migration was then applied and a database read confirmed the original username, display
name, avatar, creation date and session hash/revocation state survived, with EN/light defaults.

| Check                                                     | Result                                                                                              |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Install, Prisma generation/validation                     | Passed.                                                                                             |
| Incremental migration and legacy data preservation        | Passed against isolated PostgreSQL.                                                                 |
| Server/web and root production builds, web typecheck      | Passed.                                                                                             |
| Root `npm run test`                                       | Passed (exit 0): rules/boundaries, all server suites, 25 auth tests and 11 profile tests.           |
| Backend profile unit/security tests                       | Passed.                                                                                             |
| Backend PostgreSQL profile tests                          | Passed, including simultaneous username claims: exactly one 200 and one 409.                        |
| Auth PostgreSQL and database foundation integration tests | Passed.                                                                                             |
| Frontend profile tests                                    | 11 passed, 0 failed.                                                                                |
| Frontend auth regression tests                            | 25 passed, 0 failed.                                                                                |
| Real-browser auth/profile smoke                           | Passed.                                                                                             |
| Whole-repository lint                                     | Failed: 3086 errors, 14 warnings; baseline HEAD has 3095 errors, 14 warnings. Zero new diagnostics. |
| Additional i18n suite                                     | 4 passed, 1 failed, identical to baseline HEAD. Locale-key parity passes.                           |

Lint diagnostics were compared by file, rule, message and severity against an archive of the original
HEAD. The extra i18n source-label check finds the same existing strings in both snapshots:
`components/Board.tsx` (“BL”), `PendingBoardNotice.tsx` (“Mongol Charge”) and
`SidePanelTabs.test.tsx` (`title="Players"`). These existing failures remain visible and were not
silenced or fixed by changing unrelated gameplay.

The Playwright smoke suite actually verified registration/login/logout, `/account` redirect,
protected `/profile`, F5 restoration, edit/cancel, username/display-name/avatar persistence,
unsafe avatar rejection, image failure/clear fallbacks, saved language/theme after reload and via
global controls, public direct navigation/reload/privacy/old-handle 404, expired-access recovery,
cross-tab refresh serialization and mobile overflow. It also created an unauthenticated room,
joined P1 and verified login/logout preserve the room, resume data and active WebSocket.
Desktop own-profile and mobile own/public-profile screenshots were visually inspected.

No human-driven manual browser session or deployed Render/Vercel validation was performed.
Production rewrite/cookie configuration was inspected locally; real-browser flows used local servers.
Build output retains existing bundle-size/tooling warnings.

## Deferred scope

User/Profile identity remains separate from GameRoom P1/P2/spectator seats. Match/room integration,
history, statistics, ratings, leaderboard, social features, messaging, avatar uploads/storage, RBAC,
email/password changes and account deletion remain deferred. There are no placeholder UI sections.
