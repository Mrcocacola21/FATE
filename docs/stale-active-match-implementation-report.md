# Stale active match implementation report

## Findings and resulting behavior

1. **Root cause:** grace expiry and explicit leave only vacated transport occupancy.
   Started rooms retained locked authenticated competitors, tokens and active Match
   status. Runtime eligibility kept those reservations blocking new play. Rated queue
   eligibility independently trusted persisted `IN_PROGRESS` forever. Recovered
   offline competitors had no participant deadline. See
   [the lifecycle policy](match-disconnect-lifecycle.md) for the exact paths.
2. **Why days were possible:** the 24-hour room TTL was request-driven, excluded
   rooms with sockets (including spectators), and was not an abandonment policy.
   Restart recovery could restore offline reservations and refresh the room lifetime.
3. **Why rejoin failed:** a missing runtime was not reconstructed on runtime
   eligibility checks; an existing manual room also required a resume token from
   the old browser session. Account-level active-match discovery did not exist.
4. **Why creation/search blocked:** runtime checks still saw a locked competitor,
   while queue checks still saw an active database row. Manual creation did not
   check persisted orphans at all, so it could also allow creation without repairing
   the zombie. The actual production record/logs were not provided; these are
   demonstrated repository failure paths, not a claim of production forensic access.
5. **Disconnect/reconnect:** preserve seat/state during the existing configured
   `RECONNECT_GRACE_MS` (default 45 seconds). Authenticated owners can reclaim their
   seats from fresh tabs; supplied resume tokens retain existing validation. The
   latest tab owns the transport, and an older tab closing does not abandon it.
6. **Leave and expiry:** use the existing neutral `CANCELLED` state, with
   `finishedAt` and `SERVER_PARTICIPANT_LEFT` or `SERVER_RECONNECT_GRACE_EXPIRED`.
   Socket close alone starts grace. Spectator disconnects do not end matches.
   The current game has no surrender/forfeit result rule; none was invented.
7. **Stale definition:** no authoritative runtime and failed safe durable recovery,
   or a definitively expired participant window. Age alone never decides.
8. **Startup:** retain the existing active-status-only paginated recovery scan.
   Valid matches restore; invalid/legacy matches neutrally cancel and audit once.
   Start fresh offline-seat windows only after the entire startup scan/rating repair
   finishes, so slow startup cannot consume the reconnect opportunity.
9. **Runtime:** the canonical `ActiveMatchService` serializes missing-room
   reconciliation, drains local persistence, rechecks status and reuses startup's
   candidate recovery implementation. Live/recovering/pending-interruption matches
   block competitors. Unrecoverable matches commit cancellation before releasing
   them. Manual HTTP/WS create/join and Rated queue entry share this guard.
   Creating a lobby as a spectator also uses the creation guard; joining another
   room to spectate remains allowed.
10. **Races and cleanup:** room queues order reconnect, timeout, commands and
    interruption. Pending interruption rejects further game/setup commands. A
    failed database transition keeps blocking until the lifecycle retry commits.
    Commit removes the room/projection, clears grace records, releases transport
    metadata and notifies connected clients. Duplicate cleanup is harmless.
11. **Ratings/history:** leave, abandonment and infrastructure interruption have
    no winner, loser, draw or rating mutation. Normal game results still use the
    existing exactly-once, per-mode rated pipeline; Casual stays unrated. Match,
    MatchParticipant, MatchAction and MatchSnapshot history is preserved.
12. **Existing zombies:** repaired by ordinary startup recovery or missing-runtime
    reconciliation during discovery/eligibility. Recoverable but absent competitors
    then receive the fresh configured grace. No manual SQL, cron, repair CLI, Redis,
    distributed ownership or Prisma migration was introduced.
13. **API:** authenticated, no-store `GET /api/matches/active` returns `{ match }`
    with `id`, `roomId`, `seat`, `rejoinable`, or `null`. Existing canonical errors
    remain; OpenAPI response generation and the 44-operation contract are updated.
14. **Frontend:** Play/Lobby show localized active-match/Return notices, refresh on
    mount/focus/error changes and every ten seconds, clear API-null state, and reuse
    the existing interrupted-session reset. Create permission remains server-owned;
    cached active-match state never disables creation.
15. **Deployment assumption:** a single active backend owner, as already documented.
    No overlapping replicas or distributed room ownership is claimed.

## Regression proof and tests

The original-code regression was executed against the guarded, task-owned local
PostgreSQL database after migrations. Tracked server implementation files were
temporarily loaded from `git show HEAD:<path>` and restored in `finally`; the initial
workspace was clean. The new test persisted a five-day-old unrecoverable active row
with a real user/participant and no runtime, confirmed the old room returned 404,
then created a lobby. The original code failed this assertion:

```text
staleMatch.integration.test.ts
orphan must be terminally reconciled before creating a lobby
actual: IN_PROGRESS
expected: CANCELLED
Baseline regression exit: 1
```

The same regression passes with the fix. Log: `.tmp/stale-match-before.log`.

- `staleMatch.integration.test.ts`: real persistence, multi-day orphan cancellation,
  idempotent audit, no fabricated rating/result, queue and lobby unlock, restoration
  of a valid old missing room at revision 37, valid-live blockers, fresh recovered
  grace expiry and retained actions/snapshots.
- `staleMatch.ws.test.ts`: real sockets, fake time, normal reconnect, fresh-tab
  reclaim, spectator isolation, multi-tab replacement, one/both competitors absent,
  explicit leave and both HTTP/WS creation blockers.
- `unit/staleMatch.test.ts`: both reconnect/timeout orderings, action exclusion,
  interruption write retry/idempotency and missing-runtime failed-journal recovery.
- `matchRecovery.test.ts`: added slow-startup clock coverage. Existing DB/WS restart
  suites verify recovered revision/state/RNG, continued play, action-gap interruption,
  history retention and exactly-once per-mode rating repair.
- `ActiveMatchNotice.test.tsx`: Return navigation/seat and clearing an old active
  notice after API reconciliation. Existing interruption notice assertions were
  updated to the broader localized message.
- `openapi.test.ts`: 44 operations and bearer protection for discovery.
- `admin.integration.test.ts`: the live test opponent now uses a free admin account,
  keeping deliberately invalid historical fixtures isolated from competitor
  admission. All existing immutable-history/rating assertions remain.

## Verification

Commands were executed from `C:\codes\FATE` using the repository's test runners.
Database runs used a task-created `postgres:16-alpine` container bound only to
`127.0.0.1:55439`, database `fate_stale_test`. The runners created/dropped their own
isolated schemas. A separate test-named base schema allowed WS and integration runs
to use independent runner locks. The task-owned container and its disposable volumes
were removed after verification. No production database was accessed.

```text
npm run -w server prisma:generate
npm run -w server db:validate
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:ws
npm test
npm run build
npm run -w server openapi:generate
npm run -w server test:recovery
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.tests.json packages/server/src/tests/staleMatch.integration.test.ts
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.tests.json packages/server/src/tests/staleMatch.ws.test.ts
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.tests.json packages/server/src/tests/admin.integration.test.ts
node node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.tests.json --test packages/server/src/tests/unit/staleMatch.test.ts packages/web/src/matches/ActiveMatchNotice.test.tsx
git diff --check
```

The first bare `db:validate` lacked a valid `DIRECT_URL`; rerunning with both URLs
set to the local test database passed. Earlier test runs exposed the API operation
count and admin-fixture overlap described above; both were corrected and rerun.
The baseline failure is intentional and separately retained. Final results follow.

| Command | Result |
| --- | --- |
| `npm run -w server prisma:generate` | PASS; client current. |
| `npm run -w server db:validate` | PASS with local test URLs. |
| `npm run test:unit` | PASS; 14 runner suite executions. |
| `npm run test:integration` | PASS; 42 runner suite executions. |
| `npm run test:ws` | PASS; 13 runner suite executions. |
| `npm test` | PASS; 42 runner suite executions. |
| `npm run lint` | PASS; 0 errors / 0 warnings. |
| `npm run typecheck` | PASS; rules/server/benchmark/web/smoke configs. |
| `npm run build` | PASS; rules, server, web and OpenAPI generation. |
| `npm run -w server openapi:generate` | PASS; valid OpenAPI 3.0.3, 44 operations. |
| Focused lifecycle/frontend race tests | PASS; 4 tests; recovery and WS scripts also passed. |
| `git diff --check` | PASS. |

Logs: `.tmp/stale-*.log`; machine-readable layer reports: `test-results/testing/{unit,integration,ws,regression}.json`. The final production build retains existing Vite CJS/asset-size advisories; fake-clock tests emit Node's experimental MockTimers advisory. These are separate from lint, which has zero warnings.

No production deployment, production-data repair, manual browser session, physical
network-loss test or multi-instance failover was performed. The four requested
normal reconnect/zombie/restart/corrupt-restart scenarios were exercised in automated
integration/WS environments. Existing asynchronous action durability still permits
loss of acknowledged but not yet committed actions after a hard crash; this fix does
not change that persistence guarantee.

## Changed files

- `docs/match-disconnect-lifecycle.md`
- `docs/server-restart-recovery.md`
- `docs/stale-active-match-implementation-report.md`
- `packages/server/src/index.ts`
- `packages/server/src/matches/reconnectPolicy.ts`
- `packages/server/src/matchmaking/runtime.ts`
- `packages/server/src/openapi/generated/responses.json`
- `packages/server/src/openapi/responseTypes.ts`
- `packages/server/src/persistence/matchLifecycle.ts`
- `packages/server/src/repositories/matchRecoveryRepository.ts`
- `packages/server/src/routes/matchRoutes.ts`
- `packages/server/src/services/activeMatchService.ts`
- `packages/server/src/services/matchRecoveryService.ts`
- `packages/server/src/services/matchmakingService.ts`
- `packages/server/src/store.ts`
- `packages/server/src/tests/admin.integration.test.ts`
- `packages/server/src/tests/matchRecovery.test.ts`
- `packages/server/src/tests/openapi.test.ts`
- `packages/server/src/tests/staleMatch.integration.test.ts`
- `packages/server/src/tests/staleMatch.ws.test.ts`
- `packages/server/src/tests/unit/staleMatch.test.ts`
- `packages/server/src/ws.ts`
- `packages/web/src/components/Lobby.tsx`
- `packages/web/src/i18n/locales/en.ts`
- `packages/web/src/i18n/locales/uk.ts`
- `packages/web/src/lobby/MatchInterruptedNotice.test.tsx`
- `packages/web/src/matches/ActiveMatchNotice.test.tsx`
- `packages/web/src/matches/ActiveMatchNotice.tsx`
- `packages/web/src/matches/activeMatchApi.ts`
- `packages/web/src/pages/PlayPage.tsx`
- `scripts/testLayers.mjs`
