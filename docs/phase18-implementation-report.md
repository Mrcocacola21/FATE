# Phase 18 — Rated Matchmaking Queue

Implemented against the current working tree, preserving the pre-existing Phase 15–17 work.
No production deployment or production migration was performed.

## Files and integration

Added server files:

- `src/matchmaking/{config,errors,runtime,types}.ts`
- `src/services/matchmakingService.ts`
- `src/routes/matchmakingRoutes.ts`
- `src/tests/matchmaking.test.ts`
- `src/tests/matchmaking.ws.test.ts`
- `src/tests/matchmaking.integration.test.ts`

Added web files:

- `src/api/matchmakingApi.ts`
- `src/matchmaking/{types,store}.ts`
- `src/matchmaking/MatchmakingPanel.tsx`
- `src/matchmaking/MatchmakingSync.tsx`
- `src/matchmaking/{store.test.ts,panel.test.tsx}`
- `scripts/matchmaking-smoke.mjs`

Updated server `index.ts`, `config.ts`, `routes.ts`, `schemas.ts`, `ws.ts`, `store.ts`,
`auth/connectionIdentity.ts`, `routes/authRoutes.ts`, `modes/roomModes.ts`,
`persistence/matchLifecycle.ts`, `services/matchService.ts`, `repositories/matchRepository.ts`,
and the shared `matchTestSupport.ts`/`replayTestSupport.ts` test fixtures. The existing mode
regression fixture now uses a distinct account pair per game instead of reusing competitors
whose previous game is still active. Updated web `App.tsx`,
`components/Lobby.tsx`, `lobby/RoomBrowser.tsx`, `modes/GameModeSelector.tsx`,
`game/gameshell-content/components/GameShellSideColumn.tsx`, `store.ts`, `ws.ts` and both
`en`/`uk` locales. Updated root/server/web
package scripts, `.env.example`, README and the server services README. No queue database
table, new dependency, additional migration or separate gameplay/rating implementation was added.

## Storage, eligibility and connection ownership

Exactly one MatchmakingService is created per server. Its Map is keyed by persistent User ID.
The runtime entry includes verified identity, joinedAt, server rating, RD, actual gameMode,
QUEUED/MATCHING state and optional last-disconnect timestamp. Cancellation removes unclaimed
entries; successful creation consumes both entries and caches MATCH_FOUND separately. Delivery
routes are separate per-user maps of connection IDs and callbacks, never queue identities.

Pending joins share one Promise, so concurrent joins perform one rating/eligibility read and
create one entry. Duplicate joins preserve joinedAt, range and gameMode. Matched-user retries
return their existing assignment while its room remains usable. Expired/finished assignments
are pruned and all tabs receive NOT_QUEUED so a completed room cannot strand the search UI.
The client cannot supply rating, RD or ratedGames: POST has a strict mode-only schema.

ConnectionIdentityService verifies a token and a real User/profile. RatingService supplies
current Glicko rating/RD; its canonical missing-row fallback is 1500/350. New players and
players below leaderboard qualification may queue without any manual Rated games. A normal
competitor seat or persistent IN_PROGRESS Match blocks queue eligibility; spectators and
Test/Sandbox activity do not. Synchronous competitor guards cover awaited manual creation,
join and role-switch mutations. A queued user must cancel before entering another competitor flow.

All active authenticated tabs receive the same result with the same account's seat. Refresh
subscribes through the existing game socket, then GET restores queue state. When the last
delivery connection closes, the user is unavailable for new pairing but retains joinedAt for
the existing RECONNECT_GRACE_MS (default 45 seconds). Reconnect restores availability without
joining twice. The single tick expires unavailable unclaimed entries; no per-user queue timer
is created. Disconnect after an existing claim does not undo that claim. GET/re-subscription
redelivers its eventual established result. Server logout cancels unclaimed queue state using
verified refresh-session identity; frontend logout also unsubscribes and drops local state.

## Range, modes and candidate selection

Typed, centralized defaults: initial 100, step 50, interval 15 seconds, maximum 400. Nonnegative
ranges, positive step/interval, maximum ≥ initial and integer/timer bounds are validated.

`range(waitMs) = min(maximum, initial + floor(max(0, waitMs) / stepMs) * step)`.

The sequence is ±100, ±150, ±200, ±250, ±300, ±350, ±400 at 0/15/30/45/60/75/90 seconds.
It remains ±400 indefinitely. RD is retained as metadata, not used for a hidden scoring formula.
Compatibility requires distinct users, identical `standard`/`draft`/`classic` mode, availability,
QUEUED state and `abs(A.rating - B.rating) <= min(A.range, B.range)`.

Oldest entries are processed first. Each chooses the closest compatible rating, then earliest
joinedAt, then lexicographically smallest userId. The matcher uses a sorted queue and a linear
candidate scan per entry: O(n²), with no per-candidate database reads. Seats are randomly swapped
using server crypto; older users are not systematically P1. The existing room seed generator is
unchanged and independent of seat randomness.

## Scheduling, claims, cancellation and failure recovery

A single unreferenced one-second interval and an event-driven enqueue attempt drive matching.
Repeated start calls do not create another interval. Clock and enqueue scheduling are injectable
for deterministic tests. Concurrent ticks share one in-flight Promise. All selected pairs
synchronously transition both entries to MATCHING before the first asynchronous DB call.
Neither claimed user can be considered by another pass or a manual competitor mutation.

Cancellation wins if it removes the entry before claim. After claim, cancellation returns
MATCHING or MATCH_FOUND; it never cancels an established Match. Cancellation is harmless when
absent, and also defeats pending eligibility reads without allowing a delayed enqueue.

When no earlier try had an unknown outcome, a known statement/transaction rollback plus
a successful absent-row lookup restores both
entries to QUEUED with original joinedAt. Generic transport failures, unavailable lookups and
possible post-commit failures retain the claim and retry the same operation: roomId, staged
GameRoom seed, mode, participants and seats. A successful SELECT returning no row by itself
does not exclude a late commit and is therefore insufficient to release an ambiguous claim.
An unknown outcome is remembered across retries: a later known rollback cannot rule out
an earlier late commit and therefore cannot release that pair either.
The unique roomId creation path prevents duplicate durable Matches on retry. Delivery errors
cannot roll back a committed Match or return users to queue. Logs include safe user/room/match
IDs, waits, allowed gap, rating difference and recovery strategy; no secrets or full account data.

Shutdown stops new pairing, clears the interval, waits for the tracked pass and pending joins,
then closes the normal MatchLifecycle. Persistent Match/participants creation is atomic even
if shutdown interrupts delivery. Runtime-only queue/assignment caches are then released.

## Durable Match and reserved normal GameRoom

MatchLifecycle privately stages a normal Rated GameRoom and calls the existing MatchService
creation API with both initial participants. MatchRepository's nested create writes the WAITING
Match and P1/P2 rows atomically. `isRated=true` is the existing canonical Rated definition.
The service checks same-room retries against mode, seed, initial config and participant IDs/names.

Only after that transaction succeeds is the room published and Match Found delivered. Runtime
initialization occurs before the transaction; no further fallible asynchronous initialization
separates commit from publication. Retry retains the staged room. Published rooms are reused
idempotently for the same attempt.

User-ID seat reservations are independent of socket IDs and grace tokens. A third account is
rejected before seat mutation, including before either assigned client enters, after explicit
leave and after reconnect grace expires. Matchmade room summaries mark both seats reserved,
so Room Browser does not advertise them as open competitor seats. Normal spectator policy
remains. Verified matched account identity can resume its own seat; a later same-account
connection replaces the existing transport without creating a new Match. The selected mode is
locked. Room metadata explicitly reports that lock to the frontend, which disables mode
controls and shows Locked. The staged P1 host assignment is preserved when P2 connects first,
and across host leave/reconnect; arrival order cannot change the initial config used by replay.
Ready/start and setup/draft remain the existing flows.

All accepted actions, snapshots, result finalization, deterministic replay, Glicko-2 processing
and leaderboard qualification use the ordinary MatchLifecycle and existing repositories/services.
There is no special downstream matchmaking persistence or rating path.

## HTTP, WebSocket and frontend

Authenticated, no-store, rate-limited endpoints:

| Request | Contract |
|---|---|
| POST `/api/matchmaking/queue` | Strict `{gameMode}`; idempotent current status |
| GET `/api/matchmaking/queue` | Current user's private queue/established result |
| DELETE `/api/matchmaking/queue` | Cancel unclaimed entry; claim/result wins afterward |

The existing `/ws` accepts `{type:"matchmakingSubscribe",accessToken,requestId}` and acknowledges
`{type:"matchmakingSubscribed",requestId}`. `{type:"matchmakingUnsubscribe"}` cancels unclaimed
state and removes this delivery route. Ordinary close uses grace. No second socket is introduced.

Events: `{type:"matchmakingStatus"|"matchmakingFound",revision,status}`. QUEUED/MATCHING status
includes joinedAt, waitMs, rating, currentRange, actual gameMode and availability. MATCH_FOUND
includes matchId, roomId, opposite P1/P2 seat, gameMode, `matchType:"RATED"` and only public
opponent displayName. Other queued users, email, credentials and rating internals are private.

Frontend revision gates discard stale events and HTTP responses overtaken by server events.
HTTP snapshots carry the same revision clock, so an HTTP-confirmed cancellation also rejects
older QUEUED notifications that arrive late over the socket.
Account generations discard responses after logout/account change; socket subscription ownership
prevents old-account events entering a new user's state. Rebinding resets the process-local
revision gate. Match Found shows a restrained accessible announcement and automatically enters
the assigned normal room through existing navigation/credentials. A reconnect before joinAck
retries entry; an entry failure has an explicit retry action.

Play retains manual Create/Join/Room Browser and adds Rated search, current rating, mode,
elapsed time, actual server range and obvious Cancel. Manual action entry is disabled while
searching and independently guarded on the server. MATCHING displays creation/retry state;
Cancel is disabled once claim wins. No ETA or accept/decline phase is shown. All new strings exist
in English and Ukrainian. No searching animation is required; global reduced-motion behavior
is preserved. Rating-display failure does not block server eligibility.

## Deployment limitations and deferred work

The queue is **process-local, not distributed**. Deployment must run exactly one active Node
matchmaking process, with no cluster/PM2 replicas or overlapping active deployments. An explicit
`MATCHMAKING_SERVER_PROCESSES` assertion accepts only `1`; it does not implement coordination.
The repository's existing GameRoom registry is also process-local. Distributed support is not claimed.

Server restart discards queued users and runtime assignment caches. Committed Matches,
participants, actions, snapshots and ratings remain durable; this phase does not restore rooms.
A matched reservation remains owned until the normal room finishes/cleans up, so leaving its
waiting lobby does not let that competitor start another simultaneous match. Uncertain DB
outcomes deliberately retain claims until an idempotent retry can resolve them.

Server Restart Recovery, durable queue recovery, distributed matchmaking/Redis, accept/decline,
dodge penalties, ETA/metrics, region/latency matching, parties/teams and bot fallback are deferred.

## Test coverage

Server unit coverage uses an injected clock and controlled persistence barriers: range boundaries
and cap, mutual compatibility, nearest candidate and deterministic ties, mode separation,
duplicate/pending joins, three- and four-user overlapping passes, cancellation before and after
claim, cancellation during eligibility reads, competitor guards, multiple delivery connections,
last-disconnect grace, known rollback, unknown outcomes and stable room retries. Lifecycle tests
also simulate connection loss before a possible late commit and after a successful commit;
both keep the staged seed, publish only after success and finish with one Match/two participants.

The real HTTP/WS suite checks authentication, strict mode-only requests, server ratings,
idempotent joins, multiple tabs, both assigned results, ordinary room entry and reserved-seat
protection. It explicitly connects P2 first, verifies the P1 host/initial state remains fixed,
rejects a requested mode change and tests P1 leave/rejoin before the normal ready/start flow.
Frontend tests cover queue/cancel/error states, stale-event and response ordering,
account ownership, safe response decoding and accessible waiting/range controls.

The PostgreSQL suite makes eight concurrent creation calls and eight concurrent matcher calls,
checks one durable Match/two participants and atomic rollback on an invalid participant, then
finishes a complete legal match through the ordinary lifecycle. It checks every accepted action,
snapshots, terminal result, deterministic replay, two Glicko history rows, one rated game per user,
the provisional leaderboard and idempotent rating processing.

## Verification

Final verification completed successfully on the current code. Every command below returned
exit code 0. The final full run was repeated after visual review fixed host arrival order,
authoritative mode-lock presentation and disabled Room Browser actions while searching.
Generated transcripts live in `.tmp/phase18-final-*.log` and `.tmp/phase18-visual-*.log`; screenshots in
`packages/web/test-results/matchmaking/`. Both locations are ignored generated artifacts.

| Command actually executed | Final result |
|---|---|
| `npm install` | Passed; existing dependency audit advisories were not changed |
| `npm run -w server prisma:generate` | Passed |
| `npm run -w server db:validate` | Passed |
| `npm run -w server db:migrate:deploy` | Existing migrations applied to isolated local test PostgreSQL only |
| `npm run -w web typecheck` | Passed; repeated inside the final full build |
| `npm run lint` | **0 errors, 0 warnings** |
| `npm run build` | Passed: rules, server TypeScript, web typecheck and Vite production bundle |
| `npm run test` | Passed: full rules/boundaries, server regressions, Replay API and all configured web suites |
| `npm run -w server test:matchmaking` | Passed, including P2-first arrival and P1 leave/rejoin |
| `npm run -w web test:matchmaking` | Passed inside root test: **7 passed, 0 failed** |
| `npm run -w web test:i18n` | **5 passed, 0 failed** |
| `npm run -w web test:matchmaking:e2e` | Passed on real PostgreSQL/auth/WS with two matched browser accounts and a third-account seat challenge |
| `git diff --check` with CRLF-compatible whitespace settings | Passed |

The build retains the existing Vite CJS API deprecation, outdated Browserslist data and large
bundle notices. These are build notices; lint has no warnings. No dependency upgrades or
unrelated audit fixes were added to this phase.

Local PostgreSQL commands, all exit code 0:

| Server script (`npm run -w server …`) | Result |
|---|---|
| `test:matchmaking:db` | Passed; repeated after the visual corrections |
| `test:match:db` | Passed |
| `test:match-types:db` | Passed; six complete legal Casual/Rated games |
| `test:rating:db` | Passed |
| `test:leaderboard:db` | Passed; includes 100 Casual wins excluded from Rated statistics |
| `test:results:db` | Passed |
| `test:actions:db` | Passed |
| `test:snapshots:db` | Passed |
| `test:replay:db` | Passed |
| `test:replay-api:db` | Passed |

The owned PostgreSQL 16 test container used loopback port 53518 and database
`fate_phase18_test`. After every test and browser process finished, its ownership label was
checked and the container/anonymous test volume removed. Synthetic records were also cleaned
by the individual suites. No production database or deployment was changed.

Visually reviewed final screenshots:

| State | Viewport | Screenshot |
|---|---|---|
| Idle Rated search and selected Classic mode | 1366×768 | `idle-1366.png` |
| Waiting, rating/range, Cancel, disabled manual actions | 1920×1080 | `searching-1920.png` |
| Waiting | 1366×768 | `searching-1366.png` |
| Waiting/tablet | 768×1024 | `searching-768.png` |
| Waiting/mobile | 390×844 | `searching-390.png` |
| Found, ordinary shared Rated room, fixed P1 host, Locked mode and announcement | 1366×768 | `match-found-desktop.png` |
| Found/mobile | 390×844 | `match-found-mobile.png` |

The browser also verified preserved joinedAt after refresh and a second same-account tab,
same room/opposite seats, exactly one persisted Match/two participants, explicit mode-lock
metadata with disabled controls, protected reservations, Cancel, logout and no page errors.
Every waiting viewport had no horizontal overflow. Contexts used reduced motion. The final
screens show readable controls, the Rated classification and restrained Match Found notices.

Continuation audit after the interrupted chat: all seven final PNGs were opened and visually
inspected again. The preserved verification ledger contains 28 successful command results;
the final build, full test, i18n, PostgreSQL matchmaking and browser transcripts confirm those
results. Existing successful tests were not rerun because no implementation changed during
continuation. `docker context show` and `docker ps -a` confirmed that the current `desktop-linux`
context has no remaining containers; `Get-NetTCPConnection` confirmed no listener on the
isolated PostgreSQL port 53518. Test-container cleanup had already completed before resumption,
so no further database deletion was necessary. Unrelated anonymous Docker volumes were left
unchanged. The continuation record is `.tmp/phase18-continuation-audit.log`.

Not verified: production deployment, production database changes, restart recovery, distributed
servers, and completing a game through every browser click. Full game completion, replay,
Glicko and leaderboard were verified through real PostgreSQL and the normal server lifecycle.
The screenshots use English; Ukrainian strings and locale behavior passed automated checks.

The first concurrent verification attempt exposed Windows Prisma engine DLL locking and an
existing five-second action-drain timeout under concurrent compiler/test load. The final run
serializes generation, build and database suites. An initial new DB test also exposed a missing
LeaderboardService test configuration; the fixture was corrected and its rerun passed. These
initial failures are not counted as successful checks. The first sequential root test run then
exposed the old mode fixture's reuse of the same accounts in several unfinished games. Each
mode scenario now gets separate persistent test identities; its focused rerun passed, and the
entire final verification was restarted on that corrected fixture.
The next run exposed Windows cold-process starts exceeding the deployment test's ten-second
subprocess budget, also reproduced in isolation. Only that test's Windows process-launch budget
was raised to thirty seconds; its exit-code/error-sanitization assertions and production readiness
deadlines remain unchanged. The new matchmaking browser harness was added to its remote-DB
rejection checks. The updated fixture is `src/tests/deployment.test.ts`.
The first browser attempt timed out waiting for the complete window load on a cold Vite start.
The harness now waits for DOM readiness and actual controls, with a bounded sixty-second
bootstrap timeout and failure screenshots. Its reruns passed. Visual review then exposed an
Unlocked label despite server enforcement and first-arrival host reassignment; explicit lock
metadata and preserved reserved-room host ownership corrected both. Full tests, build, lint,
the PostgreSQL matchmaking suite and browser checks were rerun successfully afterward.
