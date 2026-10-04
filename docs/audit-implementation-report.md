# Audit Log implementation report — 2026-10-04

1. **Existing infrastructure found:** Fastify/Pino operational logging with request IDs;
   Prisma/PostgreSQL repositories and interactive transactions; current-database RBAC;
   account-administration advisory lock; persistent session revocation and post-commit
   socket/matchmaking cleanup; restart reconstruction with neutral CANCELLED failure
   semantics; separate MatchAction, MatchSnapshot and RatingHistory. No pre-existing
   AuditLog/AuditEvent/SecurityEvent/AdminEvent storage or viewer existed.
2. **Files:** the inventory below lists added/changed implementation, tests and docs.
3. **Prisma schema:** dedicated AuditLog with database-generated UUID/time, eventType,
   actorType, optional actorUserId/actorRole/targetUserId/matchId/reason, required JSONB
   metadata. See `packages/server/prisma/schema.prisma` and [schema details](audit-log.md).
4. **Migration:** `20261004130000_audit_log` adds two enums, one table, actor/resource/
   metadata-size constraints and five indexes. Deployed successfully only into an
   isolated local PostgreSQL 16 test container. No old data/schema rewrite or backfill.
5. **Taxonomy:** USER_BLOCKED, USER_UNBLOCKED, USER_ROLE_CHANGED, MATCH_INTERRUPTED;
   canonical Prisma enum exported with typed runtime schemas in `src/audit/events.ts`.
6. **Actors:** USER or SYSTEM, no fake account. Human actor comes from authenticated
   server context and is reloaded under the administrative transaction lock. SYSTEM
   has null user ID and role; CLI promotions use the existing role-change event.
7. **Role snapshots:** immutable actorRole at successful transition, independent of
   later account role/display changes. Moderator snapshot persistence tested.
8. **Targets/resources:** historical UUIDs for affected user/match, with no cascading
   foreign keys. Current minimal identities are resolved in one bounded batch; original
   IDs remain after deletion. No redundant generic resourceType/resourceId abstraction.
9. **Metadata:** block/unblock `{targetRole}`; role change `{previousRole,newRole}`;
   interruption `{previousStatus,newStatus,recoveryReason,lastDurableRevision}`.
10. **Data minimization:** strict event-specific allowlists, 500-character reasons,
    2 KiB metadata cap, safe read DTO and read-time schema validation. No automatic
    capture of emails/IPs/device headers, credentials, tokens, environment, GameState,
    RNG state or action payloads. Operator reasons remain escaped plain text.
11. **Service:** `AuditLogService.record(tx, event)` uses discriminated input and strict
    runtime validation. The caller owns the transaction. `AuditLogReader.list(query)`
    is the separate safe read surface; no normal update/delete methods exist.
12. **Block:** state update, durable session revocation and event insert share one
    transaction; runtime revocation follows commit. Retry emits no duplicate event.
13. **Unblock:** state update and event share one transaction; already-active retry
    emits no event. Forced audit INSERT failure leaves the account blocked.
14. **Role:** server previousRole and newRole commit with audit atomically; unchanged
    roles emit no event. CLI promotion is also atomic with SYSTEM attribution.
15. **Recovery:** MatchRecoveryRepository locks the match row, checks active status,
    obtains summary revision, updates lifecycle and writes audit in one transaction.
    Failed audit insert rolls lifecycle back; repeated recovery creates one event.
16. **Abnormal semantics:** retain existing CANCELLED plus
    SERVER_RESTART_UNRECOVERABLE:<code>. Actual corrupt history records ACTION_LOG_GAP
    and the highest persisted revision. Undurable waiting lobbies are system failures.
17. **Not audited:** successful ordinary finish, normal player cancellation, gameplay,
    rating history, snapshot/replay reads, GET/page/search activity, refresh/pings,
    login attempts, denied actions and audit reads. Operational logger stays independent.
18. **Read API:** GET /api/admin/audit; eventType, actorType, actorUserId, targetUserId,
    matchId, inclusive dateFrom/dateTo, page/limit. Strict UUID/enum/date/range validation.
19. **RBAC:** ADMIN only; missing auth=401, USER/MODERATOR=403. Persisted roles are
    rechecked using the same JWT; blocking remains authoritative. No-store responses.
20. **Pagination/indexes:** page 1/limit 50 default, limit <=200, deterministic
    createdAt DESC/id DESC. SQL filters and bounded pagination, RepeatableRead count/
    rows/identity query; indexes on chronology and event/actor/target/match chronology.
    As in existing admin APIs, concurrent inserts may shift offset page boundaries.
21. **UI:** `/admin/audit`, ADMIN-only tab and pre-fetch direct-route guard.
22. **Table/cards:** existing admin design; Time/Event/Actor/Target/Reason/Details;
    responsive stacked cards, URL filters and server pagination, refresh/loading/empty/
    controlled errors. No update/delete/clear/export/live-stream controls.
23. **Details:** accessible keyboard button expands a full-width read-only row with
    actor role at event, role/status changes, recovery code/revision and labeled copy IDs.
24. **i18n:** all audit labels and events in EN/UK, existing Europe/Kyiv timestamp
    formatting; UTC date-range filters explicitly labeled.
25. **Tests:** three new backend audit tests included in normal server/root test;
    guarded real-PostgreSQL audit suite; three new admin UI tests; existing recovery DB
    suite extended for corruption audit, normal gameplay/finish separation and retries;
    admin browser smoke extended for audit guards, labels, filtering and keyboard details.
26. **Scenarios verified:** automated real DB block/unblock/role/retry/session/rollback
    and actual HTTP viewer/RBAC; actual corrupt restart recovery and successful gameplay/
    finish; browser fixture ADMIN viewer and MODERATOR denial at four requested sizes.
    Screenshots inspected and corrected for desktop button wrapping/mobile alignment.
    The browser uses fixture API responses; there was no manual real-account login.
27. **Commands executed:** see verification matrix below. Migrations/tests use a
    dedicated loopback database on port 5544, never production Neon.
28. **Exact final results:** see verification matrix below; browser generated 47
    screenshots with no console errors across 1920×1080, 1366×768, 768×1024, 390×844.
29. **Not verified:** production deployment/migration, real operator-account manual
    session, cross-request snapshot pagination during continuous inserts, external
    tamper-proof storage. Build reports existing Vite CJS, Browserslist freshness and
    large-chunk advisories; lint itself has zero warnings/errors.
30. **Deferred:** retention automation, direct DB privilege hardening/WORM/hash chains,
    SIEM/log shipping, login-attempt/IP/device journal, export/realtime. No fictitious
    historical backfill and no ordinary audit edit/delete surface were added.

## File inventory

Added:

- `packages/server/prisma/migrations/20261004130000_audit_log/migration.sql`
- `packages/server/src/audit/events.ts`
- `packages/server/src/services/auditLogService.ts`
- `packages/server/src/tests/audit.test.ts`
- `packages/server/src/tests/audit.integration.test.ts`
- `packages/web/src/admin/AdminAuditPage.tsx`
- `docs/audit-log.md`
- `docs/audit-implementation-report.md`

Changed:

- `packages/server/prisma/schema.prisma`, `packages/server/package.json`
- `packages/server/src/admin/policy.ts`, `packages/server/src/admin/schemas.ts`
- `packages/server/src/repositories/adminRepository.ts`
- `packages/server/src/repositories/matchRecoveryRepository.ts`
- `packages/server/src/routes/adminRoutes.ts`, `packages/server/src/scripts/promoteAdmin.ts`
- `packages/server/src/tests/matchRecovery.integration.test.ts`
- `packages/web/src/App.tsx`, `packages/web/src/admin/AdminLayout.tsx`
- `packages/web/src/admin/api.ts`, `packages/web/src/admin/decoders.ts`
- `packages/web/src/admin/query.ts`, `packages/web/src/admin/types.ts`
- `packages/web/src/admin/locales.ts`, `packages/web/src/admin/admin.css`
- `packages/web/src/admin/fixtures.ts`, `packages/web/src/admin/components.test.tsx`
- `packages/web/scripts/admin-smoke.mjs`
- `README.md`, `docs/admin-backend.md`, `docs/admin-ui.md`

## Final verification matrix

| Command | Final result |
| --- | --- |
| npm run -w server prisma:generate | Exit 0, Prisma Client 6.19 generated |
| npm run -w server db:validate | Exit 0, schema valid |
| npm run -w server db:migrate:deploy | Exit 0, all 11 migrations applied to isolated local test DB |
| npm run -w server test:audit | Exit 0, 3 passed / 0 failed |
| npm run -w server test:audit:db | Exit 0, transitions/retries, sessions, snapshots, four rollback paths, HTTP/RBAC, reader safety, filters/pagination/deletion survival passed |
| npm run -w server test:admin:db | Exit 0, existing HTTP/session/queue/WS/role/concurrency integration passed |
| npm run -w server test:recovery:db | Exit 0, restart continuation/finalization/rating repair and new audit assertions passed |
| npm run -w server test:replay:db | Exit 0, durable replay/determinism/read-only integration passed |
| npm run -w server test:rating:db | Exit 0, existing rating atomicity/concurrency/eligibility passed |
| npm run -w web test:admin | Exit 0, 28 passed / 0 failed |
| npm run -w web test:admin:e2e | Exit 0, 47 screenshots, 236 requests, 0 console errors, all four viewports passed |
| npx tsc -p packages/server/tsconfig.json --noEmit | Exit 0 |
| npm run -w web typecheck | Exit 0 |
| npm run build | Exit 0, rules/server/web compiled; existing Vite advisories |
| npm run -w web build (after visual corrections) | Exit 0 |
| npm run lint | Exit 0, 0 errors / 0 warnings |
| npm run test | Exit 0, complete root rules/server/web test chain passed, including all new audit and admin UI tests |
| git diff --check | Exit 0 |

Browser images are local ignored artifacts under `packages/web/test-results/admin/`,
including `audit-{1920,1366,768,390}.png`, role details and match details. No test images,
credentials or connection environment files were added to tracked source.
