# FATE

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![npm workspaces](https://img.shields.io/badge/npm-workspaces-CB3837?logo=npm&logoColor=white)](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
[![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=1A1A1A)](https://react.dev/)

Deterministic turn-based game stack in a TypeScript monorepo: authoritative rules engine, Fastify + WebSocket server, and Vite + React client.

Competitive play uses independent Glicko-2 ratings for Standard, Draft and Classic.
Rating, RD, volatility, rated games, rank and qualification belong to each mode.
Matchmaking and manual Rated lobby checks use that mode's rating; Casual changes
none. See [per-mode rating architecture and legacy migration](docs/per-mode-ratings.md).

Follow active progress and implementation notes in the [Developer Log](https://t.me/FATE_Soul_Dev).

## Contents

- [Packages](#packages)
- [Getting Started](#getting-started)
- [Build](#build)
- [Tests](#tests)
- [Continuous Integration](#continuous-integration)
- [Environment Variables (Web)](#environment-variables-web)
- [Database Development](#database-development)
- [Persistent Match Lifecycle](#persistent-match-lifecycle)
- [Persistent Match Results](#persistent-match-results)
- [Match History](#match-history)
- [Player Statistics Backend](#player-statistics-backend)
- [Player Statistics UI](#player-statistics-ui-phase-14)
- [Leaderboard](#leaderboard-phase-16)
- [Play and Lobby](#play-and-lobby)
- [Canonical Rank Tiers](#canonical-rank-tiers)
- [Persistent Action Log](#persistent-action-log)
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

Use `.env.example` as a configuration checklist. Export filled server variables into its process;
the server does not load the root `.env`. Put public Vite overrides in `packages/web/.env.local`.
Omit unused optional variables instead of exporting empty values.

### Dev Flow: Two Tabs, Same Room

- Open `http://localhost:5173` and sign in
- Open `/lobby`, create a named lobby, and use **Copy Join Code** to invite a player
- Join as P1 in the first tab
- Use a second account in a separate browser context to join P2; the same account may spectate

## Build

```bash
npm run build
```

## Tests

See [the testing guide](docs/testing.md) for layer ownership, guarded PostgreSQL setup and browser smoke.

`npm run test:unit`, `npm run test:integration`, `npm run test:ws` and `npm run test:e2e` run independently.
`npm test` keeps the DB-free regression workflow; `npm run typecheck` checks all packages and the browser harness.

```bash
npm run test
npm run -w web typecheck
```

## Continuous Integration

Pull requests and pushes to `main` run the required **CI / Quality** check: locked
install, Prisma validation/generation, lint, full typecheck, OpenAPI, rules/server/web
tests, PostgreSQL 16 integration, WebSocket/restart tests, the primary browser journey
and the complete build. Every stage must pass. No production secrets are required.

See [CI commands, database isolation and required branch protection](docs/ci.md).
Configure GitHub to require the **Quality** check before merging; the workflow alone
does not enable branch protection.

## Environment Variables (Web)

The frontend reads these at build time. Production requires both URLs; the bundled app refuses initialization if either is missing:

- `VITE_API_URL` (example: `https://your-render-app.onrender.com`)
- `VITE_WS_URL` (example: `wss://your-render-app.onrender.com/ws`)
- `VITE_ENABLE_TEST_ROOM=true` - shows the Test Room creator when the server also allows it. Local Vite development enables the entry automatically.

`.env.example` contains empty placeholders; local defaults are described in its comments.

## Environment Variables (Server)

- `WEB_ORIGIN` - allowed browser origin for CORS and WebSocket Origin checks, for example `https://your-app.vercel.app`.
- `FATE_DEBUG_TOKEN` - production-only token for debug REST game views/actions/logs. Send it as `X-FATE-DEBUG-TOKEN: <token>`.
- `ENABLE_TEST_ROOMS=true` - enables authoritative Test/Sandbox rooms. Development enables them by default unless explicitly set to `false`; production requires this flag and a matching `FATE_DEBUG_TOKEN` when creating the room.
- `ROOM_TTL_MS` - idle room TTL before cleanup. Default: `86400000` (24 hours).
- `MAX_ROOMS` - maximum in-memory FATE rooms retained. Default: `100`.
- `MAX_LOG_EVENTS` - maximum action log entries retained per room. Default: `5000`.
- `WS_MAX_PAYLOAD_BYTES`, `WS_RATE_LIMIT_WINDOW_MS`, `WS_RATE_LIMIT_MAX_MESSAGES`, `RECONNECT_GRACE_MS` - WebSocket payload, rate, and reconnect controls.
- `DATABASE_URL` - runtime PostgreSQL URL (Neon pooled in production).
- `DIRECT_URL` - direct PostgreSQL URL for Prisma migration/CLI operations; equal to the local DB URL in development.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` - different random keys, each at least 32 UTF-8 bytes.
- `NODE_ENV=production` requires both DB URLs, both JWT keys and exact HTTPS `WEB_ORIGIN` before startup. Development remains lazy; health and Test/Sandbox rooms can run without database/auth config.
- Production Vercel/Render auth uses `AUTH_COOKIE_SAME_SITE=none`; keep `ENABLE_TEST_ROOMS=false`.

Local development keeps debug REST endpoints open when `NODE_ENV !== "production"`. In production, `GET /api/games/:id`, `POST /api/games/:id/actions`, and `GET /api/games/:id/log` require `X-FATE-DEBUG-TOKEN` to match `FATE_DEBUG_TOKEN`. Browser WebSocket connections must use an allowed Origin; missing Origin is accepted for non-browser clients.

## Database Development

The persistence foundation uses PostgreSQL and Prisma 6.19 inside `packages/server`. Set both
`DATABASE_URL` and `DIRECT_URL` (equal for local development)
in the environment used by Prisma, for example:

```text
postgresql://fate:fate@localhost:5432/fate?schema=public
```

Development startup remains possible without database variables. Database access then fails with a
focused configuration error. Production validates required configuration and probes PostgreSQL
before listening; see [production deployment](docs/production-deployment.md).

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
guard, it must use a loopback host and a distinct `test` database/schema name segment, and refuse
production mode. Set BOTH `DATABASE_URL` and `DIRECT_URL` to that test target for migrations before
running `npm run -w server test:db`. The normal test suite does not require PostgreSQL.

### Realtime state versus durable records

`GameRoom` remains the authoritative, in-memory operational state used by REST and WebSocket
gameplay. `Match` stores durable match metadata in PostgreSQL. Normal rooms now create matches
and competitors; accepted actions and private versioned checkpoints are persisted. Startup
recovery uses the journal plus compatible checkpoints or exact initial configuration.

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
Normal player seats require verified User identity. Authenticated creation populates `createdById`;
public empty-room creation leaves it null. Client `userId` values are ignored.

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
upsert the seat snapshot; reconnects reuse the row. Explicit lobby departure or grace expiry removes
the waiting participant. After start, participant identity and names are immutable and replacement
by a different user is forbidden. Spectators remain runtime only. Names use trusted Profile
`displayName` when non-empty, then `username`. Profile changes do not rewrite match snapshots.

An accepted action changing the authoritative state to `ended` persists the complete result
described in Persistent Match Results below, including authenticated winner/loser identities.
`finalRevision` means the revision **after the accepted
ending action**, equal to `gameOver.endedAtRevision`; later connection metadata does not alter it.

Permanent cleanup/removal cancels an unstarted WAITING room, including inactive TTL/capacity
eviction. A temporary leave/disconnect does not cancel a match. Active initiative/game rooms stay
IN_PROGRESS if removed; cleanup never fabricates FINISHED. Finished matches retain their results.
`/rooms` lists the current runtime map, without querying persistent match history.

Integration is `routes / WebSocket -> MatchLifecycle -> MatchService -> MatchRepository -> Prisma`.
Store/rules actions remain synchronous. Accepted state-changing moves, attacks, abilities, rolls
and turns enqueue durable action records without waiting on inserts; lifecycle transitions and
lobby metadata use the existing persistence services.
The existing per-room command queue serializes runtime changes, persistence and retries; cleanup
protects connected rooms and in-flight commands. PostgreSQL unique keys, conditional transitions
and short parent-lock transactions also arbitrate concurrent repository calls. Repeated start,
finish and cancel calls retain timestamps/results; conflicting terminal results are rejected.

Participant/start/finish/cancel persistence failures log safe room/match/seat identifiers and
preserve accepted runtime state. A small in-memory projection retries every five seconds, in
start-before-finish order, with the original timestamps/result/revision. Reconnect after start
cannot rewrite a failed start snapshot. This retry buffer is process-local: process exit loses
pending work, and shutdown reports outstanding projections. Startup recovery restores only durable work;
see [Server restart recovery](docs/server-restart-recovery.md).

Persistent MatchAction writes, completed results, match history and private GameState checkpoints
are implemented, including completed-match Replay API/UI, derived player statistics and the Phase 15 Glicko-2 backend.
Startup restores active persistent matches using a validated contiguous action journal,
compatible snapshots (or exact initial inputs), and RNG continuation. Acknowledgements remain
asynchronous: a hard crash can roll back actions not yet committed. See
[Server restart recovery](docs/server-restart-recovery.md) for identity, lifecycle and deployment limits.
The result detail endpoint and history APIs/UI read completed durable records.

Verification uses explicit in-memory persistence injection for the normal runtime test suite,
never a production fallback. Real PostgreSQL integration requires a migrated, isolated
`TEST_DATABASE_URL` whose database/schema has a `test` name segment:

```bash
npm run -w server test:match:db
```

### Match Snapshots

Normal persistent rooms save private PostgreSQL checkpoints while `GameRoom` remains the
authoritative runtime. `MATCH_SNAPSHOT_INTERVAL` defaults to **20 revisions**; accepted journaled
revisions divisible by the interval trigger a checkpoint. The setting is an optional, non-secret
Render override, parsed once per lifecycle; invalid values fail configuration. `0` disables periodic
checkpoints but preserves final snapshots. Twenty is an operational default, not a benchmarked optimum.

Snapshot revision **N means state after the accepted revision-N action**, matching `MatchAction.revision`.
For new Phase 11 matches, readiness and mode changes also use the durable journal/queue path,
so accepted revisions are contiguous. Revision zero is before the first accepted command;
the internal creation-time `lobbyInit` has no revision. Older journals can contain gaps and cannot
be assumed replayable. Rejected actions and accepted no-ops without a revision never trigger a snapshot.

The existing `MatchSnapshot` model stores `matchId`, `revision`, `formatVersion`, `state`, `rngState`
and the generated `id`/`createdAt`; its existing unique `(matchId, revision)` index supports exact,
latest and at/before-revision lookups. No schema change, migration or historical backfill is needed.
Format v1 uses the canonical `MATCH_SNAPSHOT_FORMAT_VERSION` constant. `state` is authoritative
GameState domain JSON, including hidden units/knowledge, markers, rule declaration data and pending
rolls/moves/combat. V1 stores `units` as an ordered array and restores the runtime `Record` on load:
JSONB does not preserve object key order, while rules depend on unit iteration order. All other
fields retain their domain JSON representation. `state.events` is explicitly empty: events are presentation history and historical
actions/events belong to `MatchAction`. Optional undefined object properties become absent; undefined
array entries, holes, non-finite numbers, functions, custom instances, Map/Set/Date/BigInt and cycles
fail capture. A detached, recursively frozen copy is captured synchronously before queueing any DB
work, so later room mutations cannot change it. No connection/auth/profile/user identity is copied.

Normal rooms already use the Numerical Recipes uint32 LCG. `rngState` stores
`{ "algorithm": "lcg32-numerical-recipes-v1", "state": <uint32> }`, the exact internal continuation
state; restoring it produces the same next random value, including a valid zero state. It is not
the initial seed or a function closure. Test/debug dice queues and runtime-only rooms are excluded.

The tracked per-match chain writes action N, then snapshot N, before later writes. PostgreSQL
persistence does not add interval-action latency; capture/validation runs synchronously. A terminal
action always captures its final state, including when off interval or interval=0. A terminal action
on an interval uses a single capture. Equivalent duplicate writes succeed without changing the
canonical row or timestamp; different state/RNG/version at the same revision raises
`MATCH_SNAPSHOT_CONFLICT`. Finalization waits for the complete chain, so a successfully persisted
FINISHED match has a snapshot at `Match.finalRevision`. Transient Prisma write errors use the existing
three-attempt bounded retry; permanent conflicts/validation errors stop. A failed checkpoint preserves
ended gameplay, blocks later writes/result publication, and logs identifiers/operation/version only.
Pending writes remain tracked through cleanup and drain on graceful shutdown before Prisma disconnects.
The existing bounded drain can report stalled work; uncompleted in-memory queues are not crash durable.

Internal `MatchSnapshotService` methods `loadSnapshot`, `loadLatestSnapshot` and
`loadLatestSnapshotAtOrBefore` use indexed PostgreSQL queries (`revision DESC`, one row for latest).
Missing snapshots return null, including legacy matches. The loader rejects unsupported versions
with `UNSUPPORTED_SNAPSHOT_VERSION` and malformed payloads with `MATCH_SNAPSHOT_INVALID`; v1 uses
explicit Zod validation of all typed state fields plus JSON validation of extensible domain contexts.
Loaded results contain typed GameState and RNG data. Checkpoints contain hidden information and are
never included in public details, action history, match history, spectator messages or frontend APIs.

Phase 11 reconstruction and Phase 12 replay API/UI now consume these private checkpoints through
safe read-only projection. Startup room recovery is described in
[Server restart recovery](docs/server-restart-recovery.md); snapshot performance research remains deferred. Local verification:

```bash
npm run -w server test:snapshots
# Uses the existing loopback-only TEST_DATABASE_URL guard; migrate the isolated test DB first.
npm run -w server test:snapshots:db
```

### Persistent Match Results

The server captures results only after an accepted action changes a normal room to `ended`.
`extractPersistentMatchResult` reads authoritative state and verified, frozen seat identities;
clients cannot submit a result. `MatchService.finalizeMatch` validates those identities against
the existing P1/P2 MatchParticipant rows and atomically writes Match plus both outcomes.

Match stores `winnerSeat`, `winnerUserId`, `loserSeat`, `loserUserId`, `finishReason`, `finishedAt`,
`durationMs`, `finalRevision` and `turnCount`, alongside its existing mode/seed/start metadata.
Winner/loser users come from their corresponding participants; legacy unlinked users stay null.
The real chess rule supports mutual king defeat: both outcomes are `DRAW`, both winner/loser
seats and user IDs are null, and the mapped reason is `chessMutualKingDefeat`. Other produced
reasons are `allEnemyUnitsDefeated` and `unknown` (existing special-rule/Frisk results).
There are no resignation, timeout or disconnect result flows.

`finishedAt` is captured once at the terminal transition. `durationMs` is this timestamp minus
the persisted server `startedAt`, including initiative/setup/placement; absent legacy starts
leave duration null and emit an error log. `finalRevision` is the accepted terminal action's
revision after increment, independent of later room metadata. `turnCount` is the terminal
battle turn index, including the terminal turn, from `gameOver.endedAtTurn`; chess draws use
the final authoritative `turnNumber`. Battle numbering starts at 1 after placement. It is
not an action count or completed-turn count; legacy missing turn stamps remain null.

Participants retain historical `displayNameSnapshot` and gain nullable `outcome` (`WIN`, `LOSS`,
`DRAW`) and small `resultData` JSON: `{ "version": 1, "remainingUnits": 2, "remainingHealth": 9 }`.
These are counts and summed non-negative HP of all living owned units, including living tokens,
which the existing ended spectator view makes public. No hero identities, hidden state, sockets,
tokens or full GameState are stored. Existing historical rows are preserved without backfilling
invented results; account deletion uses existing SetNull semantics for winner/loser/participants.

Finalization uses a conditional `IN_PROGRESS -> FINISHED` update inside a Prisma transaction;
the parent row lock serializes competing calls. Participant failure rolls back every result
write. Equivalent retries return the first committed result, retaining its timestamp/duration.
Any changed winner, loser, revision, reason, turn count or participant result raises
`MATCH_RESULT_CONFLICT`; WAITING/CANCELLED cannot finalize. Ordinary actions do no result writes.
An unavailable database preserves the accepted ended runtime and captured result, with at most
five finish attempts through the existing five-second retry timer. Permanent integrity errors
stop immediately. Exhaustion emits `MATCH_RESULT_RETRY_EXHAUSTED`; pending data is process-local,
and startup recovery now completes reconstructable durable terminal actions through the same
result pipeline. Finished rooms keep their existing lifetime.

`GET /api/matches/:id` is public and returns only a dedicated completed-result DTO with metadata,
historical winner/loser names and participant summaries. It queries no current profiles, actions
or snapshots. Non-FINISHED matches return 409 `MATCH_NOT_FINISHED`, unknown UUIDs return 404
`MATCH_NOT_FOUND`, invalid UUIDs return 400 `INVALID_REQUEST`, and database failures return a
sanitized 503 `MATCH_PERSISTENCE_UNAVAILABLE`. Errors use `{ "error": { "code": "...", "message": "..." } }`.
JSON summaries are whitelisted again on reads. Test/sandbox rooms have no competitive Match
and never finalize results. Persistent action history and match history UI/list APIs are implemented;
private snapshots, completed-match replay, player statistics and the Glicko-2 rating backend are implemented.

Apply incremental migration `20261002050000_persistent_match_results` with
`npm run -w server db:migrate:deploy`. Focused extraction/retry tests run in `npm run test`;
real transaction/concurrency/rollback/result API verification uses an isolated test database:

```bash
npm run -w server test:results:db
npm run -w server test:match:db
```

## Authentication Backend

Authentication supplies verified User identity for normal FATE player seats. The WebSocket adapter
reuses the HTTP `TokenService`; gameplay resume tokens remain separate from account authentication.

Auth requires PostgreSQL with the committed migrations applied and two independently generated
`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` keys (each at least 32 UTF-8 bytes). There are no fallback
keys. Generate each with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Export configuration into the server environment; the server does not automatically load the root
`.env`. Production startup rejects missing/invalid configuration before listening. In development
and request-time checks, missing/invalid auth configuration fails closed with `503 AUTH_UNAVAILABLE`; missing or
unreachable PostgreSQL yields `503 DATABASE_UNAVAILABLE`. Normal player seats require authentication. Normal room creation requires match persistence;
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
Browser auth requests use `credentials: "include"`.

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
$env:DIRECT_URL = $env:TEST_DATABASE_URL
$env:NODE_ENV = 'test'
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
is needed. WebSocket transport and resume tokens remain distinct from account authentication;
normal P1/P2 ownership is bound to verified User identity.

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
Player display names are captured from trusted profiles on seat assignment and frozen at match start.
Match history is implemented in Phase 9, statistics backend in Phase 13, and Profile statistics UI in Phase 14. Rating UI, social features and
credential-management flows remain deferred.

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
$env:DIRECT_URL = $env:TEST_DATABASE_URL
$env:NODE_ENV = 'test'
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
$env:DIRECT_URL = $env:TEST_DATABASE_URL
$env:NODE_ENV = 'test'
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
    - `{ type: "joinRoom", mode: "create" | "join", roomId?, role: "P1" | "P2" | "spectator", accessToken?, resumeToken?, name? }`
    - `{ type: "switchRole", role, accessToken? }`
    - `{ type: "leaveRoom" }`
    - `{ type: "action", action }`
    - `{ type: "requestMoveOptions", unitId }`
  - server -> client:
    - `{ type: "joinAck", roomId, role, seat?, roomMode, isHost, resumeToken }`
    - `{ type: "joinRejected", reason, message }`
    - `{ type: "roomState", roomId, you, view, meta }`
    - `{ type: "actionResult", ok, events, error?, logIndex? }`
    - `{ type: "moveOptions", unitId, roll, legalTo }`
    - `{ type: "error", code?, message }`

## Authenticated Multiplayer Identity

| Identifier | Purpose |
| --- | --- |
| `User.id` | Persistent account identity derived from verified access JWT `sub`. |
| `P1` / `P2` | Game seat understood by the auth-free rules engine. |
| `connId` | Temporary transport ownership; changes when a socket reconnects. |
| `resumeToken` | Gameplay continuity secret; never substitutes for account authentication. |

Normal P1/P2 seats require two distinct authenticated accounts. `ConnectionIdentity` contains only
`userId`, `username`, and nullable `displayName`. Room seat identities populate
`MatchParticipant.userId` and the profile-derived `displayNameSnapshot`. Unique `(matchId, seat)`
and `(matchId, userId)` keys protect persistence; legacy null-user rows remain supported. Apply
`20261002040000_authenticated_match_identity` before running this phase. Duplicate legacy non-null
users must be resolved deliberately before migration; the migration does not rewrite historical data.

The browser sends its in-memory JWT only in `joinRoom` or `switchRole` authentication frames.
The server uses the existing access-token verifier, loads the account/profile once at identity
establishment, then retains safe identity fields. Client `userId`, `username`, and `name` cannot
override verified identity. JWTs never enter WebSocket URLs, browser storage, room state, logs or
PostgreSQL. Origin restrictions and player/spectator hidden-state projections are preserved.

Each new player connection needs both a current access JWT and its gameplay resume token.
A different account is rejected with `RESUME_IDENTITY_MISMATCH`, without releasing seat grace.
One account cannot own both seats (`USER_ALREADY_IN_MATCH`). Duplicate connections to the same
seat require the existing resume token; successful resume removes the old connection's authority.
After match start, disconnect/grace expiry clears transport occupancy but retains the owner and
resume token until room cleanup; only that user can restore the seat. Lobby grace expiry releases
the waiting seat. Role changes are locked after draft/start.

JWT and User lookups do not run on moves, attacks, rolls, readiness or other gameplay actions.
Token expiry and HTTP logout leave an established socket usable. On F5/reconnect, the frontend
waits for auth initialization, refreshes through the existing single-flight HTTP session manager
when necessary, then sends JWT plus the stored resume token. Guests attempting to play go to
`/login` with a safe internal return path. Anonymous and authenticated spectators remain supported,
receive the same spectator projection and create no participant rows. Test/Sandbox rooms retain
their existing anonymous developer controls and never persist synthetic participants.

Focused verification (browser/DB checks require migrated, isolated `TEST_DATABASE_URL`):

```bash
npm run -w server test
npm run -w server test:match:db
npm run -w web test:auth
npm run -w web test:multiplayer:e2e
```

## Match History

Match history is a public, read-only view of completed PostgreSQL matches. Own history at
`/matches` requires a restored session and uses `AuthUser.id`. Public profiles link to
`/users/:username/matches`; entries open the public informational `/matches/:id` page.
The existing `GET /api/matches/:id` supplies details, including P1/P2 historical names,
participant outcomes, current public profile links/avatars where available, mode, dates,
canonical duration, finish reason, final revision and turn count. Missing legacy data is
shown as unavailable.

`GET /api/users/:id/matches?page=1&limit=20&result=WIN&gameMode=classic` returns:

```json
{
  "items": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

| Parameter | Contract |
| --- | --- |
| `page` | Positive integer, default 1, maximum 21474836 (keeps offsets in PostgreSQL's integer range) |
| `limit` | Positive integer, default 20, maximum 100 |
| `result` | Optional `WIN`, `LOSS`, `DRAW`; omitted means all participant outcomes, including unavailable legacy outcomes |
| `gameMode` | Optional `standard`, `draft`, `classic`, validated against shared `rules` metadata |

Only `FINISHED` matches are included; status filtering is not supported. Waiting, active,
cancelled and runtime test/debug rooms are not normal history. Invalid UUIDs/query values
return `400 INVALID_REQUEST`; an unknown valid user ID returns `404 USER_NOT_FOUND`.
An existing user without matches returns an empty list, and an out-of-range page returns
an empty page with the actual totals (the UI recovers to the last available page).

The route delegates to `MatchHistoryService` and `MatchHistoryRepository`. Participation
comes from `MatchParticipant.userId`, never the creator. Filters and pagination run in the
database; count and page use identical predicates in a short repeatable-read transaction.
Ordering is `finishedAt DESC NULLS LAST, id DESC`. Legacy missing finish dates display
`startedAt`, then `createdAt`, without claiming a completion time. Results are relative to
the requested participant. Opponents use the opposing seat and historical
`displayNameSnapshot`; current username/avatar are separate optional public fields.
Renames never rewrite historical identity, and deleted users or missing profiles are safe.

Explicit selects and DTOs exclude auth/private data, result payloads, hidden state and
`MatchAction` rows. The existing participant `userId` index supports participation lookup;
no schema or index migration was needed. No action log is loaded for list or details UI.
Filters/page live in the URL, changes reset page 1, and loading/error/empty states are localized
in English and Ukrainian. Completed-match replay is available from Match Details. Profile statistics use the aggregate backend endpoint;
the Glicko-2 backend and the competitive Leaderboard are implemented. Rating-history charts remain deferred.

Focused checks:

```powershell
npx tsx packages/server/src/tests/matchHistory.test.ts
npm run -w web test:matches
# Use a migrated, isolated TEST_DATABASE_URL as described in Database Foundation.
npm run -w server test:history:db
# Build server first; requires an installed Chromium browser (or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH).
npm run build
npm run -w web test:matches:e2e
```

The browser smoke test seeds 24 completed match records into the isolated test database,
logs in through the UI, checks filters/pagination/refresh/details/public profiles, checks
historical names after a rename, and saves desktop/mobile screenshots under
`packages/web/test-results/match-history`. It removes its own records afterward.

## Player Statistics Backend

Phase 13 provides public `GET /api/users/:id/statistics`, separate from lightweight profile
and paginated history endpoints. No access token is required, matching public profile/history
policy. Responses contain aggregates only and use `Cache-Control: no-store`. Invalid UUIDs
return `400 INVALID_REQUEST`; an unknown User returns `404 USER_NOT_FOUND`. A real User
without eligible matches receives zero counts, `winRate: 0`, null averages, an empty mode
list and `currentStreak: { type: null, count: 0 }`.

```json
{
  "userId": "00000000-0000-4000-8000-000000000001",
  "overall": {
    "gamesPlayed": 5,
    "wins": 3,
    "losses": 1,
    "draws": 1,
    "winRate": 0.6,
    "averageDurationMs": 2000,
    "durationSampleSize": 4,
    "averageTurns": 17.33,
    "turnCountSampleSize": 3,
    "currentStreak": { "type": "WIN", "count": 2 },
    "longestWinStreak": 2,
    "longestLossStreak": 1
  },
  "byGameMode": [
    {
      "gameMode": "classic",
      "gamesPlayed": 5,
      "wins": 3,
      "losses": 1,
      "draws": 1,
      "winRate": 0.6,
      "averageDurationMs": 2000,
      "durationSampleSize": 4,
      "averageTurns": 17.33,
      "turnCountSampleSize": 3
    }
  ]
}
```

Metric semantics:

- Source is durable `MatchParticipant.userId` joined to `Match.status == FINISHED`.
  Eligible records must have `WIN`, `LOSS` or `DRAW`, a valid `finishedAt`, and a nonempty
  raw `gameMode`. WAITING, IN_PROGRESS and CANCELLED matches are excluded. Creator and
  spectator appearances are not participation; the unique `(matchId, userId)` key prevents
  duplicate games. Test/sandbox rooms never create persisted Matches in the current lifecycle;
  there is no persisted debug-match flag or speculative JSON marker.
- `gamesPlayed = wins + losses + draws`, using participant-relative persisted outcomes,
  exactly the outcome source used by Match History. No fallback to winner names/IDs or
  current profile exists. Legacy finished rows with missing outcomes/completion dates or
  empty mode IDs are excluded from every aggregate and produce a safe count-only diagnostic
  (plus requested user ID); they remain readable through existing Match History.
- `winRate = wins / gamesPlayed` is a numeric fraction in **[0, 1]**, with zero for no games.
  Draws count in the denominator. Rules currently permit `chessMutualKingDefeat` draws;
  statistics count persisted DRAW outcomes without simulating rules again.
- `averageDurationMs` averages known nonnegative integer persisted durations, including real
  zero values. Missing/invalid samples are excluded, never converted to zero. Millisecond
  averages retain numeric precision, including fractional milliseconds.
- `averageTurns` averages known positive integer `Match.turnCount` values, rounded to two
  decimals. Current result extraction persists battle turns including the terminal turn;
  it uses the terminal turn stamp or the mutual-king-defeat turn counter. Neither
  `finalRevision` nor action count is a turn count. Both averages are null without samples;
  `durationSampleSize` and `turnCountSampleSize` expose partial coverage.
- Streaks use eligible completed history ordered by `finishedAt ASC, Match.id ASC`.
  `currentStreak` ends at the latest eligible result; consecutive draws form a DRAW streak
  and break both win and loss streaks. Longest streaks count consecutive wins/losses.
  Excluded legacy records do not participate in or break an eligible-history streak.
- `byGameMode` uses stable raw mode IDs with the same counts, rates, averages and sample sizes.
  Groups sort by descending games played, then mode ID ascending. Their games sum to overall
  games; unknown nonempty historical mode IDs remain their own groups without localization.

Architecture is `statisticsRoutes -> PlayerStatisticsService -> StatisticsRepository -> Prisma`,
with pure summary/streak/group helpers in `statistics/playerStatistics.ts`. Each request uses
one ID-only user existence read and one ordered participant query; Prisma batches the lightweight
Match relation read. SELECT count stays bounded as match count grows. No MatchAction, MatchSnapshot,
profile, resultData or private state payload is loaded. Existing participant user indexes and Match
primary/unique keys serve this user-scoped query; no redundant index or schema migration is added.
Computation is on demand, with O(n) projected data and arithmetic at the current project scale.
Statistics have no materialized table, cache or scheduled aggregation. Rating is a separate Phase 15 subsystem; Phase 16 Leaderboard uses its own rated-only query.
Phase 14's Profile statistics UI consumes this endpoint directly.

**Hero/Figure Set statistics are unavailable and `byHero`/`byFigureSet` are omitted.** Participant
`resultData` v1 only preserves remaining units/health; it has no authoritative historical hero or
roster snapshot. Match initialConfig records creation configuration, not participant selections.
Hero information exists in replay setup/action JSON and full private checkpoints, but extracting
and validating selection coverage from that replay infrastructure is deferred. Statistics never
infer historical usage from current Figure Sets, which are client-saved selections sent into live
rooms. No historical hero/loadout backfill or forward schema change is made in this phase.

Focused verification:

```powershell
npm run -w server test:statistics
# Use the guarded, migrated loopback TEST_DATABASE_URL described in Database Foundation.
npm run -w server test:statistics:db
```

The unit/API suite is included in `npm test`. The dedicated PostgreSQL suite covers real
participant queries, relative results, completed-only eligibility, draws, nullable/invalid samples,
zero users, deterministic tied completion dates, legacy exclusions, test-room non-persistence,
profile/result JSON independence, privacy and the same SELECT count for 11 and 100 games.
The [Phase 13 implementation report](docs/phase13-implementation-report.md) records verification.

## Player Statistics UI (Phase 14)

Both `/profile` and `/users/:username` present a shared, responsive Player Statistics section
below player identity. Public profiles request the **viewed player's ID** and work without login.
The account page retains editing, preferences, Figure Set and Match History navigation.

- Overview emphasizes win rate and games played, then wins/losses, current result streak,
  average match duration, average turns and longest winning streak. Draws are included when
  present, following the existing domain. Percentages use locale-aware formatting; null
  averages display `—`, and tracked sample counts accompany duration/turn averages.
- Recent performance requests **one page of at most 10** matches from the existing paginated
  Match History API. Recorded completed results appear oldest to newest, with opponent,
  mode, duration and date context, Match Details links and the correct player's full-history link.
  With at least three eligible matches, the line chart shows cumulative wins divided by matches
  played **inside that recent sample** after each match; draws remain in the denominator.
  It is explicitly labeled as recent-sample performance. An expandable list provides the exact
  point values and match context for keyboard, touch and screen-reader users.
- Game-mode performance uses backend `byGameMode` rates in compact horizontal bars, with
  localized canonical mode labels, games played, wins/losses/draws, averages and coverage in text.
  A one-game mode stays visible with its sample size. There are two distinct visualizations;
  small/empty samples do not produce a meaningless recent trend.

The backend remains the source of **all career and per-mode aggregates**. React never derives
those from Match History. `statisticsApi` uses the existing public API client and decodes the
actual Phase 13 DTO; statistics and recent-history requests run independently and concurrently.
Failures are isolated with retry, and responses are scoped to player/refresh/attempt so navigating
between players cannot display stale data. Revisiting/reloading refetches statistics; the own-profile
Refresh control refetches profile, statistics and the recent page.

Zero-match players get a deliberate empty state, with Play available only on the own profile.
Charts and metrics use FATE theme tokens, English/Ukrainian translations, responsive layouts,
visible focus states, text equivalents and reduced-motion support. Custom SVG/CSS uses **no new
dependency**. No database or backend changes are required by this frontend phase.

Historical hero/Figure Set analytics remain hidden because the current API does not expose
reliable `byHero`/`byFigureSet` data or historical coverage. Current Figure Set choices are never
used as historical usage. Hero breakdown can be added only when the backend reliably supplies it.
The Glicko-2 backend is implemented in Phase 15 and the separate Leaderboard in Phase 16. Rating-history visualization is deferred; this Profile statistics UI includes no
rating, rank, percentile, skill score or future-feature placeholder.

```powershell
npm run -w web test:statistics
npm run -w web test:statistics:e2e
```

The focused suite is included in `npm test`. The browser smoke uses local HTTP fixtures without
writing a database and verifies own/public profiles, editing, retry, navigation, refresh, two themes,
both locales, reduced motion and 1920/1366/768/390px viewports. Screenshots and a request log are
saved under `packages/web/test-results/statistics`. It exercises empty, small, established,
partial-average coverage, dominant-mode, long-identity and error states. The browser fixtures do
not replace persisted-data integration tests of the Phase 13 endpoint.
See [the Phase 14 implementation report](docs/phase14-implementation-report.md) for details.

## Persistent Action Log

Normal persistent matches append accepted authoritative gameplay actions to PostgreSQL
`MatchAction`. Invalid, unauthorized and spectator commands never append rows. Lobby
joins and figure-set changes are captured as compact setup inputs on the next accepted lobby command.
Readiness, mode changes, and accepted draft start, ban and pick commands are included because they
determine authoritative revisions and armies. Test/Sandbox rooms
and rooms without `matchId` keep their runtime log only. Older matches are not backfilled.

The existing schema is reused without a migration. Each row contains `matchId`, `revision`,
`actorUserId`, `actorSeat`, `actionType`, JSONB `actionPayload`, JSONB `events` and server
`createdAt`. The domain action includes its discriminator and replay-relevant arguments.
Actors come from verified runtime seat identity, never client `userId` or connection IDs.
The action mapper strips extra envelope fields and recursively removes credentials and
transport metadata from extensible ability payloads. Canonical events retain authoritative
results, including rolls and hidden game information; combat visual batch notifications
and visual sequencing metadata are excluded. No RNG seed/state is added to action rows.

`revision` describes the state **after** an accepted command: apply rules synchronously,
advance revision, append runtime entry, schedule durable append. New Phase 11 journals have contiguous
revisions, including readiness and mode changes. Earlier journals may have missing lobby revisions.
Accepted readiness no-ops do not advance revision. Draft commands advance revision once.
The terminal gameplay row's revision equals `Match.finalRevision`; later room metadata
changes do not change that captured result. Ordering uses revision, never timestamp.

`GameRoom.actionLog` remains bounded by `MAX_LOG_EVENTS`; PostgreSQL keeps the full journal.
Gameplay runs from memory without reading action history or waiting for action inserts.
Tracked per-match chains write in order, independently across matches, and release drained
chain state. Each match allows up to 10,000 pending writes. Recognized transient connection,
timeout and transaction errors receive at most three attempts with 50/100 ms backoff.
Equivalent retries use unique `(matchId, revision)` protection and compare actor, type,
payload and events; a conflicting row raises `MATCH_ACTION_CONFLICT` and is never overwritten.

An exhausted/permanent write, mapping failure or queue overflow logs safe structured context,
stops that match's subsequent writes and blocks result publication. Accepted memory state
is never rolled back. There is no automatic recovery after these failures; unpersisted
actions remain process-local and require operational attention. Result finalization runs
outside the gameplay command, after the complete terminal journal has drained. Cleanup
retains tracked writes; shutdown stops inbound work, drains commands/actions/results with
bounded waits, then disconnects Prisma. Action and finalization drain timeouts are 5 seconds
each and report incomplete work explicitly. Startup recovery now restores only durably committed
state; non-durable acknowledged work can still be lost in a hard process crash.

`GET /api/matches/:id/actions?limit=100&revisionAfter=0` requires a valid Bearer access token.
Only `FINISHED` matches are readable: unknown IDs return `404 MATCH_NOT_FOUND`, other
statuses return `409 MATCH_NOT_FINISHED`, invalid IDs/pagination return `400 INVALID_REQUEST`.
`limit` is 1–500. The response is `{ matchId, actions, nextRevisionAfter }`, ordered ascending
by revision; a non-null cursor is the last returned revision, otherwise there are no more rows.
Each action contains `revision`, `actor: { seat, userId, displayName }`, `type`, `payload`,
`events` and ISO `createdAt`. Display names use historical participant snapshots.
The player-neutral DTO deliberately returns payload `{ type }` and only allowlisted turn,
round, battle-start and end events. Hidden unit IDs/positions, targets, ability choices,
private rolls, credentials, email and database row IDs are not exposed. Canonical server
JSON is retained separately for future replay verification. Historical empty journals
return an empty page.

The durable journal supports completed Match History, Match Snapshots and Replay API/UI.
Runtime Restart Recovery remains a future phase. Rating backend is implemented in Phase 15; Profile statistics UI is implemented in Phase 14.

```bash
npm run -w server test
# Apply migrations to an isolated TEST_DATABASE_URL before DB integration tests.
npm run -w server test:actions:db
npm run -w server test:match:db
npm run -w server test:results:db
```

## Deployment

Production is **Vercel (`packages/web`) -> Render (`packages/server`) -> Neon PostgreSQL**
(`production` branch, `neondb`, Frankfurt). Follow the [production deployment guide](docs/production-deployment.md)
for the environment contract, first empty-database deployment checklist, existing-schema cases,
auth cookie limitations and smoke tests.

Render runs from the repository root using Node 22:

- Build: `npm ci --include=dev && npm run -w rules build && npm run -w server build`
- Pre-deploy (when available): `npm run -w server db:migrate:deploy && npm run -w server db:migrate:status`
- Start with pre-deploy configured: `npm run -w server start`
- Start when pre-deploy is unavailable: `npm run -w server start:deploy`
- Health Check Path: `/ready`; Render controls `PORT`.

`start:deploy` runs migration deploy and migration status successfully before starting Node.
Failures block startup. Production validates both DB URLs, both JWT keys, exact HTTPS
`WEB_ORIGIN` and existing auth security rules, then checks connectivity before listening.
Runtime Prisma traffic uses pooled `DATABASE_URL`; migration/direct operations use `DIRECT_URL`.
No production credentials belong in source files or frontend settings.

Vercel uses Vite, Root Directory `packages/web`, outside-root workspace sources enabled,
Install Command `cd ../.. && npm ci --include=dev`, Build Command
`cd ../.. && npm run -w rules build && npm run -w web typecheck && npm run -w web build`,
and Output Directory `dist`. Configure only public `VITE_API_URL`, `VITE_WS_URL` and
`VITE_ENABLE_TEST_ROOM=false`. All `VITE_*` values are exposed to browsers.
The general SPA fallback preserves static assets and supports direct URLs/refreshes for
all auth, profile, match and public-history routes.

## Common Pitfalls

- `Failed to fetch` in production usually means `VITE_API_URL` points to localhost
- WS connection failures usually mean `VITE_WS_URL` should be `wss://.../ws` in production
- CORS errors usually mean `WEB_ORIGIN` is missing or incorrect on Render

## Deterministic Replay Engine

Phase 11 provides the internal `ReplayService`; Phase 12 exposes it through the safe API/UI below.
`reconstructAtRevision(matchId, revision)` reads durable Match metadata, selects the greatest
snapshot revision at or before the target, and loads only `base < revision <= target` actions
in ascending revision order. `reconstructFinalState(matchId)` targets the FINISHED Match's
canonical `finalRevision`, never a guessed maximum action revision. Invalid targets are rejected.
IN_PROGRESS matches support explicit persisted targets; WAITING/CANCELLED matches are excluded.

Without a suitable checkpoint, reconstruction uses Match.seed and the compact versioned
Match.initialConfig (original game mode, host seat/occupancy, arena and RNG algorithm).
Live creation and replay call the same pure `createInitialMatchState` function. Creation uses
default armies in all modes, matching the existing runtime; later lobby setup actions supply
the accepted mode/hero selections. Revision zero is this creation state. Revision N is state
after accepted action N. New matches journal readiness and mode changes as well as draft/gameplay,
so revisions are contiguous. Missing, duplicated, unordered or malformed required actions fail.

Lobby action payloads include a private `_replay` v1 setup envelope: domain host/seat/readiness,
mode, actual hero selections and bounded accepted draft history. These inputs capture changes
that occur between revisions without storing whole GameState blobs or connection/user IDs.
Draft commands use pure draft rules; checkpoint continuation restores their bounded draft cursor.
Persisted actions pass a validated deserialization boundary and preserve P1/P2 actor semantics.
The existing snapshot v1 loader validates state, format, revision and RNG data; unsupported
snapshots fail explicitly rather than falling back silently.

Each call owns its state and SeededRNG. Initial replay seeds the existing Numerical Recipes LCG;
checkpoint replay restores the exact uint32 continuation cursor, including zero. Rules re-execute
random intents deterministically; saved event results are not substituted for rolls. Replay reads
no live room, sockets or sessions, broadcasts nothing, and writes no actions, snapshots, match
results, participants, ratings or statistics. PostgreSQL integration tests enforce READ ONLY.

`validateFinalDeterminism(matchId)` always reconstructs from revision zero through the full
accepted journal and compares with the exact final snapshot. Equality reuses snapshot JSON
normalization (ordered units, omitted undefined members and empty presentation history) and
deep structural equality, then separately checks RNG algorithm/cursor. A state or RNG mismatch
raises a controlled ReplayError with safe identifiers only. Fast final reconstruction reports
`checkpoint_loaded` if it simply loads the final checkpoint; that does not prove determinism.
With no final checkpoint, reconstruction can succeed but validation reports `deterministic: null`.

Migration `20261003000000_replay_initial_config` adds one nullable JSONB column for small typed
creation inputs. Old rows are not guessed or backfilled: a compatible checkpoint plus complete
following actions can still reconstruct a historical segment; missing initial inputs prevent
independent full validation. A journal gap or incompatible historical format fails explicitly.
Phase 12 adds replay API/projection, UI/timeline and a small client cache. Restart recovery and
performance research remain future phases. See [the Phase 11 report](docs/phase11-implementation-report.md) for engine verification.

```bash
npm run -w server test:replay
# Requires the existing guarded, migrated loopback TEST_DATABASE_URL:
npm run -w server test:replay:db
```

## Replay API and UI (Phase 12)

Authenticated users can watch any **FINISHED** match with durable replay creation inputs,
two historical participants and a complete accepted-action journal. Active, waiting and cancelled
matches are rejected. Legacy matches without sufficient durable history return `MATCH_NOT_REPLAYABLE`.
This policy does not imply that all completed authoritative state is public.

- `GET /api/matches/:id/replay` returns matchId, status, gameMode, initialRevision (0), finalRevision,
  historical participants (seat, userId, displayNameSnapshot as displayName, optional current username/avatar,
  outcome), persisted winnerSeat/finishReason/timing and an ordered lightweight timeline.
- Timeline entries contain only revision, actorSeat, actionType and createdAt. No action payloads,
  events, snapshot JSON, seed, RNG cursor or reconstructed states are returned in metadata.
- `GET /api/matches/:id/replay/state?revision=N` returns `{ matchId, revision, state: ReplayView, action }`.
  Action is the lightweight timeline entry, or null at revision 0. UUID/revision validation uses Zod;
  revisions are never clamped. Internal reconstruction/base diagnostics are not exposed.

Routes delegate to the reader-only `ReplayQueryService`, which calls Phase 11's
`ReplayService.reconstructAtRevision`: nearest validated snapshot plus required accepted actions.
Normal navigation never runs full `validateFinalDeterminism`. Replay requests never write Match,
participants, actions, checkpoints or results, create/read a live GameRoom, touch room tokens,
broadcast sockets, or trigger statistics/ratings. Responses use `Cache-Control: no-store`.

`makeReplayView` is a pure, explicit field allowlist. It preserves the existing spectator visibility
rule: living stealthed units are omitted before the ended position; the ended position reveals units
as the current spectator design already does. Visible-unit HP is already public on that board.
Private hero memory, hidden traps/stakes, pending choices/rolls/targets, action legality, knowledge,
events, internal counters, RNG and unrevealed unit references are omitted. Only public visual forms,
statuses and board markers/effects remain. A future private field cannot enter the response through
an authoritative object spread.

Errors use the existing `{ error: { code, message } }` envelope: 401 `UNAUTHORIZED`, 404
`MATCH_NOT_FOUND`, 409 `MATCH_NOT_FINISHED`/`MATCH_NOT_REPLAYABLE`, 400 `INVALID_REQUEST`
(match id)/`INVALID_REPLAY_REVISION`, 500 `REPLAY_INTEGRITY_ERROR`, or sanitized 503 `REPLAY_UNAVAILABLE`.
Corrupt or unsupported history never yields a replacement guessed board.

Open `/matches/:id/replay`, or use **Watch Replay** on Match Details after its lightweight availability
check. There is no global Replay sidebar item. The page has both historical participants, persisted
result, a large read-only shared Board and beginning/previous/next/end/direct-revision controls.
Previous/next and the slider use actual timeline entries; the Phase 11 journal currently requires
contiguous revisions and treats gaps as corruption. Arrow Left/Right and Home/End work outside inputs
and other focused controls. `?revision=N` preserves position on refresh and browser back/forward.
Invalid URL revisions show feedback and make no state request.

React renders server-projected data only: it does not replay actions. Only the current HTTP result
and an LRU cache of at most **five** recently viewed states are retained; there is no mass prefetch
or server-wide all-state cache. AbortController and ignored aborted results prevent request races.
The slider updates its local label immediately and commits after **180 ms** without further changes.
Metadata/controls remain visible during board loading. English/Ukrainian labels and responsive board
fit support desktop, tablet and mobile. Direct replay entry does not mount/reconnect the game runtime or read/write room tokens;
an already running game remains mounted when navigating other pages, without replay initiating a socket.
The existing Vercel SPA fallback covers direct entry and refresh.

No Phase 12 schema change or migration is required. Autoplay, speed controls, branching/export/sharing
systems, live spectating, restart recovery, statistics and ratings are outside this replay phase.

## Glicko-2 Rating (Phase 15)

The backend implements [Mark Glickman's official revised Glicko-2 algorithm](https://glicko.net/glicko/glicko2.pdf)
directly, without a third-party rating package. Its pure module lives in
`packages/server/src/rating/{glicko2,types,constants}.ts` and imports no database, transport or match code.
External rating/RD convert to internal mu/phi using scale `173.7178`; volatility is updated using the
official bracketed Illinois iteration, then the rating/RD return to the external scale. Both bracket
search and iteration have a defensive limit of 100; invalid/non-finite input or non-convergence throws
`Glicko2Error` before any transaction can commit. No arbitrary rating/RD/volatility clamps are applied.

Canonical new-player state is **rating 1500, ratingDeviation 350, volatility 0.06, ratedGames 0**.
Algorithm options default to **tau 0.5, epsilon 0.000001** in `rating/constants.ts`. Trusted server code
can configure tau/options through the third `RatingService` constructor argument; HTTP clients cannot.
Existing registration still creates `Rating` atomically. Older users without a row read synthesized
defaults; their first eligible game creates the row inside the rating transaction. Public reads never
materialize rows or repair ratings. PostgreSQL double precision stores full values; no destructive rounding.

FATE deliberately treats **one completed rated match as one rating period with one opponent**.
There is no time-based inactivity inflation or background inactivity job. The pure algorithm supports
an empty mathematical period, but the application never invokes it on elapsed time. This online product
decision differs from the multi-game periods recommended by the specification.

`Match.isRated` defaults to **false**, including all existing rows. Current room creation remains casual;
trusted `MatchService.createWaitingMatch` callers may explicitly designate a new match with `isRated: true`.
No Rated/Casual selector or client-controlled opt-in exists yet. Historical matches are never automatically
backfilled. The one canonical `eligibleRatingPlayers` function requires an explicitly rated `FINISHED`
match, a supported `standard`/`classic`/`draft` mode, a durable completion date/revision and exactly two
distinct registered P1/P2 participants. Guests, self-play, missing seats, unknown/debug/sandbox modes,
cancelled and unfinished matches cannot affect rating. Heartbreak/test rooms never create a persistent
Match and are excluded at every lifecycle boundary. Win/loss outcomes must agree with canonical winner
and loser seats/user IDs. The existing real `chessMutualKingDefeat` draw supports score 0.5 for each player;
normal WIN/LOSS scores are 1/0. Corrupt competitive results fail without rating mutation.

Persistence reuses the existing **`Rating`** model (the PlayerRating equivalent) and **`RatingHistory`**.
History adds opponent user ID, participant-relative result and `ratedGameNumber`, together with existing
before/after rating, RD, volatility and processing timestamp. New histories populate all these fields;
nullable additions preserve foundation-era records without inventing data. Existing unique
`(userId, matchId)` ensures at most one history per player/match; new unique `(userId, ratedGameNumber)`
captures a durable per-player processing order even when timestamps tie. History is append-only in
application code. Existing deletion semantics remain: owner User deletion is restricted by history;
Match/opponent deletion nulls its reference and preserves the audit. Current Rating/Profile rows keep
their existing cascade policy. Existing rating-descending and user/date indexes are reused.

`MatchService.finalizeMatch` first commits canonical results after the action/snapshot journal barrier,
then invokes `RatingService.processRatedMatch`. That separate **Serializable** transaction:

1. Locks/loads Match, checks eligibility, marker and history consistency.
2. Locks both registered User rows in sorted ID order (also protecting missing-row initialization).
3. Obtains both pre-match rating states and computes **both** new states from those original values.
4. Updates both ratings and increments each `ratedGames` once, inserts both immutable histories,
   and sets `Match.ratingProcessedAt` to the same processing timestamp.

All rating writes commit together or all roll back. Concurrent duplicates return a clean
`alreadyProcessed: true` with exactly two histories and one logical effect. A processed marker with
missing/inconsistent histories raises a domain error. Serializable isolation plus User locks prevents
lost updates across different matches sharing players, including concurrent first games. Actual successful
serialization order is persisted in `ratedGameNumber`; it is processing order, not gameplay finish order.
Delayed recovery uses the current committed rating and appends a new period, without rewriting history.
Prisma `P2034` and raw-query `P2010` carrying only PostgreSQL SQLSTATE `40001`/`40P01` are retried with
25/50/75/100 ms backoff, at most five attempts. Domain/math/integrity errors are not retried by this service.
Logs include safe match ID, semantic outcome, alreadyProcessed and retry count, never User objects/credentials.

If rating fails after completion, the durable Match stays `FINISHED` with `ratingProcessedAt = null`.
The existing bounded lifecycle retries and drain include rating. After process restart, trusted tooling
can call **`processRatedMatch(matchId)`** using only persisted data, or retry canonical finalization.
Startup now scans FINISHED Rated matches with ratingProcessedAt=null and invokes this same
idempotent processor. There is no full background worker, repair HTTP endpoint or historical backfill.
The pending-match index `(isRated, status, ratingProcessedAt)` supports the startup repair scan.

Public competitive data follows existing public profile/statistics policy:

| Endpoint | Contract |
| --- | --- |
| `GET /api/users/:id/rating` | `{userId, rating, ratingDeviation, volatility, ratedGames, rankTier, rankProgress}`; defaults for a valid unrated user. |
| `GET /api/users/:id/rating/history?page=1&limit=20` | Safe before/after history DTOs, opponent/result, period number, ISO processing date and derived `ratingDelta`; `{items, pagination:{page,limit,total,totalPages}}`. |

History returns newest processed periods first, with timestamp/ID fallbacks for unnumbered legacy rows.
Default page/limit are 1/20; limit cap is 100. Pagination count/items share a RepeatableRead snapshot.
Both endpoints validate UUIDs and use `Cache-Control: no-store`; missing users return 404, invalid
query/UUID returns 400, infrastructure/internal failures are sanitized. No private User, match state,
email, auth session or credentials are returned. Match details, statistics and replay reads never process rating.
There is no writable rating endpoint, reset/editor, client-side rating calculation or rating-history chart.
The read-only Leaderboard and derived canonical major ranks are described below.

Apply new incremental migration **`20261003010000_glicko2_rating`** using `prisma migrate deploy`.
Prior production migrations are unchanged; production Render/Neon deployment is a separate operation.
For verification, first set both DATABASE_URL and DIRECT_URL to a guarded local TEST_DATABASE_URL,
apply the full migration chain to a clean local test DB and check migration status. Never reset/push production.

```bash
npm run -w server test:rating
npm run -w server test:rating:db
```

The reference calculation yields `1464.0506705393013 / RD 151.51652412385727 / sigma 0.059995984286488495`.
The publication rounds intermediates and reports approximately `1464.06 / 151.52 / 0.05999`; tests use
tolerances plus tighter full-precision regression assertions. Tests cover WIN/LOSS/DRAW, uncertainty,
numeric validation, convergence limits, rollback at the final write, same-match concurrency, shared-player
concurrency and lazy initialization across independent clients, coherent history, eligibility, crash repair,
real lifecycle journal/drain/retry, public pagination, read-only GET operations and audit constraints.
See [the Phase 12 implementation report](docs/phase12-implementation-report.md) for contracts and verification.

## Leaderboard (Phase 16)

Public `GET /api/leaderboard` and `/leaderboard` expose competitive standings through
`leaderboardRoutes -> LeaderboardService -> LeaderboardRepository -> PostgreSQL/Prisma`.
The sidebar includes Leaderboard with its active state; public profiles are linked at `/users/:username`.
Existing Vercel SPA rewrites support direct navigation and refresh.

The current PlayerRating equivalent is **`Rating`**. Its precise persisted rating, ratingDeviation and
ratedGames are authoritative. Reads never recalculate Glicko-2, increase RD, recover matches or write history.
The UI rounds rating/RD for display, labels RD **Uncertainty**, and explains that lower values mean a more
established rating. Volatility remains internal to this page.

Qualification uses **`LEADERBOARD_MIN_RATED_GAMES`**, default **5**; the optional non-secret environment
override must be an integer from 1 through 2147483647. Configuration is validated at startup. RD is not
an additional qualification threshold. Players with zero rated games are excluded. Players with 1–4
games under the default policy appear in **Provisional**, with raw rating/RD, progress, games remaining
and **`ratingRank: null`**. Qualified players appear in **Ranked**, which is the default list. The response
includes `qualification.minRatedGames`; the frontend never hardcodes the policy threshold.

Leaderboard **games played means `Rating.ratedGames`**. Performance aggregates use durable
`MatchParticipant.outcome` for rated FINISHED matches with a non-null ratingProcessedAt/finishedAt,
a supported standard/classic/draft mode, and a matching numbered successful RatingHistory result.
The processing marker/audit attribution prove successful canonical rating processing; reads do not
revalidate/reprocess historical opponents after deletion. Casual, pending/failed rating processing,
test/debug/sandbox and cancelled matches do not affect performance or qualification. Normal test rooms
never persist these matches. Win rate is **rated wins / ratedGames**, including draws in the denominator.
Last activity is **MAX(Match.finishedAt)**, independent of login/profile/casual activity. Career Statistics
semantics are unchanged and can include casual games.

Rating counters survive Match deletion in the existing schema. If available processed result count
does not equal ratedGames, the row keeps its authoritative rating/games/status/rank and exposes
`performanceAvailable: false` with wins/losses/draws/winRate/lastActivity all null. The UI shows unavailable
performance with an explanation, instead of presenting contradictory numbers. Pending rated completion
before the atomic rating commit affects neither the current counter nor performance. Missing metrics
sort last in both directions.

Canonical competitive order is **rating DESC, ratingDeviation ASC, ratedGames DESC, userId ASC**.
PostgreSQL `ROW_NUMBER()` produces global ordinal ratingRank before requested sorting/pagination.
That rank stays unchanged when viewing ascending rating, games played, win rate or last activity.
All sorts have deterministic secondary keys; only whitelisted Prisma SQL fragments select column/order.
Parameters, qualification, game modes, limit and offset are bound values. Count and rows share a
RepeatableRead snapshot. There are **two SELECT queries** per request, with database aggregation/sorting/
pagination and no per-player queries or full-history transfer to Node. Existing rating, participant,
match-eligibility and history unique indexes suffice at current scale; Phase 16 needs no migration,
materialized view/table, cache, polling, cron or socket.

Query contract (unknown fields and invalid values return the existing **400 INVALID_REQUEST**):

| Parameter | Default | Supported values |
| --- | --- | --- |
| status | qualified | qualified, provisional |
| page | 1 | positive integer, max 21474836 |
| limit | 20 | integer 1–100 |
| sort | rating | rating, gamesPlayed, winRate, lastActivity |
| order | desc | asc, desc |

Response:

```json
{
  "items": [{
    "ratingRank": 12,
    "user": { "id": "uuid", "username": "Tactician", "displayName": "Player", "avatarUrl": null },
    "rating": 1584.72, "ratingDeviation": 81.34, "ratedGames": 47,
    "wins": 29, "losses": 18, "draws": 0, "winRate": 0.6170212765957447,
    "lastActivity": "2026-10-03T08:00:00.000Z", "performanceAvailable": true,
    "status": "QUALIFIED", "gamesUntilQualified": 0
  }],
  "pagination": { "page": 1, "limit": 20, "total": 236, "totalPages": 12 },
  "qualification": { "minRatedGames": 5 }
}
```

Responses are no-store and contain only current public profile identity and competitive data. No
authentication is required. Internal/infrastructure errors are sanitized using existing API conventions.
No email, preferences, tokens, sessions or match payloads are selected.

The responsive interface uses a desktop table and compact cards on tablet/mobile, restrained top-three
rank accents, avatar fallbacks, long-name wrapping, keyboard-accessible tabs and sortable headers,
skeleton loading, both empty states, errors/retry and compact Previous/Page/Next pagination. Filter,
sort/direction/page/limit live in the URL; changing tab/sort resets page 1 and malformed URLs normalize.
English and Ukrainian translations include the server-provided threshold and uncertainty explanation.

```bash
npm run -w server test:leaderboard
npm run -w server test:leaderboard:db
npm run -w web test:leaderboard
npm run -w web test:leaderboard:e2e
```

Database tests require guarded LOCAL TEST PostgreSQL with the full migration chain deployed. Browser
smoke tests use HTTP fixtures and write screenshots to `packages/web/test-results/leaderboard/`.
See [the Phase 16 implementation report](docs/phase16-implementation-report.md) for exact verification.
Full Casual/Rated UX, Matchmaking Queue, seasons, tiers/divisions and advanced filters remain deferred.

```bash
npm run -w server test:replay-api
npm run -w web test:replay
# Existing loopback-only test-database guard; apply existing migrations to isolated test DB first:
npm run -w server test:replay-api:db
npm run -w web test:replay:e2e
```

## Quick Verify

- Open the Vercel site, check Network tab: `/rooms` should hit your Render domain
- Confirm WebSocket connects successfully (`wss://<render-host>/ws`)
- Visit `https://<render-host>/health` and see `{ ok: true }` (liveness).
- Visit `https://<render-host>/ready` and require HTTP 200 with `{ ok: true }` (PostgreSQL readiness).

## Notes

- The server is authoritative: the client only sends `GameAction` intents
- Per-player visibility is enforced by `makePlayerView` (exported from `rules`)
- Avoid running Vite with `--host 0.0.0.0` unless you explicitly need LAN access

## Developer Log

Track implementation updates, architecture notes, and release progress in the Telegram channel:

- https://t.me/FATE_Soul_Dev
## Casual / Rated matches (Phase 17)

New rooms default to **Casual**. Choose **Rated** explicitly in Create Match to
play a competitive match whose eligible result affects Glicko-2. This choice is
independent of the existing `gameMode` (`standard`, `classic`, `draft`); both types
use the same rules and the same GameRoom lifecycle.

Casual matches persist their results, actions and snapshots normally, appear in
Match History and support replay. They count toward general career statistics,
but never change Rating (rating, deviation, volatility or ratedGames), create
RatingHistory, or set ratingProcessedAt. They do not affect leaderboard rank,
qualification, rated wins/losses/win rate or last rated activity.

Rated matches require authenticated, distinct competitors. No existing Rating
row or completed placement games are required. Classification is immutable after
creation and visible in the room browser, Join by ID, pre-match screen, game HUD,
history, details and replay header. Eligible completed Rated matches use the
existing atomic, idempotent Glicko-2 processing.

The durable source of truth remains `Match.isRated` (default `false`). API DTOs
expose only `matchType: "CASUAL" | "RATED"`. Historical rows retain their existing
classification; unrated rows stay Casual and are never backfilled into rating.
Phase 17 needs no schema migration or environment flag. Test/debug/Heartbreak
rooms are always Casual and do not create persistent matches; Heartbreak stays
hidden when test rooms are disabled. Requests for Rated test rooms are rejected.

API contracts:

- `POST /rooms` and `POST /api/games`: optional `matchType` (omitted means Casual),
  independent optional `gameMode`; Rated creation requires a verified Bearer token.
- WebSocket `joinRoom` with `mode: "create"`: optional `matchType`; Rated creation
  requires `accessToken`. `mode: "join"` must omit `matchType` because it cannot
  redefine the room's policy.
- `GET /rooms` and public `GET /rooms/:id`: room summaries include `matchType`.
  Join by ID resolves this metadata before enabling Join.
- WebSocket `joinAck` and `roomState.meta`, completed-match history/details and
  replay metadata include `matchType`, derived from authoritative room/DB data.
- Stable classification errors include `INVALID_MATCH_TYPE`,
  `RATED_MATCH_REQUIRES_AUTHENTICATION`, `RATED_MATCH_INVALID_PARTICIPANTS`,
  `RATED_MATCH_SAME_USER` and `MATCH_TYPE_IMMUTABLE`.

Verification: `npm run -w server test:match-types`,
`npm run -w server test:match-types:db` (guarded local TEST_DATABASE_URL), and
`npm run -w web test:match-types:e2e`. Rated matchmaking is described below.
Seasons and a separate placement algorithm remain deferred. Canonical rank-tier UI is described below.


## Rated Matchmaking Queue (Phase 18)

Play includes **Find Rated Match**, a game-mode selector, current rating, elapsed waiting
time, the server's current search window and **Cancel search**. Manual creation, joining
and browsing live on `/lobby`; Test/Sandbox rooms remain capability-gated. New and
provisional players can queue; leaderboard qualification is not required.

Only authenticated persistent Users may queue. The server uses `RatingService.getPlayerRating`
(current Glicko-2 rating and RD); missing Rating rows use the canonical **1500 rating / 350 RD**.
Neither request bodies nor frontend timers choose a rating or drive compatibility. `standard`,
`draft` and `classic` are separate queues in the same service; only equal actual game modes pair.
All resulting Matches explicitly persist `isRated=true` (the canonical `RATED` classification).

Defaults, parsed once through typed server configuration:

```dotenv
MATCHMAKING_SERVER_PROCESSES=1
MATCHMAKING_INITIAL_RATING_RANGE=100
MATCHMAKING_RATING_RANGE_STEP=50
MATCHMAKING_RANGE_STEP_SECONDS=15
MATCHMAKING_MAX_RATING_RANGE=400
RECONNECT_GRACE_MS=45000
```

Ranges must be nonnegative, step and interval positive, maximum at least initial, and values
must fit validated integer bounds. The single periodic matcher ticks every second and is
also scheduled after enqueue. It starts once, uses `unref()`, and drains in-flight creation
before the normal MatchLifecycle shutdown. There are no per-user queue timers.

`range(waitMs) = min(maxRange, initialRange + floor(max(0, waitMs) / stepMs) * rangeStep)`.
Thus 0–14.999s accepts ±100, 15s ±150, 30s ±200, 45s ±250, 60s ±300, 75s ±350 and 90s+
±400. Compatibility is **mutual**: `abs(A.rating-B.rating) <= min(A.range,B.range)`.
The oldest available user is considered first, chooses the smallest compatible rating gap,
then breaks ties by earliest joinedAt and userId. The small-queue scan is O(n²), and performs
no per-candidate DB reads. RD is metadata, not a hidden compatibility formula. No ETA is shown.

### HTTP and WebSocket contract

All HTTP endpoints require `Authorization: Bearer <access token>`, return `Cache-Control:
no-store`, and have a 60-requests/minute limit. POST is strict and rejects rating/RD/extra fields.

| Method | Endpoint | Body / result |
|---|---|---|
| POST | `/api/matchmaking/queue` | `{ "gameMode": "standard" }`; idempotent current status |
| GET | `/api/matchmaking/queue` | Current user's queue or established assignment |
| DELETE | `/api/matchmaking/queue` | Cancel if QUEUED; harmless when absent; claim/result wins if already MATCHING/FOUND |

The existing `/ws` game connection sends `{type:"matchmakingSubscribe",accessToken,requestId}`.
The server authenticates the persistent account, registers this connection for user-based delivery,
and acknowledges `{type:"matchmakingSubscribed",requestId}`. Subscribe precedes HTTP join so a
connected delivery route exists. `{type:"matchmakingUnsubscribe"}` cancels unclaimed queue state
and removes that connection's routing; ordinary socket close uses reconnect grace instead.
No additional matchmaking WebSocket is opened.

Server notifications have `{type:"matchmakingStatus"|"matchmakingFound",revision,status}`.
Revision is monotonically increasing within this process; clients reset their revision gate when
rebinding and ignore older events, old-account delivery and HTTP responses superseded by events.
HTTP status responses also include `revision`, so a confirmed cancellation rejects older queued
events even when HTTP delivery overtakes the WebSocket stream.

```json
{"type":"matchmakingStatus","revision":17,"status":{"status":"QUEUED","joinedAt":"2026-10-03T10:00:00.000Z","waitMs":30000,"rating":1512,"currentRange":200,"gameMode":"classic","available":true}}
```

```json
{"type":"matchmakingFound","revision":19,"status":{"status":"MATCH_FOUND","matchId":"persistent-match-id","roomId":"runtime-room-id","seat":"P1","gameMode":"classic","matchType":"RATED","opponent":{"displayName":"Opponent"}}}
```

Statuses are `NOT_QUEUED`, `QUEUED`, `MATCHING` (claimed, durable creation/retry pending) and
`MATCH_FOUND`. P1/P2 receive the same matchId/roomId with opposite seats. Only the opponent's
public display-name snapshot is included, never email, credentials or rating internals.
Stable errors include `AUTH_REQUIRED`, `UNAUTHORIZED` (expired/invalid HTTP token),
`MATCHMAKING_INVALID_REQUEST`, `MATCHMAKING_CONNECTION_REQUIRED`, `MATCHMAKING_ALREADY_IN_MATCH`,
`MATCHMAKING_IN_QUEUE`, `MATCHMAKING_CANCELLED`, `MATCHMAKING_UNAVAILABLE` and `RATE_LIMITED`.

### Identity, claims and recovery policy

A Map keyed by userId enforces one active entry. In-flight joins are coalesced, repeated joins
preserve joinedAt, mode and expansion progress, and joining after a successful result returns
that same result while its room is usable. Multiple tabs receive the same assignment.
Normal competitor seats and in-flight competitor mutations block queue eligibility. Creating
or joining another normal competitor flow while queued is rejected: cancel search first.
Spectators and Test/Sandbox activity do not block queue eligibility.

Pair selection transitions **both** entries to MATCHING synchronously before any await; concurrent
ticks share one tracked pass. Cancellation before claim removes the entry; cancellation after
claim returns MATCHING or MATCH_FOUND without cancelling the durable match. Seat assignment
is randomly swapped using server crypto, independently of the normal game seed.

MatchLifecycle stages a normal GameRoom privately. The existing MatchService/MatchRepository
creation path atomically writes a WAITING Rated Match **and both MatchParticipants**, including
User IDs and display-name snapshots. It publishes the normal room only after this succeeds,
then emits Match Found. Immutable user-ID reservations protect both seats before either client
joins, after explicit leave and after reconnect grace expires. The room browser reports both
seats occupied/reserved; spectators follow existing policy. Matched users resume their own
reserved seat using verified account identity; only one transport per seat controls gameplay,
so a later same-account tab can replace the prior connection. Selected game mode is locked.
Ready/start, draft, actions, snapshots, results, replay, Glicko processing and leaderboard all use
the existing normal implementations. There is no matchmaking-specific rating or gameplay path.

A known transaction rollback plus a successful absent-row lookup, with no earlier uncertain try, restores both users to
QUEUED with their original joinedAt. An uncertain failure (including a possible late commit) keeps
both claims and retries the **same roomId, seed and participants**. A lookup alone never proves an
uncertain transaction rolled back. Uncertainty persists across retries: even a later known rollback
cannot release an earlier unresolved attempt. No Match Found is sent until the room is usable. Committed
Matches remain durable even if delivery fails; GET/re-subscription redelivers the same assignment.

All currently authenticated user connections receive events. When the last disconnects, the
entry becomes unavailable for new pairing but retains joinedAt for RECONNECT_GRACE_MS (45s by
default). Rebinding restores availability; grace expiry removes an unclaimed entry using the
single tick. Refresh restores state with subscription plus GET. Logout cancels unclaimed queue
state through the server's refresh-session logout flow and frontend unsubscribe; an existing claim
still wins. A waiting/active matched reservation remains owned until its normal room lifecycle
ends or cleans up; it cannot be reused to enter a conflicting match.

### Deployment boundary and deferred scope

**Matchmaking is process-local, not distributed. Run exactly one active Node server accepting
matchmaking clients.** Current room/runtime storage also uses process-local registries. Do not
scale this service horizontally, run Node cluster/PM2 workers, or overlap active matchmaking
processes during deployment. `MATCHMAKING_SERVER_PROCESSES` accepts only `1`; deployment must
actually enforce this topology. It is a configuration assertion, not a distributed lock.

Queued users and cached runtime assignments are lost on server restart. Persistent Matches,
participants, journals and ratings remain durable; active matches now recover through
[Server restart recovery](docs/server-restart-recovery.md). Waiting lobbies are neutrally cancelled.
Redis, durable queue recovery, accept/decline, dodge penalties, ETA/metrics,
parties/teams, regions/latency and bot fallback are deliberately deferred.

Run `npm run -w server test:matchmaking`, `npm run -w web test:matchmaking` and the guarded local
`npm run -w server test:matchmaking:db`. The real-browser test is
`npm run -w web test:matchmaking:e2e`; it requires an isolated loopback TEST_DATABASE_URL and
Chromium/Edge, and preserves desktop/tablet/mobile screenshots under
`packages/web/test-results/matchmaking/`. Never run these database tests against production Neon.


## Canonical Rank Tiers

`packages/server/src/rating/rankTiers.ts` is the single backend definition for exactly eight major tiers:

| Tier | Precise rating interval |
| --- | --- |
| SHADOW | rating < 350 |
| CRESCENT | 350 ≤ rating < 700 |
| HALF | 700 ≤ rating < 1100 |
| FULL | 1100 ≤ rating < 1600 |
| ECLIPSE | 1600 ≤ rating < 1750 |
| BLACK_MOON | 1750 ≤ rating < 1850 |
| NOVA | 1850 ≤ rating < 2000 |
| DESTINY | rating ≥ 2000 |

Boundaries operate on precise floating-point rating, without rounding. The unchanged initial
Glicko rating **1500 maps to Full**, including before leaderboard qualification. **2000 begins Destiny**;
Destiny is the maximum major tier but does **not** cap numerical rating. Invalid non-finite
ratings throw a controlled domain error. Tiers and image paths are never persisted; no new migration.

Rating reads return `rankTier` and `rankProgress` (`currentMin`, `nextTier`, `nextRating`,
`ratingToNext`, `progress`, `isMaxRank`). Finite-tier progress is
`(rating - currentMin) / (nextRating - currentMin)`, clamped to 0..1. Shadow has no invented lower
bound and returns null percentage plus distance to Crescent. Destiny returns null next tier,
threshold and percentage, zero distance, and `isMaxRank: true`. Leaderboard items return the same
derived `rankTier`; sorting, placement and matchmaking continue using precise numeric rating.

Play uses server progress; leaderboard and own/public Profile reuse `RankEmblem`. Provisional status
is independent from tier and never hides the actual medal. Integer ratings are displayed with
**Math.floor** in Play, profile, leaderboard and queue rating; e.g. Nova at 1999.7 displays 1999.
Distance to the next tier uses **Math.ceil**, so a remaining 0.3 displays 1 rather than 0.
Neither display operation changes stored rating or backend progress.

Verification: `npm run -w server test:ranks`, `npm run -w web test:ranks`,
`npm run -w web test:ranks:e2e`, and existing rating/leaderboard/profile/Play tests.
Divisions, promotion/demotion animation, seasonal ranks and rewards are deferred.

## Play and Lobby

The sidebar separates **Play**, **Lobby**, **Figure Set**, **Match History**, **Leaderboard**
and **Profile**. The existing `/` bookmark remains Play; `/lobby` opens custom games.
Existing live sessions and reconnects still use the shared GameRuntime.

**Play** is a competitive hub: numeric Glicko rating, rating uncertainty, rated-game count,
provisional/qualified identity, and Rated matchmaking as its primary action. Qualification
uses `LEADERBOARD_MIN_RATED_GAMES`, exposed by `GET /api/competitive/config`; the frontend
does not hardcode a qualification threshold. `RankEmblem` renders the canonical backend tier
through the approved asset registry, including for provisional players. Rank progress uses
backend metadata and remains separate from leaderboard qualification. Seasons and rewards are deferred.
Queue state replaces the identity panel with server rating/range, game mode, elapsed time
and cancellation; Match Found announces You vs opponent and enters the assigned game.

**Lobby** contains manual Casual/Rated creation, an optional lobby name, actual game-mode
selection, Join by Code, and waiting/in-progress browsers with status/type filters. Cards
show human participant names, host, spectator count and Join/Spectate. The list refreshes
every ten seconds or on request. Active Casual/Rated games support the existing spectator
projection. Matchmade games also appear; their seats remain permanently reserved, and
even their starting cards offer only Spectate. Matchmade ready/start controls retain the
existing normal gameplay flow.

Names are trimmed, 1–60 characters, accept Unicode/Cyrillic, reject control characters,
and render as escaped text. Omitted names use a display-name-based fallback for WS hosts
or `FATE Lobby` when no host profile is available. Names need not be unique. The server
stores `lobbyName` on GameRoom and in the existing `Match.initialConfig` JSON, with a
backward-compatible optional schema field. Refresh/reconnect/list updates preserve it;
startup recovery now restores this metadata alongside the existing live Match. No database migration
or ID migration is required. Internal room/match/user IDs retain their routing and
ownership roles. Normal cards and game headings hide them; Copy Join Code reveals only
the existing room identifier, never private seat/resume/auth tokens.

Authenticated names prefer trusted displayName, then username. Occupied anonymous
sandbox slots display Guest, and vacant slots display Waiting for player. Normal Casual
competitor seats still require authentication, matching the existing server policy.
Debug screens retain their capability-gated technical information.

### Manual Rated start protection

Manual Rated games may start only when two distinct authenticated users occupy ready
seats and `abs(P1.rating - P2.rating) <= MATCHMAKING_MAX_RATING_RANGE`. The inclusive
boundary is intentional: 1800 vs 1400 is allowed at 400; 1800 vs 1350 is rejected.

`createMatchmakingService` passes its **same typed MatchmakingConfig instance**
(`matchmaking.config.maxRange`, parsed in `matchmaking/config.ts`) to MatchLifecycle.
There is no separate manual maximum. `RatingService.getPlayerRatings` reads canonical
`Rating` rows in one batched query for discovery, using `INITIAL_RATING.rating` (1500)
for authenticated users without a row. Server metadata exposes only ratings, difference,
maximum, eligibility and a reason; it does not expose volatility or private identities.

At every manual start attempt, MatchLifecycle reloads current ratings after participant
synchronization and before applying/journaling the start action. The WS draft transition
also validates before starting a draft or rebuilding armies. Debug REST and direct
lifecycle callers use the same gate. Discovery metadata is never trusted at start.
`RATED_RATING_DIFFERENCE_TOO_LARGE` leaves the lobby Rated and intact: no gameplay start,
accepted start event, result, rating history or rating update. Lookup failure also blocks
Rated start. Rejection refreshes WS compatibility metadata; the frontend disables Start
and explains the gap, maximum and explicit Casual alternative.

Casual games ignore rating difference. Automatic matchmaking keeps its dynamic mutual
range (initial → expanding → maximum); manual lobbies use only the absolute maximum.
Successful manual games retain the existing exactly-once Glicko, history, statistics,
leaderboard and deterministic replay pipelines.

Checks: `npm run -w server test:lobby`, `npm run -w web test:shell`,
`npm run -w web test:play-lobby:e2e`, and the guarded local PostgreSQL
`npm run -w server test:match-types:db` include naming, escaping, boundary/stale ratings,
direct WS/action/draft bypass, blocked zero-rating-effects and successful complete games.

### Administration backend and RBAC

The backend supports persistent `USER`, `MODERATOR` and `ADMIN` roles, account blocking,
current database authorization and paginated inspection under `/api/admin/*`.
Moderators can block/unblock USER accounts; admins can additionally moderate MODERATOR
accounts and assign roles. Match/action/snapshot/result/rating inspection is read-only.

Bootstrap an existing unblocked account from a server shell with the configured database:

```powershell
npm run -w server db:migrate:deploy
npm run -w server admin:promote -- existing_username
```

See [administration API, permission matrix and blocking semantics](docs/admin-backend.md)
for filters, pagination, privacy, session/WebSocket behavior and guarded test commands.
The role-gated [Admin UI](docs/admin-ui.md) is available at `/admin` to MODERATOR and
ADMIN accounts. It includes a system overview, server-filtered paginated user/match
lists, account details and per-mode ranks, confirmation-based block/unblock/role
changes, and read-only match/action/snapshot metadata inspection. USER accounts
cannot see the navigation entry or enter the routes. Backend authorization remains
authoritative. The append-only [Audit Log](docs/audit-log.md) is available at
`/admin/audit` exclusively to ADMIN accounts. It records block/unblock, role changes
and unrecoverable system match interruptions atomically with the affected durable state.

Checks: `npm run -w web test:admin`, `npm run -w server test:admin`,
`npm run -w web test:admin:e2e`. Browser tests use isolated local fixtures and do not
moderate real accounts.

### REST validation and errors

REST failures use `{ error: { code, message, details? } }`, with stable codes,
Zod-validated input and safe unexpected-error responses. See the
[API error contract and route audit](docs/api-errors.md) for HTTP statuses,
validation details, pagination limits, auth/refresh behavior and operational exceptions.
Run `npm run -w server test:api-errors` for the focused HTTP contract checks.
The [implementation report](docs/api-validation-implementation-report.md) records
the changes, compatibility decisions and actual verification results.
