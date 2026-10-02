# Phase 6 — Authenticated Multiplayer Identity

Implemented and verified locally on 2026-10-02. Normal P1/P2 seats now bind verified accounts to runtime ownership and persistent participants. Gameplay remains authoritative in memory; `packages/rules` and dependency versions are unchanged.

## Files

Added:

- `packages/server/src/auth/connectionIdentity.ts`
- `packages/server/src/tests/authenticatedMultiplayer.test.ts`
- `packages/server/prisma/migrations/20261002040000_authenticated_match_identity/migration.sql`
- `packages/web/src/auth/multiplayerAuth.ts`
- `packages/web/src/auth/multiplayer.test.ts`
- `packages/web/scripts/multiplayer-smoke.mjs`
- `docs/phase6-implementation-report.md`

Changed:

| Area | Files |
| --- | --- |
| Server integration | `packages/server/src/index.ts`, `routes.ts`, `ws.ts`, `schemas.ts`, `store.ts` |
| Match persistence | `packages/server/src/persistence/matchLifecycle.ts`, `services/matchService.ts`, `repositories/matchRepository.ts`, `packages/server/prisma/schema.prisma` |
| Server regressions | `packages/server/src/tests/matchTestSupport.ts`, `matchLifecycle.test.ts`, `match.integration.test.ts`, `ws.smoke.ts`, `hardening.test.ts`, `modes.test.ts`, `testRoom.ws.test.ts` |
| Frontend | `packages/web/src/App.tsx`, `auth/createAuthStore.ts`, `store.ts`, `ws.ts`, `roomSession.ts` |
| Commands/browser regression | `packages/server/package.json`, `packages/web/package.json`, `packages/web/scripts/auth-smoke.mjs` |
| Architecture | `README.md` |

## Identity and protocol

1. **Protocol:** optional `accessToken` on `joinRoom` and `switchRole`; `joinAck` supplies `roomMode` so anonymous sandbox reconnect survives reload. Existing action messages and projections retain their shapes. Identity failures use `error` with stable codes: `AUTH_REQUIRED`, `INVALID_ACCESS_TOKEN`, `USER_ALREADY_IN_MATCH`, `SEAT_OWNED_BY_ANOTHER_USER`, `RESUME_IDENTITY_MISMATCH`, `INVALID_RESUME_TOKEN`, `MATCH_IDENTITY_LOCKED`, and `SEAT_CONNECTION_REPLACED`.
2. **Credential transport:** the existing auth store supplies an in-memory access JWT to an authentication frame. No Authorization query parameter, JWT storage, second refresh mechanism, or JWT-as-resume-token behavior was introduced.
3. **ConnectionIdentity:** `{ userId: string, username: string, displayName: string | null }`. `ConnectionIdentityService` reuses HTTP's `TokenService.verifyAccessToken`, then `UserRepository.findAccountById`. Invalid, expired, wrong-type, missing-account and missing-profile identities fail establishment. Full User objects and credentials are not retained in room metadata.
4. **Runtime seats:** `seatIdentities.P1/P2` accompanies the existing `seats` connection IDs and `seatTokens`. `participantsLocked` distinguishes started competitors even during lobby-phase initiative. Profile names survive disconnect and remain frozen after start. Actions check transport/seat ownership in memory.
5. **Persistence:** MatchLifecycle maps trusted seat identity to `MatchParticipant.userId` and `displayNameSnapshot` (`displayName.trim()` when non-empty, otherwise `username`). Waiting seat departures remove stale waiting rows. Start synchronizes both participants before accepting the game start; existing lifecycle retry behavior remains. Started participants cannot be rewritten. Authenticated WS creation, and optional HTTP Bearer authentication on empty-room creation, populate `createdById`.
6. **Policy:** normal P1/P2 require authentication. HTTP empty-room creation and anonymous spectating remain public; authenticated spectators carry runtime identity but create no participant rows. Public viewing can fall back to anonymous when session restoration is unavailable. Test/Sandbox controls remain anonymous and persist no synthetic participants.
7. **One account/two seats:** runtime checks reject the opposite seat; the new unique `(matchId, userId)` index reinforces this alongside `(matchId, seat)`. Nullable legacy identities remain supported. To move between seats before start, release the owned player role first.
8. **Reconnect:** every new socket verifies current JWT plus matching resume token/account. Rejection leaves the seat, host and grace timer intact. Successful resume changes only transport ownership and removes the previous socket's authority. After start, grace expiry releases connection occupancy while retaining account ownership and resume token until room cleanup; another user cannot replace the competitor. Waiting grace expiry releases the waiting seat.
9. **F5/session refresh:** resume waits for existing session initialization and uses the existing single-flight HTTP refresh when necessary. Persisted room continuity contains only room ID, role, seat, resume token and room mode. Guests receive a safe internal login return path. SPA auth navigation preserves an established socket. HTTP logout and access expiry do not terminate that socket.
10. **Migration:** `20261002040000_authenticated_match_identity`. Applied successfully with all preceding migrations to an isolated PostgreSQL 16 test database. It adds an index without rewriting old rows. Existing duplicate non-null users would require deliberate cleanup before applying it; migration to an existing production database was not attempted.
11. **Security boundaries:** raw JWTs are not logged, echoed, persisted, projected or added to gameplay messages. Client identity fields are stripped/ignored; authenticated display names come from profiles. JWT/User checks happen at identity establishment, never per game action. Origins, hidden-state projection, payload limits, room queues and immediate receive-time rate limits remain enforced. Rules remain auth/database-free.

## Verification

Commands actually executed; final runs succeeded unless a limitation is explicitly noted:

| Command | Result |
| --- | --- |
| `npm install` | Exit 0; no dependency or lockfile changes. |
| `npm run -w server prisma:generate` | Exit 0, Prisma Client 6.19.0 generated. |
| `npm run -w server db:validate` | Exit 0, valid schema. |
| `npm exec -w server -- prisma migrate deploy` | Exit 0 on isolated PostgreSQL; all five migrations applied. |
| `npm run -w web typecheck` | Exit 0, no TypeScript errors. |
| `npm run lint` | Exit 0, **0 errors / 0 warnings**. |
| `npm run build` | Exit 0, rules/server/web built and web typecheck passed. |
| `npm run -w web build` | Final frontend rebuild: exit 0. |
| `npm run test` | Exit 0; rules, boundary checks, server, auth and profile suites passed. Frontend auth: **31/31**; profiles: **11/11**; no skipped tests. |
| `npm run -w server test` | Exit 0 on the final server queue/identity implementation. |
| `npm exec -w server -- tsx src/tests/authenticatedMultiplayer.test.ts` | Passed authentication, forgery, duplicate-seat, spectator, immutable-start, resume, actual JWT expiration under clock control, action isolation and grace-expiry assertions. |
| `npm run -w server test:match:db` | Passed real registration, participant binding, unique-user constraint, immutable participants, reconnect and existing lifecycle/concurrency scenarios. |
| `npm run -w server test:auth:db` | Passed PostgreSQL auth/session/security integration. |
| `npm run -w server test:profile:db` | Passed PostgreSQL profile/privacy integration. |
| `npm run -w server test:db` | Passed persistence foundation integration. |
| `npm run -w web test:auth` | Final focused run: **31 passed, 0 failed, 0 skipped**. Includes six new multiplayer tests. |
| `npm run -w web test:mobile` | **56 passed, 0 failed, 0 skipped**, including persisted room continuity. |
| `npm run -w web test:gameplay` | **11 passed, 0 failed, 0 skipped**. |
| `npm run -w web test:multiplayer:e2e` | Passed real-browser/full-stack multiplayer smoke. |
| `npm run -w web test:auth:e2e` | Passed updated real-browser auth/profile and active-socket regression smoke. |
| `git diff --check` | Exit 0. |

Browser scenarios executed automatically in headless Chromium/Edge against isolated local services: anonymous player login redirect; anonymous spectator; registration of distinct accounts; normal P1/P2; real DB participant IDs; match start; F5 with exactly one refresh and restored authoritative revision/resume token; expired-memory-token refresh before forced reconnect; wrong-account resume rejection; absence of JWTs in local/session storage; logout retaining the active room; anonymous sandbox F5 with no additional persistent Match. Existing auth/profile browser tests also exercised responsive UI, profile changes, HttpOnly cookies and login/logout without replacing the established socket.

No manual human playthrough or production deployment is claimed. Multiplayer browser smoke drives the actual client stores/protocol; the existing auth smoke also drives rendered UI. The in-app browser's Node REPL tool was unavailable, so local browser regression scripts were used as the browser skill's fallback. Exhaustive live-network churn and migration against production/legacy populated data were not performed.

Initial migration ordering, intentional old guest-player expectations and test timing were corrected before successful final runs. Concurrent Windows verification initially encountered a locked Prisma DLL and a temporarily cleaned rules build directory; dependent checks were rerun sequentially. Tests retain the existing Node MockTimers experimental notice, and Vite builds retain the existing large-chunk warning; neither is an ESLint warning or build/test failure.

## Deferred work

User-bound match results, persistent MatchAction/MatchSnapshot writes, replay/restart recovery, history/statistics, ratings/leaderboards, matchmaking, social features and cross-channel socket revocation remain outside this phase. Existing Phase 5 finish behavior, including nullable `winnerUserId`, is preserved for the Persistent Match Results phase.
