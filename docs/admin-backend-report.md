# Admin backend + RBAC implementation report

Date: 2026-10-04. API contract, permission matrix and operational instructions are in
[admin-backend.md](admin-backend.md).

## Architecture actually found

The repository is an npm workspace with Fastify 4, Prisma 6/PostgreSQL, Zod, `ws`,
Argon2id password verification, hand-written safe DTOs and domain error envelopes.
Auth routes use origin checks, HTTP-only refresh cookies and the existing rate-limit
plugin. Access JWTs identify the account; refresh JWTs identify account/session.
`AuthSession` stores a SHA-256 refresh-token hash, expiration/revocation/last-use dates.
Refresh tokens rotate atomically, reuse revokes the session, and rotation does not extend
the original session lifetime. Logout revokes that refresh session and cancels its queue.

Before this change, User had UUID ID, unique email, optional passwordHash and timestamps;
username/displayName were in Profile. There was no role/block/admin subsystem to reuse.
Protected HTTP middleware trusted a verified JWT's subject without loading current User.
ConnectionIdentityService loaded User/Profile on multiplayer authentication, while
established gameplay sockets retained their verified identity across access-token expiry.

Matches persist `WAITING/IN_PROGRESS/FINISHED/CANCELLED`, string gameMode constrained
to standard/draft/classic, `isRated`, results and revision/lifecycle metadata. Participants
store nullable User identity, historical name and seat/outcome. MatchAction and
MatchSnapshot already have unique `(matchId,revision)` indexes. Snapshots include
authoritative state and RNG. Mode ratings use the actual `Rating` model keyed by
`(userId,gameMode)`, with LegacyGlobalRating and legacy/mode RatingHistory streams.
Process-local room queues, reconnect grace, matchmaking and durable recovery already exist.

## Schema and policies

Migration `20261004120000_admin_rbac` adds enum `UserRole { USER MODERATOR ADMIN }`,
`User.role @default(USER)`, nullable `blockedAt TIMESTAMPTZ(3)` and nullable
`blockedReason VARCHAR(500)`. Existing rows default to USER/unblocked. No tables,
sessions, history or rating data are recreated. Historical-schema integration tests now
apply the new migration and compare every previous User column for preservation.

Added indexes: User role, blockedAt, `(createdAt,id)`; Match `(createdAt,id)`,
`(finishedAt,id)`, `(gameMode,isRated,createdAt)`. Existing status/classification and
action/snapshot revision indexes are reused.

`accountAccess.ts` loads only current account ID/role/block timestamp. The shared HTTP
middleware stores the resolved role on a request-associated WeakMap; role hooks consume
that trusted value. Mutation transactions reload actor and target again. No role or
blocked claim is embedded in JWTs, so an original token loses admin authorization after
demotion and cannot bypass a block. The current-user DTO exposes role only as presentation
metadata; the frontend parser/type was adjusted without creating admin UI.

Moderator can read the administration API and moderate USER. Admin can additionally
moderate MODERATOR and manage roles. Both ordinary block/unblock endpoints reject ADMIN
targets. Self-block and self-role changes are controlled errors. Role changes and CLI
promotion take a shared PostgreSQL transaction advisory lock. The last active admin
cannot be demoted; simultaneous mutual demotions leave one admin. Privileged promotion
requires an unblocked account, preventing a blocked administrator lockout.

The deliberate `npm run -w server admin:promote -- <username-or-email>` command finds
exactly one existing account in the configured database and promotes it. It rejects
missing/ambiguous/blocked targets and prints only a success account ID or a safe error.
Registration keeps its strict existing schema and cannot accept privilege fields.

## Blocking, sessions and runtime

Blocked login with correct credentials returns 403 ACCOUNT_BLOCKED; incorrect credentials
keep the generic login error. Refresh checks persisted block state. Protected HTTP,
including profile, authenticated action history and replay, rejects blocked accounts
using the same domain error. Public historic reads retain their existing behavior.

Blocking updates User and revokes all unrevoked refresh sessions in one transaction.
Concurrent login session creation locks/checks the User row. Rotation also requires
an active User. Unblocking clears timestamp/reason and permits fresh login; revoked
refresh credentials cannot become usable again.

After commit, AdminService invokes runtime cleanup: invalidate pending/queued matchmaking,
remove delivery subscriptions/found status, and close registered account sockets with
1008/ACCOUNT_BLOCKED. Multiple tabs and sockets subscribed only to matchmaking are covered.
Account registration/current checks retain the established room owner's association even
after a rejected attempt to authenticate another identity/seat.

Every authenticated WS frame and room command rechecks current User access. Production
sockets preserve the repository's previous continuity after JWT expiry while still
checking durable block state; new authenticated joins/subscriptions verify JWT validity.
Queue eligibility is checked at join and each pairing pass. New competitor-match creation
locks/checks involved accounts, while existing committed room IDs retain idempotent
recovery. Blocked recovered players cannot use their reserved historical seat to bypass
authentication. Disconnects use ordinary grace/room semantics, with no administrative
winner, forfeiture, rating punishment or GameState edit.

The existing process-local runtime model remains. Immediate socket closure targets the
server handling the block; other servers deny the next protected interaction/queue check.
Cross-process immediate passive-socket notification was not implemented.

## API and data boundaries

All nine administration routes require current MODERATOR/ADMIN permission; role PATCH
additionally requires ADMIN. The route plugin uses existing rate limiting, no-store
responses, strict Zod inputs and safe error mapping without Prisma diagnostics.

| Endpoint | Output/action |
| --- | --- |
| GET `/api/admin/users` | Stable paginated username/displayName/UUID search; role/status/sort filters |
| GET `/api/admin/users/:userId` | Safe identity/moderation metadata, per-mode rating summary, match count |
| POST `/api/admin/users/:userId/block` | Idempotent block, optional trimmed 500-character plain-text reason |
| POST `/api/admin/users/:userId/unblock` | Idempotent clearing of current block fields |
| PATCH `/api/admin/users/:userId/role` | Strict enum assignment with target/self/last-admin protection |
| GET `/api/admin/matches` | Paginated status/mode/classification/participant/ID/date filters |
| GET `/api/admin/matches/:matchId` | Lifecycle/results/participants, durable revisions, action/snapshot counts and latest snapshot metadata |
| GET `/api/admin/matches/:matchId/actions` | Revision-ordered persistent, validated action history |
| GET `/api/admin/summary` | DB counts/groupings for users/roles/statuses/modes/classification and small activity windows |

Users/matches default to 20 rows, maximum 100; actions default to 50, maximum 200.
Lists use deterministic sorting, relation/batched selections and consistent count/page
transactions. Actions are ordered by the existing unique revision key. Summary uses
COUNT/GROUP BY in PostgreSQL, without loading full tables or querying runtime internals.

Email is selected/returned only for ADMIN. DTOs exclude password/passwordHash,
refreshToken/refreshTokenHash/tokenHash and session objects, password reset/verification
and OAuth credentials, JWT/debug secrets, resume/seat/connection secrets, raw
initialConfig, participant resultData, action events, raw snapshot state/RNG and live
GameState. Known lobby name/origin are extracted explicitly from persisted initial
configuration. Replay setup is omitted from action payloads; malformed/unsupported
payloads expose metadata only, and nested credential-like keys are removed from extensible
gameplay ability payloads.

Inspection does not recover rooms, pause/play live state, journal actions, create
snapshots, process ratings or broadcast gameplay. POST/PATCH/DELETE attempts against
administrative match/action/state/snapshot/winner/rating paths return 404 and cannot
change persisted history. No new match, rating or GameState mutation API exists.

## Files added and changed

Added:

- `packages/server/prisma/migrations/20261004120000_admin_rbac/migration.sql`
- `packages/server/src/admin/{schemas,policy,dto}.ts`
- `packages/server/src/auth/{accountAccess,accountConnections}.ts`
- `packages/server/src/repositories/adminRepository.ts`
- `packages/server/src/services/adminService.ts`
- `packages/server/src/routes/adminRoutes.ts`
- `packages/server/src/scripts/promoteAdmin.ts`
- `packages/server/src/tests/{admin.test,admin.integration.test}.ts`
- `docs/admin-backend.md` and this report

Updated Prisma schema and server package scripts; auth middleware/errors/identity/self
DTO/service; session and new-match creation repositories; server/runtime/WS integration;
protected action/replay/matchmaking/creator error handling; the replay decoder's accepted
row type (decoding behavior unchanged); relevant auth/profile/schema/recovery/migration
tests; frontend auth parser/type and account fixtures; README.

## Verification and scope

Five new unit tests exercise the policy matrix, all read-route HTTP boundaries, current
role/block truth with the same JWT, strict input limits/privilege rejection, action
payload privacy, transactional last-admin guard and a blocked pending queue join.

The guarded admin DB suite exercises direct HTTP with USER/MODERATOR/ADMIN, deterministic
pages/search/filtering, moderator email privacy, summary counts, validated ascending and
descending action pages, read-only method rejection, target/self/idempotency policies,
login/refresh/current-user/profile/action/replay blocking, revoked sessions, two live
queue sockets, denied WS joins, new-match creation after block, revoked sessions after
unblock, a command already waiting on the room queue, an IN_PROGRESS match without
fabricated results, unchanged history/three-mode ratings, rejected identity-switch
association, stale demoted/promoted tokens, concurrent mutual demotions and CLI promotion.

Existing recovery DB tests additionally check blocked reserved-seat reconnect in both
Casual and Rated recovery. Existing historical migration tests prove pre-RBAC User data
defaults safely while preserving previous rating/history behavior. Existing profile
unit expectations now reflect fail-closed current-account verification without a DB;
payload validation with a real authenticated account remains in its DB suite. Existing
multiplayer expiry tests now assert current account reads while preserving socket
continuity after JWT expiry.

Only local loopback PostgreSQL `fate_admin_test` was used. No production/Neon tests,
production migration deployment or real-account promotion were performed. No visual
Admin UI was built or tested. Immutable Audit Log, OpenAPI overhaul, advanced moderation,
support flows, deletion/export, distributed ban notifications, impersonation and
competitive/game-state editing remain deferred.

Final command outcomes:

| Command | Result |
| --- | --- |
| `npm run -w server prisma:generate` | PASS, Prisma Client 6.19.0 generated |
| `npm run -w server db:validate` | PASS, schema valid |
| `npm run -w server db:migrate:deploy` | PASS on the isolated local DB, all 10 migrations applied |
| `npm run -w server db:migrate:status` | PASS, database up to date |
| `npm run -w web typecheck` | PASS, exit 0 |
| `npx tsc -p packages/server/tsconfig.json --noEmit` | PASS, exit 0 |
| `npm run lint` | PASS, 0 errors / 0 warnings, exit 0 |
| `npm run build` | PASS, exit 0 |
| `npm run test` | PASS, complete root pipeline, exit 0 |
| `npm run -w server test:admin` | PASS, 5/5 new unit tests; included in root pipeline |
| `npm run -w server test:admin:db` | PASS, guarded HTTP/session/queue/WS/role/inspection/CLI suite |
| `npm run -w server test:auth:db` | PASS |
| `npm run -w server test:profile:db` | PASS |
| `npm run -w server test:match:db` | PASS |
| `npm run -w server test:match-types:db` | PASS |
| `npm run -w server test:results:db` | PASS |
| `npm run -w server test:actions:db` | PASS |
| `npm run -w server test:snapshots:db` | PASS |
| `npm run -w server test:history:db` | PASS |
| `npm run -w server test:replay:db` | PASS |
| `npm run -w server test:replay-api:db` | PASS |
| `npm run -w server test:statistics:db` | PASS |
| `npm run -w server test:rating:db` | PASS |
| `npm run -w server test:leaderboard:db` | PASS |
| `npm run -w server test:matchmaking:db` | PASS |
| `npm run -w server test:recovery:db` | PASS, including blocked recovered accounts |
| `npm run -w server test:rating:modes:db` | PASS, both per-mode and historical migration suites |
| `npx tsx packages/server/src/tests/authenticatedMultiplayer.test.ts` | PASS; also passed in final root pipeline |
| `git diff --check` | PASS |

Build retains Vite's existing advisory for JavaScript chunks over 500 KB. Server tests
retain Node's experimental MockTimers notice. Neither is a lint warning or failed check.

During verification, an early concurrent rules rebuild temporarily removed shared dist
files and caused auth/profile DB startup failures; both suites passed on rerun. The
final build and complete root test pipeline were run sequentially. Other corrected
intermediate failures were the expected no-DB profile/established-socket test assumptions,
a test route typo, and the advisory-lock call's Prisma result decoding (the final lock
uses `$executeRaw`). No failing checks remain in the final runs.

Test logs are in the execution user's temporary directory as `FATE-admin-*.log`; fixtures
were removed by guarded suites. The disposable Docker databases are removed after
verification. Production deployment and production load/concurrency testing remain
unverified; this change is delivered as repository code/migration/documentation.
