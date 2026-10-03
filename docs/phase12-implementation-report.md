# Phase 12 — Replay API and Replay UI

Implemented on top of the current uncommitted Phase 10/11 work. Existing replay reconstruction,
checkpoint persistence, rules behavior and production deployment configuration were preserved.
Phase 12 adds no schema change or Prisma migration. No production deployment was performed.

## Files added and changed by this phase

Added:

- `packages/rules/src/view/replay.ts`: shared board DTO types and pure safe projection.
- `packages/server/src/routes/replayRoutes.ts`: authenticated HTTP read routes and safe errors.
- `packages/server/src/services/replayQueryService.ts`: completed-match metadata/state queries.
- `packages/server/src/tests/replayApi.test.ts`: actual-engine HTTP/privacy/error tests.
- `packages/server/src/tests/replayApi.integration.test.ts`: PostgreSQL HTTP read-only integration.
- `packages/web/src/api/replayApi.ts`: authenticated API, cancellation and explicit DTO decoding.
- `packages/web/src/pages/MatchReplayPage.tsx`: contextual replay route and viewer composition.
- `packages/web/src/replay/types.ts`: explicit frontend metadata/participant/timeline/state contracts.
- `packages/web/src/replay/navigation.ts`: accepted-revision navigation and bounded LRU cache.
- `packages/web/src/replay/useReplay.ts`: metadata/state loading, cancellation and retries.
- `packages/web/src/replay/ReplayHeader.tsx`: historical competitors and persisted results.
- `packages/web/src/replay/ReplayBoard.tsx`: presentation adapter and disabled existing Board.
- `packages/web/src/replay/ReplayControls.tsx`: buttons, direct jump, scrubber and shortcuts.
- `packages/web/src/replay/ReplayActionInfo.tsx`: actor/action/time context.
- `packages/web/src/replay/ReplayError.tsx`: localized safe replay error presentation.
- `packages/web/src/replay/MatchReplayLink.tsx`: availability-checked Match Details link.
- `packages/web/src/replay/replay.css`: board-focused responsive layout and controls.
- `packages/web/src/replay/replay.test.tsx`: nine frontend scenarios.
- `packages/web/scripts/replay-smoke.mjs`: real local auth/database/browser/network/viewport test.
- `docs/phase12-implementation-report.md`: this report.

Changed:

- `packages/rules/src/view/index.ts`: export ReplayView/ReplayUnit/makeReplayView.
- `packages/server/src/repositories/matchActionRepository.ts`: metadata-only timeline/action selects.
- `packages/server/src/index.ts`: register replay routes with existing identity service; test injection.
- `packages/server/src/services/README.md`: document the replay query boundary.
- `packages/web/src/App.tsx`: protected route, wider replay content, defer runtime mounting/reconnect.
- `packages/web/src/store.ts`: defer persisted room identity reads to resumeRoom instead of module import.
- `packages/web/src/main.tsx`: load replay CSS without affecting Node component tests.
- `packages/web/src/pages/MatchDetailsPage.tsx`: contextual replay availability/link.
- `packages/web/src/i18n/locales/en.ts` and `uk.ts`: matching labels, errors, actions and shortcuts.
- `packages/web/src/matches/components.test.tsx` and `scripts/match-history-smoke.mjs`: replace obsolete
  pre-Phase-12 prohibition on Replay text; retain legacy unavailable/privacy checks.
- Root/server/web `package.json`: focused tests, browser test and root regression integration.
- `README.md`: API/UI policy, contracts, memory/navigation behavior and verification commands.

Other pre-existing dirty files belong to earlier work; this list does not claim those changes.

## API routes, access and contracts

`GET /api/matches/:id/replay` and `GET /api/matches/:id/replay/state?revision=N` require a verified
Bearer access token through the existing ConnectionIdentityService. Any authenticated user may
read a FINISHED replay; participant ownership is not required. WAITING/IN_PROGRESS/CANCELLED are
rejected. The internal ReplayService still supports its existing internal reconstruction use cases.
Both routes set `Cache-Control: no-store` and use the existing error envelope.

Metadata returns:

```ts
{
  matchId, status: "FINISHED", gameMode,
  initialRevision: 0, finalRevision,
  participants: [{ seat, userId, displayName, username, avatarUrl, outcome }],
  winnerSeat, finishReason, startedAt, finishedAt, durationMs,
  timeline: [{ revision, actorSeat, actionType, createdAt }]
}
```

`displayName` is always displayNameSnapshot. Current username/avatar are separate optional fields.
The persisted winner/outcomes are shown directly; React never derives the result from visible units.
Metadata contains no board states, seed, checkpoint payload, action payload, event JSON or RNG state.
The repository selects only four timeline fields, rather than reading private journal JSON to discard it.

State returns `{ matchId, revision, state: ReplayView, action }`. Action is the same lightweight
timeline entry, or null at revision zero. No base checkpoint/debug/verification/RNG fields are public.
ReplayQueryService performs completed-match checks and delegates reconstruction to Phase 11
`reconstructAtRevision`. The engine uses the nearest snapshot and only subsequent required actions.
No full deterministic validation is run per navigation click. The final position additionally checks
that the reconstructed winner agrees with the persisted winnerSeat.

Zod validates UUIDs and a required integer decimal revision query. Negative, fractional, malformed,
duplicate, out-of-range or unknown revision values are rejected, never clamped. Extra state query
fields are rejected. Initial config, supported mode, final revision and both participants are required;
state reads also check journal endpoints using indexed lightweight reads. Missing legacy replay data
returns 409 MATCH_NOT_REPLAYABLE. Metadata verifies the journal's contiguous accepted revisions;
Phase 11 treats a gap as corruption. React navigates the returned entries, so it does not hardcode
revision arithmetic and its tests cover a timeline containing 0, 1, 2, 4.

Safe errors: 401 UNAUTHORIZED; 404 MATCH_NOT_FOUND; 409 MATCH_NOT_FINISHED/MATCH_NOT_REPLAYABLE;
400 INVALID_REQUEST (UUID)/INVALID_REPLAY_REVISION; 500 REPLAY_INTEGRITY_ERROR; 503 REPLAY_UNAVAILABLE.
Invalid checkpoint/version/action/deterministic history errors never return a guessed board or raw
database diagnostics. Logs include only a category and request ID.

## Projection and hidden information

`makeReplayView` explicitly constructs every response field. It does not spread authoritative state
or units. ReplayUnit exposes only identity/class/art, visible-unit HP/position/liveness, public visual
forms, bunker/blind/snare/chicken and bone-status kind/source. ReplayView exposes board size/phase,
turn/round/current seat, visible active unit, arena visuals, public forest and revealed stake markers.
Arena effect source IDs/private ability information are omitted.

Visibility follows the existing spectator unit policy: living stealthed units are omitted before
phase ended; the ended position reveals those units because that is already an intentional game
spectator rule. Visible-unit HP is already public on the spectator board. This does not reveal earlier
hidden positions retrospectively. Hidden active-unit references are nulled. Private hero memory,
knowledge/last-known positions, hidden stakes/traps, charges/cooldowns, pending rolls/choices/targets,
turn/placement queues, action legality, events, counters and RNG are omitted at every revision.
Tests inject future private fields on state and units and confirm they cannot enter the DTO.

## Frontend, board and request behavior

`/matches/:id/replay` uses the existing router, RequireAuth and AppShell. Match Details checks replay
metadata before showing Watch Replay; unavailable legacy matches get a localized note. No permanent
Replay sidebar item was added. The existing Vercel general SPA fallback already handles deep links.

ReplayHeader, ReplayBoard, ReplayControls and ReplayActionInfo keep concerns separate. The shared
Board/assets/HP/status/arena/coordinate rendering is reused. A presentation-only adapter supplies
neutral PlayerView fields required by Board; it never executes actions or reconstructs rules.
Every cell is a native disabled button; selection and visual effects are disabled, event batches are
absent and callbacks are inert. Informational status rendering remains. No gameplay action, ready,
roll, ability, move or attack control is mounted.

Direct replay entry defers GameRuntime mounting, preventing its automatic resume token access and
socket reconnect. Once a user has visited gameplay, an existing live game remains mounted while
navigating information pages, preserving its connection. Hidden runtime effects do not initiate
reconnects on replay. Replay itself imports no WebSocket/live action/resume hook. A real browser
test places a stale valid-shaped room-session token in storage, instruments room-session storage access,
and proves no token read/write/removal or gameplay socket occurs. Shared store initialization is lazy;
the existing resumeRoom path still loads saved identity on a gameplay route.

The viewer retains metadata, current requested revision, one current HTTP result and an LRU cache
of at most five recent responses. Cache/viewer reset on match/session identity changes. There is
no all-state fetch, browser simulation, adjacent prefetch or global server revision cache.
AbortController plus checking aborted signals before accepting results handles transports that
ignore cancellation. Metadata, controls and layout remain mounted while loading; the last board
keeps its actual displayed revision until the new result arrives, with a loading overlay.

Beginning/end use initial/final revisions. Previous/next use timeline neighbors. Direct input accepts
only actual entries. Slider indices map to timeline entries; its label changes immediately and one
request is committed after a 180 ms debounce. Left/Right/Home/End shortcuts avoid input/select,
textarea, contenteditable, buttons and links, and ignore modified shortcuts.
`?revision=N` drives the requested position and browser history. Refresh retains it. Invalid URL
revisions show an error without sending an invalid state request; controls can recover.

Desktop keeps the board dominant with compact competitor/result/timing information. Tablet/mobile
use the existing shell drawer and board fit. Mobile participant cards stack their avatar/name;
controls wrap and the board has enough height for all nine rows. English/Ukrainian keys match.

## Verification performed

All final lint/typecheck/build/root-test checks passed. The complete discovered frontend unit/component
suite also passed: **369 tests, 369 passed, 0 failed, 0 skipped**. New replay frontend suite:
**9 tests, 9 passed, 0 failed**.

New backend tests use real accepted rules actions and actual ReplayService reconstruction. They cover
metadata/historical identity/ordered safe timeline, initial/middle/final positions, snapshot path,
authentication, UUID/revision errors, unfinished/legacy/empty history, gaps, integrity mapping,
persisted-winner mismatch, hidden-state projection and unchanged fixture data. PostgreSQL API tests
execute HTTP calls inside `SET TRANSACTION READ ONLY` and compare match/participants/actions/snapshots/
rating counts before and after. Existing independent replay determinism integration also passed.

Browser smoke used real local authentication, a completed 629-revision fixture and persisted snapshots.
It verified protected direct entry, Watch Replay from details, next/previous/beginning/end/jump,
keyboard, URL/refresh, disabled board, no gameplay writes/sockets and unchanged durable records.
The tested journey made **9 on-demand state requests**, rather than downloading 630 states.
Initial StrictMode may cancel one duplicate request; it never mass-prefetches. Vite's development HMR
socket is excluded from gameplay socket assertions. This is architectural verification, not a latency benchmark.

Screenshots were captured and visually reviewed at **1920×1080, 1366×768, 768×1024 and 390×844**.
Browser assertions wait for the existing board-fit transition and ensure the complete board fits
its frame and the page has no horizontal overflow. Artifacts are in ignored
`packages/web/test-results/replay/`, including the four PNGs and `verification.json`.

Commands actually executed (final results):

| Command                                                                                                           | Result                                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `npm install`                                                                                                     | Exit 0; dependencies unchanged. Existing npm audit findings remain.                                |
| `npm run -w server prisma:generate` (also build/test hooks)                                                       | Exit 0; Prisma Client 6.19.0 generated.                                                            |
| `npm run -w server db:validate`                                                                                   | Exit 0; schema valid.                                                                              |
| `npm run -w server db:migrate:deploy`                                                                             | Exit 0; existing seven migrations applied to the isolated local test DB.                           |
| `npm run -w rules build`                                                                                          | Exit 0.                                                                                            |
| `npm run -w server build`                                                                                         | Exit 0; server and test sources compile.                                                           |
| `npm run -w web typecheck`                                                                                        | Exit 0; no diagnostics.                                                                            |
| `npm run lint`                                                                                                    | Exit 0; 0 errors / 0 warnings.                                                                     |
| `npm run build`                                                                                                   | Exit 0; complete rules/server/web production build. Existing Vite advisory warnings remain.        |
| `npm run test`                                                                                                    | Exit 0; existing rules/boundaries/server/auth/profile/matches/shell/figures and new replay suites. |
| `npm run -w server test:replay-api`, direct `npx tsx .../replayApi.test.ts`                                       | Exit 0.                                                                                            |
| `npm run -w web test:replay`                                                                                      | Exit 0; nine scenarios.                                                                            |
| From `packages/web`: discovered `src/**/*.test.ts(x)` passed to `node ../../node_modules/tsx/dist/cli.mjs --test` | Exit 0; 369/369.                                                                                   |
| `npm run -w server test:replay:db`                                                                                | Exit 0; guarded PostgreSQL deterministic replay integration.                                       |
| `npm run -w server test:replay-api:db`                                                                            | Exit 0; guarded HTTP READ ONLY integration.                                                        |
| `npm run -w web test:replay:e2e`                                                                                  | Exit 0; real browser/network/DB verification and four viewports.                                   |
| `git diff --check`                                                                                                | Exit 0; no whitespace errors.                                                                      |

Additional regression commands `npm run -w web test:matches:e2e` and
`npm run -w web test:multiplayer:e2e` both exited 0. They covered history/details filters, pagination,
profile rename and refresh, plus live gameplay, authenticated/guest seats, F5, expired-token refresh,
resume mismatch and anonymous sandbox reconnect after deferring store token reads.

The local database was a task-created `postgres:16-alpine` Docker container, loopback port 25432,
database `fate_phase12_test`. Tests use the existing loopback-only/test-name guard. No Neon or
production database was used. The task container was removed after final verification.
Final build/test/lint logs are in ignored `.tmp/phase12-*.log`.

Resolved verification issues: Windows reserved the first requested Docker port; a permitted local
port worked. Concurrent Prisma generation while the browser server held its Windows engine DLL
was rejected; sequential generation/tests passed. Broad JSX tests initially used the repository root
rather than web's JSX configuration; running them from the web workspace passed all 369. One old
Match Details assertion forbidding Replay text was updated to the new feature contract. An initial
browser assertion included Vite HMR; the final assertion checks gameplay `/ws` only. Screenshot
capture now waits for the existing board fit transition, with the complete board verified.

## Limits and deferred work

No production deployment, hosted history validation or new migration was performed. Legacy data is
not invented/backfilled. Visual review covered a real classic completed fixture; all future hero/form
combinations and every historical production match were not manually reviewed. The existing pure
spectator visibility rules remain the product policy. No latency/performance improvement is claimed.

Autoplay/playback speed, downloadable replays, comments/sharing permissions, branching simulation,
live spectating, active recovery, statistics/ratings/leaderboard/matchmaking were deliberately excluded.
Server Restart Recovery and Replay/Snapshot Performance Research remain subsequent phases.
The reader-only API/query boundary leaves Player Statistics Backend work independent of replay.
