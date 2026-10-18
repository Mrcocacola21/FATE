# Active match and disconnect lifecycle

FATE has one active backend owner. Startup recovery finishes before gameplay traffic
is accepted (including when the recovery readiness mode is enabled). Overlapping
owners/rolling deployments remain unsupported; there are no distributed leases.

## Root cause

The transport grace callback in `ws.ts` only called `vacateSeat`. A started room's
`participantsLocked`, authenticated seat identities and resume token deliberately
survived that operation. Explicit `leaveRoom` did the same thing. Neither path
finished or interrupted the persistent match. `hasRuntimeMatch` therefore continued
to reserve the competitor even after the socket had gone. A manual match also
required its old browser resume token, so a fresh browser session could not reclaim
the otherwise live reservation. There was no account-level active-match discovery.

The room TTL was 24 hours, but cleanup was request-driven and excluded rooms with
any live sockets, including spectators. It was not an abandonment deadline.
Startup already reconstructed valid active matches and neutrally cancelled corrupt
ones; recovered offline seats then had a new room TTL, without a participant
reconnect deadline. These paths could keep an offline match active indefinitely.

There were also inconsistent guards: queue entry trusted every persisted
`IN_PROGRESS` participant, while manual creation/join checked runtime occupancy
only. An orphan could permanently block the queue; manual creation could either
be blocked by a surviving reservation or leave a zombie row behind when it allowed
a new lobby. This is verified from code and regression fixtures, not production
database forensics; the particular production row/logs were not available.

## Policy

| Event | Outcome |
| --- | --- |
| Temporary competitor disconnect | Reserve the same seat/state during `RECONNECT_GRACE_MS` (default 45,000 ms). |
| Reconnect before queued expiration wins | Reclaim the same Match/revision; clear the timer. |
| Tab activation / online snapshot refresh | Reuse the healthy socket. Repeated joins to the same room, role and authenticated identity retain transport membership; they never trigger leave/abandonment. |
| Fresh authenticated tab | May reclaim its own locked seat without the previous browser token. A supplied token still undergoes identity/token validation. The newer tab replaces the old transport. |
| Replaced tab closes / spectator leaves | No competitor abandonment. |
| Competitor grace expires | Neutral interruption: `CANCELLED`, `finishedAt`, `SERVER_RECONNECT_GRACE_EXPIRED`. |
| Explicit leave/switch away from an active seat | Immediate neutral interruption: `SERVER_PARTICIPANT_LEFT`. A socket close remains a temporary disconnect. |
| Both competitors gone | Same neutral interruption, once; callback order never chooses a winner. |
| Pre-start lobby leave | Existing seat-release/host/lobby semantics. |
| Server restart, valid durable history | Restore same Match, mode, RNG, revision and competitors; start a fresh configured reconnect window for each offline seat. Returning competitors clear their respective windows. No old remaining timer is claimed. |
| Server restart or runtime loss, unrecoverable history | Existing `CANCELLED` interruption with `SERVER_RESTART_UNRECOVERABLE:<reason>`, and one `MATCH_INTERRUPTED` audit event. |

There is no surrender/forfeit action or competitive disconnect result in the current
rules/result model. This fix does not invent one. Leave, abandonment and infrastructure
interruption produce **no winner, loser, draw, participant result or rating change**.
Normal legitimate game completion continues through the existing finalization,
snapshot and exactly-once per-game-mode rating pipeline. Casual remains unrated.
No Glicko, rank or game rule changes are made.

## Canonical eligibility and reconciliation

`ActiveMatchService.resolve` queries only the user's `IN_PROGRESS` matches. Manual
create/join and Rated queue admission use this policy through the competitor guard.
An existing room (including a cancellation write pending retry) blocks another match.
A missing room is reconciled under its room command queue: drain tracked local
writes/projections, re-read active status, then reuse `MatchRecoveryService`'s exact
startup candidate reconstruction. Recoverable history restores the room; corrupt or
legacy history commits neutral interruption before the user is released. A failed
local journal with no runtime is also neutrally interrupted. Database/global failures
fail closed instead of discarding healthy games. Concurrent recovery requests for
the same room serialize, and the second request rechecks registry/status.

Stale means **no authoritative runtime, no restoration currently holding the room
queue, and failed safe reconstruction**, or a definitively expired participant
window. Match age alone is never a stale classification. A five-day-old valid match
still recovers and blocks a second match.

Grace expiry, reconnect, accepted commands and interruption use the room queue.
An interruption marks the room unavailable to new actions/joins before writing the
terminal status. On storage failure it keeps blocking and retries through the
existing lifecycle retry loop. On commit it removes the registry entry/projection,
clears grace timers, releases transport subscriptions, and sends the existing
controlled `MATCH_INTERRUPTED` message. Repeated callbacks/cleanup do nothing.
Historical Match, MatchParticipant, MatchAction and MatchSnapshot rows remain.

Existing production zombies require no SQL repair or maintenance command: normal
startup reconciles active rows; user eligibility/discovery also repairs missing
runtime rooms. Recovered but still absent competitors expire their fresh window.
There is no full-history poll, cron, arbitrary age limit, or Prisma migration.

## API and UI

Authenticated `GET /api/matches/active` (no-store) returns
`{ match: { id, roomId, seat, rejoinable } }` or `{ match: null }`. The same service
backs discovery and permission checks. Existing `MATCHMAKING_ALREADY_IN_MATCH`,
`MATCH_INTERRUPTED` and canonical API envelopes remain in use.

Play and Lobby refresh account-level discovery on mount, focus, error changes and
every ten seconds. English/Ukrainian notices offer Return to match. A null response
clears the notice. This state does not disable Create Lobby: the server determines
permission. Existing interruption handling clears the old room session and stops
automatic rejoin. Logs carry bounded event/reason codes and match/room IDs, not
tokens or authoritative GameState.

## Regression coverage

`staleMatch.integration.test.ts` uses real guarded loopback PostgreSQL. The original
five-day-old unrecoverable row/absent room fixture fails on the original implementation:
lobby creation returns but the old row is still `IN_PROGRESS`. It passes after the
fix with terminal reconciliation. The suite also checks idempotent audit/history,
no ratings, Rated queue unlock, a valid missing room restored at revision 37,
live-match creation/queue blockers, recovered offline grace expiry and unlock.

`staleMatch.ws.test.ts` uses real WebSockets and fake timer advancement for normal
rejoin, fresh-tab reclaim, live blocking, spectator isolation, tab replacement,
one/both competitors absent and explicit leave. `unit/staleMatch.test.ts` covers
both timeout/reconnect orderings, action exclusion, interruption retry/idempotency,
and missing-runtime journal failure. `ActiveMatchNotice.test.tsx` verifies Return
and clearing a stale notice after server reconciliation. Existing restart DB/WS
tests cover all modes, action gaps, preserved history, reconnect/continuation,
normal finalization, rating repair and per-mode exactly-once behavior.
