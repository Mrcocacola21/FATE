# Administrative and security audit journal

AuditLog records significant successful security/administrative state transitions.
It is separate from application diagnostics and authoritative gameplay storage.

| System | Responsibility |
| --- | --- |
| AuditLog | Who/what changed significant administrative or security state |
| Application logs (Fastify/Pino) | Operational errors, request diagnostics, startup, stack traces |
| MatchAction | Accepted deterministic gameplay actions, replay and recovery |
| MatchSnapshot | Authoritative state and RNG checkpoints |
| RatingHistory | Competitive per-mode rating changes |

No audit reads or writes drive gameplay reconstruction, winner selection, rating,
matchmaking, snapshots or replay. Existing MatchAction and MatchSnapshot models and
payloads are unchanged.

## Event matrix

The canonical taxonomy is the Prisma AuditEventType enum, exported with runtime
event schemas from `packages/server/src/audit/events.ts`.

| Event | Actor | Resource | Trigger / metadata |
| --- | --- | --- | --- |
| USER_BLOCKED | USER (ADMIN/MODERATOR) | User | Actual active → blocked transition; `targetRole` |
| USER_UNBLOCKED | USER (ADMIN/MODERATOR) | User | Actual blocked → active transition; `targetRole` |
| USER_ROLE_CHANGED | USER (ADMIN) | User | Actual role transition; `previousRole`, `newRole` |
| USER_ROLE_CHANGED | SYSTEM | User | Operator CLI `admin:promote`; same role transition semantics |
| MATCH_INTERRUPTED | SYSTEM | Match | Unrecoverable restart lifecycle transition; `previousStatus`, `newStatus`, `recoveryReason`, `lastDurableRevision` |

Bootstrap uses a SYSTEM actor because there is no authenticated HTTP actor. It does
not invent a system account or claim to identify the operator. Running the CLI for
an existing ADMIN makes no event. Apply migrations before bootstrap; audit insert
failure rolls promotion back. Earlier promotions are not backfilled.

## Schema and persistence

`20261004130000_audit_log` adds two enums, one dedicated table and five indexes.
It does not modify old tables/history or backfill records.

| Field | Prisma type / meaning |
| --- | --- |
| id | UUID, database-generated |
| eventType | AuditEventType |
| actorType | AuditActorType: USER / SYSTEM |
| actorUserId | Optional historical UUID; null for SYSTEM |
| actorRole | Optional UserRole snapshot; null for SYSTEM |
| targetUserId | Optional historical affected-account UUID |
| matchId | Optional historical affected-match UUID |
| reason | Optional plain text, maximum 500 characters |
| metadata | Required bounded JSONB, event-specific schema |
| createdAt | Database-generated timestamptz(3) |

Historical resource IDs deliberately have **no foreign keys**: they preserve attribution
even if a user/match is deleted. No deletion cascades and no later SET NULL mutation
can erase the original ID. The paginated reader resolves current usernames/display
names in one bounded batched lookup. A deleted account returns `actor`/`targetUser`
null with the historical UUID retained. Current display identity is not a historical
name snapshot. Actor role always comes from the audit row, never from the current user.
Direct targetUserId/matchId fields avoid redundant generic resource abstractions.

Database checks enforce USER/SYSTEM actor consistency, event/resource consistency
and a maximum 2 KiB metadata representation. Server-generated timestamps and UUIDs
are never accepted as event input.

## Write API and transaction boundaries

`AuditLogService.record(tx, event)` requires an existing Prisma transaction and a
discriminated typed event. Runtime strict schemas reject unknown event/payload fields,
invalid roles/UUIDs, arbitrary metadata, client timestamps and oversized reasons.
Only this service inserts audit rows.

`AdminRepository` retains its existing PostgreSQL account-administration advisory
transaction lock. It reloads authoritative actor/target accounts and applies policy
before mutation. Block state, persistent session revocation and USER_BLOCKED commit
together. Unblock and USER_UNBLOCKED commit together. Role update and USER_ROLE_CHANGED
commit together, with previousRole from the locked database read. Required audit
failure propagates and rolls back the mutation; there is no best-effort audit fallback.
Block retries still revoke sessions/runtime access, but emit no new event when the
account is already blocked. Unblock/unchanged-role retries also emit no false transition.

Socket closure and matchmaking removal remain after durable commit in AdminService.
Runtime cleanup failures use existing application diagnostics; audit history is retained.

MatchRecoveryRepository locks the match row before checking its status. It updates
the active/waiting match to the existing CANCELLED status with
`SERVER_RESTART_UNRECOVERABLE:<code>` and writes MATCH_INTERRUPTED in one transaction.
Repeated/concurrent interruptions cannot write a duplicate transition. Existing
recovery still stops on storage/global failure rather than cancelling matches because
PostgreSQL is unavailable. WAITING_LOBBY_NOT_DURABLE is an abnormal system cancellation,
so it is included. Ordinary cancellation and successful finish/finalization are excluded.
`lastDurableRevision` is the highest persisted action/snapshot revision (0 with no
durable history), not a claim that every preceding revision is valid or contiguous.
Recovery's existing action-gap validation remains authoritative.

## Metadata and privacy

Metadata is limited to the matrix above. Match status is WAITING/IN_PROGRESS →
CANCELLED; recoveryReason is a bounded uppercase diagnostic code. Reasons are
escaped plain text. System interruption reasons are a fixed safe summary, not an
exception message. Reader metadata is validated again; invalid/unknown shapes return
null rather than exposing arbitrary JSON. UI decoding also whitelists metadata keys.

No automatic capture of passwords/hashes, auth headers/cookies, access/refresh/resume/
seat tokens, API keys, environment values, DB URLs, IPs, User-Agent, emails, GameState,
RNG state or MatchAction payloads. Human reasons are intentionally preserved, so
operators should supply a moderation explanation rather than credentials/personal data.
No requestId field/tracing infrastructure is added in this phase. Existing request IDs
remain in operational logger messages.

## Read API, authorization and viewer

Only `GET /api/admin/audit` exists. All normal create/update/delete audit routes are
absent, including for ADMIN. There is no arbitrary client event-creation endpoint.
Actor identity and role come from trusted server/transaction state.

Unauthenticated requests receive 401. USER and MODERATOR receive 403. ADMIN receives
the explicit safe DTO: IDs, event/actor types, snapshotted role, minimal current
identities, reason, validated metadata and createdAt. Existing middleware reloads
persisted account role/block state on each request. Response cache policy is no-store.

Filters: `eventType`, `actorType`, `actorUserId`, `targetUserId`, `matchId`, `dateFrom`,
`dateTo` (inclusive ISO timestamps with timezone). UUIDs, dates, range ordering,
pagination and enums are validated; unknown query fields are rejected.
Default page=1, limit=50; maximum limit=200, maximum page=1,000,000. Results use
`{ items, pagination: { page, limit, total, totalPages } }`, matching admin conventions.
Count and limited ordered rows are read inside RepeatableRead. SQL filters/offset/take
run in PostgreSQL, never over a downloaded full table. Order is createdAt DESC, id DESC.
Indexes cover (createdAt,id) and (eventType/actorUserId/targetUserId/matchId,createdAt,id).
Ordering is deterministic for ties; as with existing page-number admin endpoints,
concurrent new inserts can move later page boundaries. There is no cross-request snapshot.

`/admin/audit` has ADMIN-only navigation and a direct-route guard before loading data.
It uses existing admin typography, badges, error/loading, filter and pagination components.
Desktop uses Time/Event/Actor/Target/Reason/Details columns; the existing responsive
table becomes stacked cards at tablet/mobile widths. A keyboard-operated button expands
a full-width read-only details row, with aria-expanded/aria-controls, structured values
and labeled copy-ID controls. No raw JSON editor, delete/clear controls, real-time stream
or export pipeline exists. Actor/target links use available current profiles; match links
use the canonical match UUID. All new labels are translated in supported EN and UK locales.
URL filter/page state survives reload, sharing, back and forward. Date filters explicitly
use UTC days; displayed timestamps use the existing Europe/Kyiv admin convention.

## Collection, immutability and retention

Collection begins when the migrated feature is deployed, not at a fabricated historical
date. Existing blocked accounts may have no historic block event. No historical state
is converted to fictional SYSTEM events. There is no automatic pruning or retention
automation: records remain until a separately designed explicit retention policy exists.

Append-only means through normal application services/UI/APIs. Privileged direct database
operators can still change rows; this phase does not install external WORM storage,
cryptographic chains or database privilege management. Explicit isolated-test fixture
cleanup is not an application audit deletion API.

Deliberately excluded: gameplay/actions, RNG/checkpoints, rating updates, normal finished
matches, ordinary player cancellation, login attempts, refresh/pings/GET requests, replay
views, denied admin attempts, audit viewer reads, page visits, searches, analytics and
full application logs. Audit reads do not generate more audit events.

## Verification

Database checks use the existing `scripts/testDatabase.cjs` guard: loopback PostgreSQL
with an explicit test database/schema, never hosted Neon or NODE_ENV=production.

```powershell
npm run -w server prisma:generate
npm run -w server db:validate
# Set guarded TEST_DATABASE_URL; migrate this isolated DB first.
npm run -w server test:audit
npm run -w server test:audit:db
npm run -w server test:admin:db
npm run -w server test:recovery:db
npm run -w web test:admin
npm run -w web test:admin:e2e
npm run -w web typecheck
npm run lint
npm run build
npm run test
```

Tests cover event validation/secret-state exclusion, strict filters, current-role RBAC,
missing mutation routes, transitions/retries, actor-role snapshots, session revocation,
rollback of block/unblock/role/interruption, corruption/recovery interruption metadata,
normal gameplay/finish separation, deterministic pagination/filtering, safe DTO and
historical-ID survival after deletion. UI tests cover role guards, four human labels,
links, structured details, filtering, empty/error states and translations. Browser checks
cover 1920×1080, 1366×768, 768×1024 and 390×844, keyboard detail expansion and overflow.

For deployment apply `npm run -w server db:migrate:deploy` before starting the updated
server or invoking `admin:promote`. No deployment to production is part of this change.
