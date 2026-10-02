# FATE

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![npm workspaces](https://img.shields.io/badge/npm-workspaces-CB3837?logo=npm&logoColor=white)](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
[![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=1A1A1A)](https://react.dev/)

Deterministic turn-based game stack in a TypeScript monorepo: authoritative rules engine, Fastify + WebSocket server, and Vite + React client.

Follow active progress and implementation notes in the [Developer Log](https://t.me/FATE_Soul_Dev).

## Contents

- [Packages](#packages)
- [Getting Started](#getting-started)
- [Build](#build)
- [Tests](#tests)
- [Environment Variables (Web)](#environment-variables-web)
- [Database Development](#database-development)
- [Persistent Match Lifecycle](#persistent-match-lifecycle)
- [Authentication Backend](#authentication-backend)
- [Authentication Frontend](#authentication-frontend)
- [User Profiles](#user-profiles)
- [Assets (Figure Arts + Tokens)](#assets-figure-arts--tokens)
- [Server API](#server-api)
- [WebSocket](#websocket)
- [Deployment](#deployment)
- [Common Pitfalls](#common-pitfalls)
- [Quick Verify](#quick-verify)
- [Notes](#notes)
- [Developer Log](#developer-log)

## Packages

| Package | Path | Purpose |
| --- | --- | --- |
| `rules` | `packages/rules` | Deterministic game engine (authoritative state updates). |
| `server` | `packages/server` | Fastify + WebSocket game server. |
| `web` | `packages/web` | React client UI. |

## Getting Started

### Install

```bash
npm install
```

### Run Development Stack

```bash
npm run dev
```

This runs:
- `rules` in TypeScript watch mode (emits `dist/`)
- `server` on `http://localhost:3000`
- `web` on `http://localhost:5173`

Note: the server waits for `packages/rules/dist/index.js` before starting to avoid intermittent `Cannot find module ... rules/dist/index.js` crashes during watch startup.

Optional local env file (not required for dev):
- Copy `.env.example` to `.env` if you want to pin API/WS URLs.

### Dev Flow: Two Tabs, Same Room

- Open `http://localhost:5173`
- Create a room in the Lobby and copy the room id
- Join as P1 in the first tab
- Open a second tab and join the same room as P2 (or spectator)

## Build

```bash
npm run build
```

## Tests

```bash
npm run test
npm run -w web typecheck
```

## Environment Variables (Web)

The frontend reads these at build time. In production builds they are required and the build will fail fast if missing:

- `VITE_API_URL` (example: `https://your-render-app.onrender.com`)
- `VITE_WS_URL` (example: `wss://your-render-app.onrender.com/ws`)
- `VITE_ENABLE_TEST_ROOM=true` - shows the Test Room creator when the server also allows it. Local Vite development enables the entry automatically.

Local defaults are provided in `.env.example`.

## Environment Variables (Server)

- `WEB_ORIGIN` - allowed browser origin for CORS and WebSocket Origin checks, for example `https://your-app.vercel.app`.
- `FATE_DEBUG_TOKEN` - production-only token for debug REST game views/actions/logs. Send it as `X-FATE-DEBUG-TOKEN: <token>`.
- `ENABLE_TEST_ROOMS=true` - enables authoritative Test/Sandbox rooms. Development enables them by default unless explicitly set to `false`; production requires this flag and a matching `FATE_DEBUG_TOKEN` when creating the room.
- `ROOM_TTL_MS` - idle room TTL before cleanup. Default: `86400000` (24 hours).
- `MAX_ROOMS` - maximum in-memory FATE rooms retained. Default: `100`.
- `MAX_LOG_EVENTS` - maximum action log entries retained per room. Default: `5000`.
- `WS_MAX_PAYLOAD_BYTES`, `WS_RATE_LIMIT_WINDOW_MS`, `WS_RATE_LIMIT_MAX_MESSAGES`, `RECONNECT_GRACE_MS` - WebSocket payload, rate, and reconnect controls.
- `DATABASE_URL` - PostgreSQL connection string required for normal room creation and durable match metadata. Health endpoints and Test/Sandbox rooms work without it; gameplay authentication remains optional.

Local development keeps debug REST endpoints open when `NODE_ENV !== "production"`. In production, `GET /api/games/:id`, `POST /api/games/:id/actions`, and `GET /api/games/:id/log` require `X-FATE-DEBUG-TOKEN` to match `FATE_DEBUG_TOKEN`. Browser WebSocket connections must use an allowed Origin; missing Origin is accepted for non-browser clients.

## Database Development

The persistence foundation uses PostgreSQL and Prisma inside `packages/server`. Set `DATABASE_URL`
in the environment used by Prisma, for example:

```text
postgresql://fate:fate@localhost:5432/fate?schema=public
```

The game server still starts without this variable. Database access fails with a focused configuration
error only when a repository or an explicit database lifecycle function is used.

For an optional local PostgreSQL 16 instance:

```bash
docker compose -f docker-compose.db.yml up -d
```

From the repository root, use:

```bash
npm run -w server prisma:generate
npm run -w server db:validate
npm run -w server db:migrate:dev -- --name <migration-name>
npm run -w server db:migrate:deploy
npm run -w server db:studio
```

`db:migrate:dev` creates and applies migrations in development. Deployments should use
`db:migrate:deploy` to apply the versioned migrations already committed to the repository.

The optional integration test requires a separately prepared `TEST_DATABASE_URL`. As a safety
guard, its database name or schema must contain `test`; apply migrations to that database before
running `npm run -w server test:db`. The normal test suite does not require PostgreSQL.

### Realtime state versus durable records

`GameRoom` remains the authoritative, in-memory operational state used by REST and WebSocket
gameplay. `Match` stores durable match metadata in PostgreSQL. Normal rooms now create matches
and competitors; actions and snapshots are reserved for later phases.

The persistence dependency direction is `routes / WebSocket -> services -> repositories -> Prisma`.
Auth HTTP routes and room lifecycle projections use services and repositories; rules and ordinary
gameplay actions remain independent of PostgreSQL. Deleting a match cascades its
participants, actions, and snapshots; participant/action/user references become `NULL` if a user is
removed. Rating history survives match deletion, while its required user relation prevents deleting
an identity that still owns rating history. User-owned profile and current-rating rows cascade with
the user.

## Persistent Match Lifecycle

`GameRoom` is the short-lived realtime runtime in RAM: GameState, RNG, sockets, seats, resume
tokens, revision and the current action log. Its only durable reference is `matchId: string | null`.
`Match` is the long-lived PostgreSQL record: room correlation, seed, game mode, participants,
lifecycle timestamps and reliable finish metadata. Room IDs and Match IDs are distinct.

Normal room creation through `/rooms`, `/api/games` or WebSocket stages an in-memory room,
creates one WAITING Match, binds `matchId`, then publishes the usable room. A persistence failure
returns HTTP 503 / WebSocket `MATCH_PERSISTENCE_UNAVAILABLE` and leaves no discoverable room.
Test/Sandbox rooms keep `matchId = null` and never write match or participant records.
Authentication is optional. Creator and participant User IDs remain null because these request
paths do not currently supply verified identity; arbitrary client `userId` values are ignored.

Lifecycle transitions:

```text
WAITING -> IN_PROGRESS -> FINISHED
WAITING -> CANCELLED
```

The accepted authoritative `startGame` starts the match when initiative is requested, even though
GameState still reports `lobby` until setup/placement. Starting a draft alone does not start the
match; the accepted start after the final pick does. Rejected starts do not persist a transition.
The start transaction stores the current game mode and freezes the final seat competitors.

P1/P2 participants use the unique `(matchId, seat)` key. Lobby joins, role switches and reconnects
upsert the seat snapshot; reconnects reuse the row. A lobby departure retains temporary occupancy
until replacement or the start transaction. Once started, historical participant identity and names
are immutable, including during disconnects or later seat replacement. Spectators remain runtime
only. Names use the current room name, fall back to the seat, and are bounded to 100 characters
for the existing column. Profile changes do not rewrite match snapshots.

An accepted action changing the authoritative state to `ended` persists FINISHED, `finishedAt`,
`winnerSeat` and `finishReason` directly from `gameOver` when available. `winnerUserId` remains
null without verified player identity. `finalRevision` means the revision **after the accepted
ending action**, equal to `gameOver.endedAtRevision`; later connection metadata does not alter it.

Permanent cleanup/removal cancels an unstarted WAITING room, including inactive TTL/capacity
eviction. A temporary leave/disconnect does not cancel a match. Active initiative/game rooms stay
IN_PROGRESS if removed; cleanup never fabricates FINISHED. Finished matches retain their results.
`/rooms` lists the current runtime map, without querying persistent match history.

Integration is `routes / WebSocket -> MatchLifecycle -> MatchService -> MatchRepository -> Prisma`.
Store/rules actions remain synchronous. Ordinary moves, attacks, abilities, rolls and turns do no
database reads or writes; only lifecycle transitions and lobby metadata trigger persistence.
The existing per-room command queue serializes runtime changes, persistence and retries; cleanup
protects connected rooms and in-flight commands. PostgreSQL unique keys, conditional transitions
and short parent-lock transactions also arbitrate concurrent repository calls. Repeated start,
finish and cancel calls retain timestamps/results; conflicting terminal results are rejected.

Participant/start/finish/cancel persistence failures log safe room/match/seat identifiers and
preserve accepted runtime state. A small in-memory projection retries every five seconds, in
start-before-finish order, with the original timestamps/result/revision. Reconnect after start
cannot rewrite a failed start snapshot. This retry buffer is process-local: process exit loses
pending work, and shutdown reports outstanding projections. Restart recovery is a later phase.

No GameState, MatchAction or MatchSnapshot writes are implemented. Authenticated seat binding,
action logs, snapshots, replay, restart recovery, history/statistics and ratings remain deferred.
There are no new history endpoints or frontend changes.

Verification uses explicit in-memory persistence injection for the normal runtime test suite,
never a production fallback. Real PostgreSQL integration requires a migrated, isolated
`TEST_DATABASE_URL` whose database/schema has a `test` name segment:

```bash
npm run -w server test:match:db
```

## Authentication Backend

Authentication currently does **not** control FATE GameRoom identity. Rooms, P1/P2, spectators,
WebSocket messages and resume tokens retain their existing behavior. Frontend authentication,
session management and account/game integration belong to later roadmap phases.

Auth requires PostgreSQL with the committed migrations applied and two independently generated
`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` keys (each at least 32 UTF-8 bytes). There are no fallback
keys. Generate each with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Export configuration into the server environment; the server does not automatically load the root
`.env`. Missing/invalid auth configuration fails closed with `503 AUTH_UNAVAILABLE`; missing or
unreachable PostgreSQL yields `503 DATABASE_UNAVAILABLE`. Gameplay authentication remains optional. Normal room creation requires match persistence;
already accepted gameplay continues if PostgreSQL subsequently becomes unavailable.

| Endpoint | Request / behavior |
| --- | --- |
| `POST /api/auth/register` | `{ email, username, password }`; returns 201, safe user and access credentials; atomically creates User, Profile, default Rating and initial AuthSession. |
| `POST /api/auth/login` | `{ email, password }`; returns 200, safe user and access credentials; creates a separate session per login. |
| `POST /api/auth/refresh` | Reads `fate_refresh` cookie; returns 200 with new access credentials and replaces the cookie. No body token. |
| `POST /api/auth/logout` | Revokes only the cookie's session and clears the cookie; returns 204, including missing/invalid/expired credentials. |
| `GET /api/auth/me` | `Authorization: Bearer <access token>`; returns `{ user }` after loading the current account. |

Emails are trimmed and lowercased. Usernames are trimmed, case-sensitive, 3–32 characters and
allow only `A-Z`, `a-z`, `0-9`, `_`, `-`. Passwords are 8–128 characters and are never trimmed.
Passwords use Argon2id with random salts, 64 MiB memory, three passes and one lane. Responses
contain only `id`, `email`, `username`, `displayName`, `avatarUrl`, `createdAt` and access credentials;
passwords, password hashes and session/token hashes are never returned.

Access tokens use HS256 with `sub`, `type=access`, unique `jti`, `iat`, `exp`. Their default lifetime is
900 seconds (`JWT_ACCESS_TTL_SECONDS`). Refresh tokens use a separate HS256 key with `sub`, `sid`,
unique `jti`, `type=refresh`, `iat`, `exp`; default lifetime is 2592000 seconds
(`JWT_REFRESH_TTL_SECONDS`). Each refresh rotates the token and persists only its SHA-256 fingerprint.
Conditional database updates permit exactly one rotation of a credential. Reuse, including concurrent
requests presenting the same old token, rejects the request and revokes that session. Clients must
serialize refresh requests. Rotation preserves the original fixed session expiration; it never slides.
Logout revokes refresh credentials; already issued access tokens remain valid until their short expiry.

The `fate_refresh` cookie is HttpOnly, host-only, scoped to `/api/auth` and expires with the session.
Development uses `Secure=false; SameSite=Lax`; production defaults to `Secure=true; SameSite=None`
for the separate Render/Vercel sites. Override SameSite using `AUTH_COOKIE_SAME_SITE=lax|strict|none`;
`none` requires production HTTPS. Browser privacy settings may still block third-party cookies.
Future browser auth requests must use `credentials: "include"`.

Auth CORS grants credentials only to the exact configured `WEB_ORIGIN` (development defaults to
`http://localhost:5173`). All auth POST endpoints independently reject an untrusted Origin with
`403 FORBIDDEN_ORIGIN`; CORS alone is not the CSRF defense. Originless CLI/native clients are
intentionally supported, while originless requests declaring `Sec-Fetch-Site: cross-site` are rejected.
Existing gameplay CORS and WebSocket Origin policies retain their behavior. Auth responses use
`Cache-Control: no-store`. Process-local rate limits per IP/endpoint are 5 registrations, 10 logins
and 30 refresh requests per minute; excess requests receive `429 RATE_LIMITED`.

Auth errors consistently use `{ "error": { "code": "...", "message": "..." } }`:
`INVALID_REQUEST` (400), `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN` (401),
`FORBIDDEN_ORIGIN` (403), `EMAIL_ALREADY_REGISTERED`, `USERNAME_ALREADY_TAKEN` (409),
`RATE_LIMITED` (429), `INTERNAL_ERROR` (500), `DATABASE_UNAVAILABLE`, `AUTH_UNAVAILABLE` (503).
Unknown email, wrong password and passwordless accounts share the same credentials error.

The regular `npm run test` suite includes password/JWT helpers and HTTP security checks without a
database. Run the lifecycle integration tests against a separately provisioned PostgreSQL test
database or schema with a `test` name segment (for example `fate_auth_test`):

```powershell
$env:TEST_DATABASE_URL = 'postgresql://fate:fate@localhost:5432/fate_auth_test?schema=public'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm run -w server db:migrate:deploy
npm run -w server test:auth:db
npm run -w server test:db
```

The auth integration suite exercises real HTTP, services, repositories and PostgreSQL, including
concurrent registration/refresh, rollback, expiration, reuse revocation, multiple sessions and logout.
It removes only accounts created by that test run, and never truncates or resets a database.

## Authentication Frontend

`/login` and `/register` provide localized English/Ukrainian forms using the existing FATE styles,
themes and language controls. Registration authenticates the account immediately. `/profile` is the
protected profile page; the former session-only `/account` page redirects to `/profile`.
The Lobby navigation includes minimal account controls (under Settings on mobile).

The auth Zustand store is separate from the game store. Access JWTs live only in runtime memory:
they are never written to localStorage, sessionStorage, IndexedDB, JavaScript cookies, URLs or
history state. The server owns the HttpOnly refresh cookie. On application startup, including F5
and a direct `/profile` visit, one `POST /api/auth/refresh` restores access credentials, then
`GET /api/auth/me` loads the current identity. Protected routes wait for this initialization without
redirecting prematurely. Infrastructure failures show a retryable session state; an expected invalid
refresh session becomes unauthenticated. Gameplay remains available while auth initializes or fails.

The typed auth API client uses the existing `VITE_API_URL`, sends `credentials: "include"` and
parses safe DTOs/errors centrally. Authenticated requests attach the memory access token, refresh
after `401 UNAUTHORIZED` and retry once. Refresh failures clear credentials; ordinary errors and
bootstrap endpoints never trigger refresh recursion. One in-flight refresh is shared within a tab.
Where supported, `navigator.locks` serializes refresh, login, registration and logout cookie mutations
across same-origin tabs. Browsers without Web Locks retain single-tab single-flight behavior.

Logout calls the backend and clears local identity immediately, including network failures. A failed
server logout displays a retry message: because JavaScript cannot clear the HttpOnly cookie, server
revocation must succeed to guarantee that a later reload cannot restore that session. Late responses
from previous auth operations cannot undo a local logout. Safe internal `returnTo` paths restore the
intended destination after sign-in; external/protocol-relative destinations are rejected.

`packages/web/vercel.json` provides SPA rewrites for direct auth-page visits. Other static hosts must
serve the frontend entry point for `/login`, `/register`, `/account`, `/profile` and `/users/:username`. Production retains the existing
Render/Vercel cookie and exact WEB_ORIGIN setup documented above; no additional backend URL variable
is needed. Game WebSocket connections and room resume tokens remain independent of account auth.
Authenticated User identity is still **not** connected to GameRoom P1/P2/spectator identity.

## User Profiles

Profiles persist in PostgreSQL through `profileRoutes -> ProfileService -> ProfileRepository -> Prisma`.
Registration already creates exactly one Profile atomically with the User and session. Legacy imports
and fixtures that create users without profiles must supply their own profile explicitly; profile requests
return `404 USER_NOT_FOUND` for a missing profile instead of silently creating one.

| Endpoint                   | Access and behavior                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/profile`         | Bearer access token required; returns `{ profile }` for the verified token's owner.                                                  |
| `PATCH /api/profile`       | Bearer access token required; updates only supplied editable fields and returns `{ profile }`.                                       |
| `GET /api/users/:username` | Public; returns `{ profile }` containing only `id`, `username`, `displayName`, `avatarUrl`, `createdAt`. Unknown handles return 404. |

Own profiles additionally contain `email`, `preferredLanguage`, `preferredTheme`, `updatedAt`.
Neither representation exposes credentials or sessions. The member-since date is always `User.createdAt`;
`updatedAt` describes the profile. Email is visible only on the owner's `/profile` and cannot be edited.
`/users/:username` is public and supports direct navigation/reload through the committed Vercel rewrites.

Editable fields are `username`, `displayName`, `avatarUrl`, `preferredLanguage`, `preferredTheme`.
Username editing uses the registration validator: trimmed, case-sensitive, 3–32 ASCII letters, digits,
underscores or hyphens. The database unique constraint decides concurrent claims; duplicates return
`409 USERNAME_ALREADY_TAKEN`. Keeping one's current username succeeds. Renaming changes the public
URL immediately; no aliases are created for the old handle. Unknown update fields are rejected with
`400 INVALID_REQUEST`. Absent fields are unchanged; explicit `null` or trimmed empty strings clear
display names/avatars. Display names allow Unicode and spaces, up to 64 characters.

Avatars use HTTP/HTTPS URLs up to 2048 characters, with no file uploads/storage. The browser loads them
with `referrerPolicy="no-referrer"`; unsafe legacy URLs and failed images fall back to initials.

Preferences use the existing supported languages (`en`, `uk`) and themes (`light`, `dark`). Migration
`20261002020000_profile_preferences` adds typed fields with safe `en`/`light` defaults to existing rows.
Guests retain local UI preferences and the existing initial system-theme fallback. After authentication,
the profile loads once and persisted preferences take precedence. The profile form and global language/theme
controls save through the profile API before applying the result to existing UI state. LocalStorage remains
a UI preference cache; access tokens remain memory-only. Failed preference saves leave the applied values
unchanged and display an error.

Profile loading/saving uses the existing authenticated client and its single-flight refresh/retry behavior.
Successful edits synchronize the username, display name and avatar in the current auth identity without
new JWTs or signing in again. Profile state is cleared when the account/session changes; late responses
cannot restore a signed-out account. Game runtime stays mounted while visiting profile routes.
**User Profile identity is not yet connected to GameRoom seats, P1/P2 or spectators.**
No match history, statistics, rating UI, social features or credential-management flows are included.

Focused checks (database commands require migrated, isolated `TEST_DATABASE_URL` as described above):

```bash
npm run -w server test:profile
npm run -w server test:profile:db
npm run -w web test:profile
npm run -w web test:profile:e2e
```

The normal `npm run test` includes database-free profile tests. The browser smoke suite now covers
authentication plus profile edits, public privacy/URLs, avatars, persistent preferences, reload and
expired-token recovery, responsive layouts and gameplay connection independence.

Focused tests and a real Chromium smoke scenario are available:

```powershell
npm run -w web test:auth
$env:TEST_DATABASE_URL = 'postgresql://fate:fate@localhost:5432/fate_auth_test?schema=public'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm run -w server db:migrate:deploy
npm run -w web test:auth:e2e
```

The browser script launches its own backend/Vite processes against the prepared isolated test database.
It uses an installed Edge/Chrome/Chromium executable; optionally set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. `AUTH_TEST_SERVER_PORT` (3103) and `AUTH_TEST_WEB_PORT` (5175)
can change test-only ports. It verifies registration, cookie rotation, `/me`, F5, direct protected visits,
expired access recovery, concurrent tabs, logout/reload, responsive/localized UI and public room creation.
It deletes only its generated test account and stops its child processes. Screenshots are placed under
the ignored `packages/web/test-results/auth` directory. Root `npm run test` now includes the focused
frontend auth tests alongside its existing rules/server suites.


Focused tests and a real Chromium smoke scenario are available:

```powershell
npm run -w web test:auth
$env:TEST_DATABASE_URL = 'postgresql://fate:fate@localhost:5432/fate_auth_test?schema=public'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm run -w server db:migrate:deploy
npm run -w web test:auth:e2e
```

The browser script launches its own backend/Vite processes against the prepared isolated test database.
It uses an installed Edge/Chrome/Chromium executable; optionally set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. `AUTH_TEST_SERVER_PORT` (3103) and `AUTH_TEST_WEB_PORT` (5175)
can change test-only ports. It verifies registration, cookie rotation, `/me`, F5, direct protected visits,
expired access recovery, concurrent tabs, logout/reload, responsive/localized UI and public room creation.
It deletes only its generated test account and stops its child processes. Screenshots are placed under
the ignored `packages/web/test-results/auth` directory. Root `npm run test` now includes the focused
frontend auth tests alongside its existing rules/server suites.

## Test Room / Sandbox

Test rooms are server-authoritative manual QA rooms. A single controller can spawn catalog units for either side, edit HP/statuses/charges, force turns and phases, run normal attacks and abilities, queue deterministic d6 results, place stakes/forest markers, inspect pending rolls/state, load deterministic presets, and export/import bounded JSON snapshots.

Enable locally:

```bash
VITE_ENABLE_TEST_ROOM=true
ENABLE_TEST_ROOMS=true
```

In production, `ENABLE_TEST_ROOMS=true` is required and room creation must include the configured `FATE_DEBUG_TOKEN`. Sandbox commands are rejected for normal rooms, disabled deployments, spectators, and non-controller connections. Imported snapshots are capped and validated before replacing test-room state.

## Assets (Figure Arts + Tokens)

Recommended formats:
- WEBP preferred (best size/quality)
- PNG allowed (if transparency is needed)
- Token transparency: use WEBP/PNG with alpha

Suggested sizes:
- Full art: `1024x1536` (2:3) or `1200x1800`
- Token: `256x256` or `512x512` square

File naming rules (must match `figureId`):
- `packages/web/src/assets/figures/<figureId>.webp`
- `packages/web/src/assets/tokens/<figureId>.webp`

Tips:
- Try to keep full art under ~300-600 KB if possible
- Assets under `src/assets` are bundled by Vite; if user uploads are needed later, move them to `/public` or external storage

## Server API

- `GET /` - basic server info
- `GET /health` - health check
- `GET /api/health` - health check (legacy)
- `POST /api/games` - create a game
  - body: `{ "seed"?: number, "arenaId"?: string }`
- `GET /api/games/:id?playerId=P1|P2` - debug player-specific state view; production requires `X-FATE-DEBUG-TOKEN`
- `POST /api/games/:id/actions?playerId=P1|P2` - debug `GameAction` submit; production requires `X-FATE-DEBUG-TOKEN`
- `GET /api/games/:id/log` - debug action log; production requires `X-FATE-DEBUG-TOKEN`
- `GET /rooms` - list room summaries
- `POST /rooms` - create a room (returns `roomId`)

## WebSocket

- `GET /ws`
  - client -> server:
    - `{ type: "joinRoom", roomId, requestedRole, name? }`
    - `{ type: "leaveRoom" }`
    - `{ type: "action", action }`
    - `{ type: "requestMoveOptions", unitId }`
  - server -> client:
    - `{ type: "joinAccepted", roomId, role, connId }`
    - `{ type: "joinRejected", reason, message }`
    - `{ type: "roomState", roomId, room }`
    - `{ type: "actionResult", ok, events, error?, logIndex? }`
    - `{ type: "moveOptions", unitId, roll, legalTo }`
    - `{ type: "error", message }`

## Deployment

Deployment updates are also posted in the [Developer Log](https://t.me/FATE_Soul_Dev).

### Render Deploy (Server)

Render can build from the repo root.

- Build command: `npm install && npm run -w rules build && npm run -w server build`
- Start command: `npm run -w server start`

Environment variables:
- `PORT` (Render sets this automatically)
- `WEB_ORIGIN` (set to your Vercel URL for CORS and WebSocket Origin checks)
- `FATE_DEBUG_TOKEN` (required only if using debug REST endpoints in production)
- `ROOM_TTL_MS`, `MAX_ROOMS`, `MAX_LOG_EVENTS` (optional in-memory bounds)
- `NODE_VERSION=22` (optional)

Notes:
- The server binds to `0.0.0.0` and uses `PORT`
- WebSockets are available at `wss://<render-host>/ws`

### Vercel Deploy (Web)

Recommended Vercel settings:
- Framework preset: Vite
- Root Directory: `packages/web`
- Install Command: `npm install --prefix ../..`
- Build Command: `cd ../.. && npm run -w web build`
- Output Directory: `dist`

Environment variables (required for production builds):
- `VITE_API_URL=https://<render-server>.onrender.com`
- `VITE_WS_URL=wss://<render-server>.onrender.com/ws`

## Common Pitfalls

- `Failed to fetch` in production usually means `VITE_API_URL` points to localhost
- WS connection failures usually mean `VITE_WS_URL` should be `wss://.../ws` in production
- CORS errors usually mean `WEB_ORIGIN` is missing or incorrect on Render

## Quick Verify

- Open the Vercel site, check Network tab: `/rooms` should hit your Render domain
- Confirm WebSocket connects successfully (`wss://<render-host>/ws`)
- Visit `https://<render-host>/health` and see `{ ok: true }`

## Notes

- The server is authoritative: the client only sends `GameAction` intents
- Per-player visibility is enforced by `makePlayerView` (exported from `rules`)
- Avoid running Vite with `--host 0.0.0.0` unless you explicitly need LAN access

## Developer Log

Track implementation updates, architecture notes, and release progress in the Telegram channel:

- https://t.me/FATE_Soul_Dev
