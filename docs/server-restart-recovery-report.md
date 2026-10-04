# Server restart recovery implementation report

Implemented on 2026-10-04. Operational guarantees and lifecycle details are in
[server-restart-recovery.md](server-restart-recovery.md).

| Requested report item | Actual implementation/finding |
| --- | --- |
| 1. Previous restart behavior | Startup did not reconstruct rooms. Registry, GameState/RNG, sockets, tokens, timers, queue and pending projection work were lost. Durable Match/action/snapshot records survived. |
| 2. Existing persistence guarantees | Unique match/revision actions and checkpoints; ordered asynchronous per-match journal; blocked later writes/results after permanent journal failure; transactional/idempotent results and ratings; bounded graceful drain. |
| 3. Durable frontier | N is proven by the complete contiguous committed journal 1..N, strict action decoding, snapshot revision not ahead of N, and no conflicting finalRevision. No MAX-only decision or gap truncation. |
| 4. Hard-crash action loss | **Yes, acknowledged actions can be lost before their async writes commit.** This existing design was retained; recovery rolls back to N. No zero-loss claim. |
| 5. Files | Full file groups are listed below. No unrelated product subsystem or persistence rewrite. |
| 6. Service architecture | MatchRecoveryService + paginated MatchRecoveryRepository, shared ReplayService reconstruction, explicit restoreGameRoom, existing lifecycle/registry and independent rating repair. |
| 7. Startup | Awaited Fastify onReady recovery before listen; timers start afterward; config/DB probe and migration deployment ordering preserved. |
| 8. Discovery query | status IN (IN_PROGRESS, WAITING), id cursor/order, 100 per page. Only IN_PROGRESS becomes live; waiting lobbies are neutrally cancelled. |
| 9. Snapshot selection | Newest decodable compatible checkpoint <=N. Skip bad JSON/RNG/unsupported versions; try earlier checkpoints; storage errors propagate. |
| 10. Initial fallback | Validated exact initialConfig + seed + complete history through the existing revision-zero factory and replay engine. No fabricated arena/figure configuration. |
| 11. Continuity | Whole durable history validated, including before a checkpoint; tail replay requires each revision in order. Malformed/versioned action boundaries are checked. |
| 12. RNG | SeededRNG.fromState restores checkpoint continuation; full initial replay advances the original RNG. Pending deterministic rolls/choices remain exact. |
| 13. Restore API | restoreGameRoom(RestoreGameRoomInput), schema-validated independent state, restored setup/revision/RNG, empty transport objects; attachRestoredRoom attaches existing started lifecycle. |
| 14. Stable identity | Reuse Match.roomId and Match.id. No replacement Match or room identifier. |
| 15. Seats | Distinct non-null MatchParticipant.userId for P1/P2, durable display snapshots for presentation, reserved offline identities. |
| 16. Reconnect | Existing authenticated reservation flow reclaims seats and sends normal player/spectator projection. Fixed shared-WS/matchmaking reconnect race discovered by browser testing. |
| 17. Tokens | Old process tokens do not survive. Authenticated reservation reclaim issues new runtime tokens without requiring old connId/token. |
| 18. Guests | Current normal competitors require auth. Legacy null-user seats have no durable proof and are cancelled as GUEST_RECLAIM_UNAVAILABLE; no name/IP-based reclaim. |
| 19. Spectators | Empty spectator runtime on restore; anonymous spectators may rejoin normally with the existing safe projection. |
| 20. Grace | Offline competitors receive a fresh lastActivityAt/room TTL opportunity. No restored old timer/immediate forfeit; normal grace resumes on future disconnect. No durable turn timer exists to recover. |
| 21. Queue | Process-local matchmaking queue starts empty and returns NOT_QUEUED. |
| 22. Matchmade matches | Actual persisted active paired Rated games recover with the same seats and match. New initialConfig records MATCHMAKING origin separately from seat reservations. |
| 23. Legacy data | No checkpoint is needed if initialConfig/history are sufficient. A valid checkpoint can avoid missing initialConfig. Missing identity/essential deterministic data or corrupt journal fails explicitly. Legacy missing origin uses MANUAL presentation only. |
| 24. Failure lifecycle | Reuse CANCELLED + SERVER_RESTART_UNRECOVERABLE:<code>, retain history, no competitive outcome/rating. Permanently expired runtime matches use SERVER_ROOM_EXPIRED. |
| 25. UX | HTTP 410 MATCH_INTERRUPTED / WS match_interrupted; clear stale session and auto-reconnect; English/Ukrainian notice and Lobby navigation. |
| 26. Readiness | No gameplay listening before recovery; /ready requires completion + existing DB health probe; /health remains liveness. |
| 27. Isolation | Known per-match corruption is isolated; DB/global failure aborts startup without cancelling healthy matches. A conflicting room owned by another Match is a fatal ownership invariant. |
| 28. Rating repair | FINISHED + isRated + ratingProcessedAt=null uses existing idempotent per-mode processor, never reopens rooms. Errors preserve FINISHED. Terminal-action/result crash windows also use normal lifecycle completion. |
| 29. Migration | None. Existing fields and neutral CANCELLED status suffice; optional initialConfig.origin is backward compatible. |
| 30. Added tests | Runtime recovery suite, PostgreSQL restart/WS/normal finish/rating repair suite, localized interruption notice test and real-process browser crash scenario. Existing tests updated for checkpoint fallback, neutral expiry and endpoint/startup isolation. |
| 31. Restart E2E | Headless Edge, two authenticated browser contexts, actual hard backend kill, fresh backend using same guarded test DB, automatic P1/P2 reconnect, exact pending state, N+1; second crash with corrupt test journal shows interruption notice. PostgreSQL runtime suite additionally continues 37 -> 54 -> 71 -> finish for Casual and actual paired Rated games. |
| 32. Commands | See command table below; only guarded loopback PostgreSQL was used. |
| 33. Results | Prisma generate/validate, both typechecks, lint, build, root tests, recovery unit/DB/browser and focused DB suites passed. Lint: 0 errors/0 warnings. Build retains existing toolchain/large-chunk advisories. |
| 34. Not verified | Production Neon/Render deployment/restart, simultaneous backend ownership and distributed failover were not exercised. No production data was read or changed. |
| 35. Limits | One active backend owner; no distributed claim. Async acknowledged-action rollback remains possible. Startup memory/work scales with history. Existing corrupted historical rows are preserved; failed rating repair awaits another startup/operational retry. |
| 36. Deferred HA work | Redis, durable queue, distributed leases, replicas/regions, standby/socket migration, guest secrets, continuous repair worker, admin/manual repair UI. |

## Changed files

Backend additions:

- `packages/server/src/repositories/matchRecoveryRepository.ts`
- `packages/server/src/services/matchRecoveryService.ts`
- `packages/server/src/tests/matchRecovery.test.ts`
- `packages/server/src/tests/matchRecovery.integration.test.ts`

Backend integration:

- `packages/server/src/index.ts`
- `packages/server/src/store.ts`
- `packages/server/src/ws.ts`
- `packages/server/src/routes.ts`
- `packages/server/src/routes/healthRoutes.ts`
- `packages/server/src/persistence/matchLifecycle.ts`
- `packages/server/src/replay/initialState.ts`
- `packages/server/src/repositories/matchRepository.ts`
- `packages/server/src/services/matchService.ts`
- `packages/server/src/services/matchSnapshotService.ts`
- `packages/server/src/services/replayService.ts`
- `packages/server/package.json`

Existing backend fixtures/assertions adapted to the new behavior:

- `packages/server/src/tests/replay.test.ts`
- `packages/server/src/tests/matchLifecycle.test.ts`
- `packages/server/src/tests/matchTestSupport.ts`
- `packages/server/src/tests/match.integration.test.ts`
- `packages/server/src/tests/leaderboard.integration.test.ts`
- `packages/server/src/tests/matchHistory.integration.test.ts`
- `packages/server/src/tests/playerStatistics.integration.test.ts`
- `packages/server/src/tests/perModeRatings.integration.test.ts`

Frontend:

- `packages/web/src/store.ts`, `packages/web/src/ws.ts`, `packages/web/src/App.tsx`
- `packages/web/src/components/MatchInterruptedNotice.tsx`
- `packages/web/src/lobby/MatchInterruptedNotice.test.tsx`
- `packages/web/src/i18n/displayMetadata.ts`
- `packages/web/src/i18n/locales/en.ts`, `packages/web/src/i18n/locales/uk.ts`
- `packages/web/scripts/restart-recovery-smoke.mjs`, `packages/web/package.json`

Documentation:

- `README.md`
- `docs/production-deployment.md`
- `docs/server-restart-recovery.md`
- `docs/server-restart-recovery-report.md`

## Commands and verification

| Command actually run | Result |
| --- | --- |
| `npm run -w server prisma:generate` (through prebuild/pretest) | Passed, Prisma 6.19.0 client generated. |
| `npm run -w server db:migrate:deploy` | Passed, all nine existing migrations applied to a fresh local fate_recovery_test DB. No new migration. |
| `npm run -w server db:validate` | Passed. |
| `npm run -w web typecheck` | Passed, no TS errors. |
| `npx tsc -p packages/server/tsconfig.json --noEmit` | Passed, including new/adapted TS tests. |
| `npm run lint` | Passed with --max-warnings 0: 0 errors, 0 warnings. |
| `npm run build` | Passed rules/server/web. Existing Vite CJS deprecation, stale Browserslist data and >500 kB chunk advisories remain. |
| `npm run test` | Passed the complete configured repository test pipeline. |
| `npm run -w server test:recovery` / `npx tsx packages/server/src/tests/matchRecovery.test.ts` | Passed all-mode/frontier/fallback/RNG/security/readiness/isolation tests. |
| `npm run -w server test:recovery:db` / `npx tsx packages/server/src/tests/matchRecovery.integration.test.ts` | Passed guarded PostgreSQL runtime restart, WS reclaim/projection/tab replacement, N+1/cadence, repeated restarts, normal Casual/paired Rated finish, terminal-commit repair and Draft rating repair. |
| `npm run -w web test:recovery:e2e` | Passed real hard-process-crash automatic browser reconnect and interrupted UX. |
| `npm run -w web test:shell` | Passed 19 tests, including localized interruption notice. |
| `npm run -w web test:i18n` | Passed 5 tests, including locale parity and no hardcoded JSX labels. |
| `npx tsx packages/server/src/tests/<suite>.integration.test.ts` | All listed DB suites passed: matchAction, matchSnapshot, replay, replayApi, match, matchResult, rating, perModeRatings, matchmaking, matchTypes, leaderboard, matchHistory, playerStatistics, auth, profile, database. |
| `git diff --check` | Passed, no whitespace errors. Git reports the workspace's existing LF/CRLF normalization notices. |

An initial overlapping browser/root test attempt hit Windows' loaded Prisma DLL rename
lock (EPERM). The root pipeline passed when rerun after browser processes closed.
The first browser run exposed and led to the shared-socket reconnect fix. Existing DB
expiry/read-only API assertions were adapted to the newly intended startup/expiry
behavior; their reruns passed. No failed check is being presented as a passed check.
An integration fixture that submitted hundreds of actions in one burst exceeded the
existing five-second drain bound under concurrent test load. It now waits for journal
durability every 20 actions; the complete PostgreSQL recovery rerun passed.

Browser screenshots are in `packages/web/test-results/restart-recovery/` (ignored test
artifacts): before-crash.png, restored-and-continued.png, interrupted-notice.png.
The test DB ran in a dedicated ephemeral local PostgreSQL 16 container; integrations
cleaned their own fixtures and the container was removed after verification.
