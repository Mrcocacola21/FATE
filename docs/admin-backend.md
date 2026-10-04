# Administration backend and RBAC

FATE has three persistent account roles. Registration always creates `USER`; its strict
request schema rejects `role`, `isAdmin` and `isModerator`. Roles grant administration
permissions only. Gameplay legality, seat ownership, rating gaps and spectator visibility
continue to apply to every player.

| Capability                                                  | USER | MODERATOR | ADMIN |
| ----------------------------------------------------------- | ---- | --------- | ----- |
| Normal product/game access                                  | Yes  | Yes       | Yes   |
| Inspect users, matches, actions and summary                 | No   | Yes       | Yes   |
| Block/unblock USER                                          | No   | Yes       | Yes   |
| Block/unblock MODERATOR                                     | No   | No        | Yes   |
| Block/unblock ADMIN through ordinary API                    | No   | No        | No    |
| Assign roles                                                | No   | No        | Yes   |
| Read global Audit Log                                      | No   | No        | Yes   |
| Edit GameState, results, actions, snapshots, RNG or ratings | No   | No        | No    |

## Migration and first administrator

Deploy the incremental Prisma migration `20261004120000_admin_rbac` using the existing
migration workflow; do not use `db push`:

```powershell
npm run -w server prisma:generate
npm run -w server db:migrate:deploy
npm run -w server db:migrate:status
```

Existing accounts receive `role = USER`, `blockedAt = null` and `blockedReason = null`.
No existing accounts, sessions, match records or ratings are recreated. The canonical
block flag is `blockedAt != null`; there is no redundant boolean.

Create an ordinary account, then deliberately promote it from a server shell with the
configured `DATABASE_URL` (and `DIRECT_URL` for the Prisma migration CLI):

```powershell
npm run -w server admin:promote -- existing_username
# An existing email also works:
npm run -w server admin:promote -- account@example.com
```

The command requires exactly one existing, unblocked account. It reports its account ID
and returns nonzero on failure; it never prints passwords, JWTs or database diagnostics.
No account is promoted automatically. Ambiguous email/username matches are rejected.

## Authentication and blocking

`accessTokenPreHandler` verifies the JWT and reloads `id`, `role` and `blockedAt` from the
database on every protected HTTP request. Reusable `requireRole`, `requireModerator` and
`requireAdmin` hooks authorize this current role. Roles and block state are not JWT
claims. A valid pre-demotion JWT cannot preserve administration access. `/api/auth/me`
returns the current safe `role`; it never returns the block reason.

Login verifies the password before reporting `ACCOUNT_BLOCKED`. Refresh checks current
account state, and all protected APIs deny blocked accounts with the same 403 error.
Missing/invalid authentication returns 401; insufficient role returns 403. Database
outages fail closed. Existing public profiles, results, history, statistics and
leaderboards remain available under their previous public-read policies.

Block/unblock and role mutations recheck the actor and target inside a transaction.
A PostgreSQL transaction advisory lock serializes account administration, including
CLI promotion. Moderators can target only USER; admins can additionally target
MODERATOR. Blocking oneself is rejected. Neither role can block/unblock ADMIN through
these endpoints. Repeated block calls preserve the original timestamp/reason and repeat
session/runtime cleanup. Repeated unblock calls succeed and clear both state fields.
The optional reason is trimmed plain text, bounded to 500 characters.

Blocking atomically revokes all current refresh sessions. Session creation locks the
user row, preventing a concurrent login from creating a renewable session after the
block commits. Refresh rotation also requires an active account. Unblocking permits
fresh login and normal access again; revoked refresh sessions stay revoked.

After the block transaction commits, the server removes queued/pending matchmaking
work, clears delivery subscriptions and closes every registered account socket with
code 1008 and `ACCOUNT_BLOCKED`. The registry includes matchmaking-only sockets and
multiple tabs. WebSocket frames and queued room commands reload current account access
before processing, including the established room owner after a rejected identity switch.
JWTs are verified on authenticated joins/subscriptions; established sockets retain their
authenticated identity after token expiry, preserving existing gameplay continuity.
Queue joins/passes check current account status;
new persistent competitor-room creation locks and checks the involved accounts.
Already committed matches retain their idempotent recovery identity.

Disconnects use existing room grace/seat semantics. A block does not award a win, finish
a match, rewrite actions, change ratings or transfer a recovered reserved seat.
Blocked recovered participants cannot reconnect. Anonymous public spectators retain
their existing permissions; staff roles provide no spectator bypass.

Socket/queue registries are process-local, matching the existing runtime architecture.
Other processes reject blocked accounts on their next authenticated request/frame or
queue eligibility check; immediate cross-process passive-socket revocation would need
a future distributed notification mechanism.

## API contract

All routes below use `/api/admin`, require a Bearer access token and at least MODERATOR,
return `Cache-Control: no-store`, and use the existing `{ error: { code, message } }`
envelope. Each admin route uses the existing IP limiter at 120 requests/minute.
UUIDs, bodies, filters, sort/order and pagination are validated by Zod.

| Method/path                     | Access              | Behavior                                                 |
| ------------------------------- | ------------------- | -------------------------------------------------------- |
| `GET /users`                    | MODERATOR/ADMIN     | Paginated search/filter/list                             |
| `GET /users/:userId`            | MODERATOR/ADMIN     | Account, three-mode rating summary and participant count |
| `POST /users/:userId/block`     | Target policy above | Optional `{ "reason": "..." }`; empty body accepted      |
| `POST /users/:userId/unblock`   | Target policy above | Empty body or `{}`                                       |
| `PATCH /users/:userId/role`     | ADMIN               | Strict `{ "role": "USER" \| "MODERATOR" \| "ADMIN" }`    |
| `GET /matches`                  | MODERATOR/ADMIN     | Paginated persisted match metadata                       |
| `GET /matches/:matchId`         | MODERATOR/ADMIN     | Metadata, counts and latest snapshot metadata            |
| `GET /matches/:matchId/actions` | MODERATOR/ADMIN     | Paginated persistent action history                      |
| `GET /summary`                  | MODERATOR/ADMIN     | Database aggregates and small activity windows           |

Role changes cannot target the caller. Demotion of the last active administrator is
protected under the transaction lock; concurrent mutual demotions cannot remove both
admins. A blocked account must be unblocked before receiving a privileged role. Promotion
and demotion take effect on the next protected request with the original access token.

Collections return:

```json
{
  "items": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

`/users` accepts `page`, `limit`, `search`, `role`, `status=ACTIVE|BLOCKED`,
`sort=createdAt|updatedAt|username`, `order=asc|desc`. Search matches username/displayName
case-insensitively and exact UUIDs; it does not search private emails. Default sorting is
`createdAt desc` with an `id` tie-breaker. Defaults: page 1, limit 20; maximum limit 100.
User DTOs include identity, role, block fields and timestamps. Email is selected and
returned only for ADMIN. Details add bounded per-mode rating summaries and a DB count;
they never embed match histories or sessions.

`/matches` accepts `page`, `limit`, `status`, `gameMode=standard|draft|classic`,
`matchType=CASUAL|RATED`, `participantUserId`, `matchId`, `createdFrom`, `createdTo`,
`finishedFrom`, `finishedTo`, `sort=createdAt|finishedAt`, `order=asc|desc`.
Dates must be ISO timestamps with a timezone; reversed ranges are rejected. Participant
filters use the persisted relation. Default sorting is `createdAt desc` plus `id`;
finish-date sorting puts nulls last. Limits match `/users`.

Match DTOs expose lifecycle, classification, stored results, participants/historical names,
rating processing timestamp, lobby name and origin where persisted. Absent origin is
`null`; no synthetic filter is offered. Deleted-account/guest participants share an
explicit `GUEST_OR_DELETED_ACCOUNT` identity label because the schema cannot distinguish
them. Details include action/snapshot counts, latest action revision, maximum durable
action/snapshot revision and only latest snapshot revision/format/timestamp.

`/matches/:matchId/actions` accepts `page`, `limit`, `order`. Defaults: page 1, limit 50,
revision ascending; maximum limit 200. Revisions are unique per match. Each DTO contains
revision, actor ID/seat, action type, validated gameplay payload, timestamp,
`payloadValid` and the stored replay-envelope `formatVersion` when available (`null`
otherwise). Replay setup is excluded. Unsupported/corrupt payloads return metadata with
`payloadValid=false` and `actionPayload=null`. Credential-like JSON keys are recursively
removed from extensible ability payloads.

`/summary` exposes users `total/active/blocked/byRole`, matches
`total/byStatus/byGameMode/classification`, and `usersCreatedLast7d`,
`matchesCreatedLast24h`, `matchesFinishedLast24h` in `activity`. Interrupted matches use
the actual persisted `CANCELLED` status. Counts/groupings run in PostgreSQL under a
consistent read transaction; no full-table JSON loading or per-row list queries.

## Read-only inspection and privacy

Administration inspection never recovers/wakes rooms, changes live gameplay state,
triggers journal/snapshot writes, processes ratings or broadcasts gameplay frames.
No administration mutation route exists for matches, actions, snapshots or ratings.

Explicit DTOs exclude password hashes, refresh sessions/tokens/hashes, reset/verification
secrets, OAuth credentials, JWT/debug secrets, resume/seat/connection credentials,
participant result-data blobs, raw initial configuration, action event blobs, snapshot
state/RNG and live GameState. Initial config is only used internally to extract the
bounded lobby name and known origin. Moderators receive no emails or private session
data. Normal self DTOs do not expose internal block reasons.

Indexes added: User `role`, `blockedAt`, `(createdAt,id)`; Match `(createdAt,id)`,
`(finishedAt,id)`, `(gameMode,isRated,createdAt)`. Existing status/rated indexes and unique
`(matchId,revision)` action/snapshot indexes are reused.

## Verification

```powershell
npm run -w server test:admin
# Only a loopback PostgreSQL database/schema explicitly named as test is accepted:
$env:TEST_DATABASE_URL = 'postgresql://fate:fate@127.0.0.1:6543/fate_admin_test'
npm run -w server test:admin:db
npm run -w server test:recovery:db
npm run -w server test:rating:modes:db
npm run -w web typecheck
npm run lint
npm run build
npm run test
```

Run build/test commands sequentially because the rules workspace cleans/rebuilds its
shared `dist` output. DB tests never target hosted Neon. New tests cover direct HTTP
with USER/MODERATOR/ADMIN, stale JWTs, policy/idempotency, sessions, multiple sockets,
pending/queued commands, active matches, search/pages/filters, DTO privacy, action order,
exact summary aggregates, concurrent role changes and CLI promotion. Recovery tests
cover a blocked reserved-seat reconnect; historical-schema migration tests prove old
user columns and ratings/history remain intact.

The [Admin UI](admin-ui.md) and separate [append-only Audit Log](audit-log.md) are
implemented in subsequent changes. OpenAPI overhaul, advanced moderation,
impersonation, manual competitive edits and gameplay debugging remain outside this phase.
