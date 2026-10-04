# Server restart recovery

FATE restores unfinished persistent matches in its **single active backend process**.
The same `Match.id`, unique `Match.roomId`, mode, Casual/Rated classification and
competitor identities continue after restart. This does not provide high availability.
`MATCHMAKING_SERVER_PROCESSES=1` remains a deployment assertion, not a distributed lock;
the deployment must prevent overlapping backend owners, including rolling deployments.

## What existed before this change

`GameRoom`, the room registry, sockets, connection IDs, resume tokens, grace timers,
matchmaking queue and pending persistence projections were process-local. Startup
only checked database readiness; it did not recreate rooms or repair ratings.
The database already stored Match, MatchParticipant, MatchAction, MatchSnapshot,
initialConfig, seed, gameMode, isRated, finalRevision and ratingProcessedAt. Snapshots
already included validated GameState and exact versioned LCG continuation. ReplayService
already implemented read-only deterministic reconstruction, including lobby inputs and
draft action history. These existing boundaries are reused.

## Actual durability guarantee

Live commands still apply to RAM, synchronously capture their action/checkpoint, enqueue
persistence, then broadcast/acknowledge **without waiting for the journal commit**.
The per-match queue orders action N, snapshot N if scheduled, then later writes.
Retries are bounded; a failed action/checkpoint blocks subsequent writes and finalization.
Graceful shutdown drains tracked commands, action writes and result completions with
existing bounded deadlines before disconnecting Prisma.

**An acknowledged action can be lost in a hard crash if its database write has not
completed.** Recovery restores durable state and can roll back that non-durable window.
This change deliberately retains the existing latency-sensitive asynchronous design.
It does not promise zero action loss under an arbitrary hard crash.

There is no durable currentRevision/watermark in this schema. The recovery frontier N
is the end of the **complete, ordered, contiguous durable MatchAction journal 1..N**.
Every row is decoded at the existing strict serializer boundary. The full journal is
checked even when an exact/latest snapshot would hide an earlier gap. No gap, duplicate,
unsupported action format, malformed payload, wrong match ID, or durable revision beyond
a gap is silently discarded. A snapshot ahead of N, or conflicting non-null finalRevision,
is an integrity failure. Snapshot presence does not independently excuse missing actions.
An active Match with an empty journal can restore revision zero only when its original
initialConfig and authenticated competitors are sufficient; the start action may have
been visible but not durable. The next accepted action is always N+1.

Pre-start lobby actors can differ from the final competitors because players may leave
and be replaced before start. Actor ownership against MatchParticipant is checked from
the durable startGame onward; legacy null actorUserId is not fabricated.

## Coordinator and startup

`MatchRecoveryService` orchestrates paginated `MatchRecoveryRepository` discovery,
frontier validation, ReplayService reconstruction, `restoreGameRoom`, lifecycle attachment,
normal registry publication and independent rating repair. Reconstruction has no write
capability and never invokes replay HTTP endpoints.

Fastify's awaited `onReady` hook runs recovery before listen/inject can serve gameplay.
Lifecycle retry and matchmaking timers start after recovery completes. `/health` and
`/api/health` remain liveness checks. `/ready` additionally requires startup completion
and the existing bounded DB probe. While startup is pending, no gameplay port is listening;
a separately mounted health route with the startup flag false returns 503 readiness.
Production config validation and DB connectivity probe still precede server construction.
Migrations remain an explicit pre-deploy/start:deploy step, never an application hook.
DB-free development can still serve sandbox/liveness. Injected test persistence skips
production recovery unless the test explicitly supplies a recovery coordinator.

Discovery uses `status IN (IN_PROGRESS, WAITING)`, ordered by id, 100 matches per query.
IN_PROGRESS is the live recovery candidate. WAITING manual/paired lobbies are neutrally
cancelled: transport ownership, readiness and unaccepted figure selections are not a
complete durable waiting-lobby contract. A committed **active** matchmaking-created
match recovers normally even if the previous process never registered its room.
Actions are read in pages of 1000 for frontier validation. ReplayService then uses the
existing indexed revision-range readers. Memory/work still scales with each match's history.

Corrupt/legacy matches are isolated and recorded as CANCELLED with
`finishReason=SERVER_RESTART_UNRECOVERABLE:<safe reason code>`. Historical actions,
snapshots and participants remain intact. There is no invented winner, draw, participant
outcome, rating history, or leaderboard result. Known per-match domain failures do not
prevent unrelated recovery. Storage outages/global failures abort startup without
cancelling healthy games. A conflicting runtime room belonging to another Match is a
global ownership integrity error and aborts startup rather than replacing that room.
Sequential recovery skips an existing room only if its matchId agrees; concurrent calls
on the same coordinator share the in-flight promise. This is startup coordination, not
a supported hot recovery operation while gameplay writes are underway.

Structured logs contain scanned/recovered/skipped/interrupted/finalized/rating-repair
counts, duration, IDs, revision/base and reason codes. They contain no raw GameState,
hidden information, auth/resume tokens, or underlying Prisma diagnostics.

## Reconstruction and RNG

1. Validate the entire durable journal and determine N.
2. Select the newest decodable format-v1 checkpoint at or before N. Damaged state,
   absent/invalid RNG, and unsupported snapshot versions are skipped in descending
   revision order; storage errors are not skipped.
3. If none exists, require the exact supported initialConfig and original seed. Recreate
   revision-zero state with the shared `createInitialMatchState` implementation.
   Seed/mode alone cannot prove original arena/host/setup and are insufficient.
4. Replay only base+1..N through the existing domain algorithm, checking contiguous
   revisions and accepted rules outcomes. Historical replay never appends actions,
   checkpoints, participants, results or ratings and never broadcasts.
5. Restore RNG using `SeededRNG.fromState` for checkpoints, or original seed followed by
   complete deterministic replay. Pending rolls, choices, moves and combat queues are
   ordinary validated domain state: no reroll.

Snapshot v1 does not include room-owned DraftState/figureSets. Recovery decodes the
bounded `_replay` setup records before the checkpoint to recover those inputs, including
the completed draft. It does not apply prefix actions again. Setup schema/version and
draft rules validate that data. There is one rules replay implementation.

Normal replay also skips unusable non-final checkpoints, so a recovered/continued
match remains replayable across the same revision stream. The final checkpoint remains
an explicit determinism oracle; a malformed final checkpoint is not claimed to verify
itself. Valid terminal actions whose result commit was interrupted are finalized through
the normal lifecycle without reopening a live room. A missing terminal checkpoint is
written once as part of intentional completion, not historical reconstruction. Interrupted
completion uses the terminal durable action's timestamp, keeping server downtime out
of match duration. An
existing damaged terminal checkpoint is preserved and classified unrecoverable rather
than overwritten or used to claim a valid replay.

## Live room and connections

`restoreGameRoom(RestoreGameRoomInput)` constructs a deliberately restored GameRoom,
without calling the normal initial-state/random-seed factory. It validates/copies state
through snapshot normalization/schema, clones room setup/identities, restores RNG and
revision, and creates empty transport maps, action presentation log and spectator set.
No private-field manipulation, whole-room JSON, socket serialization or replacement
Match creation is involved. `MatchLifecycle.attachRestoredRoom` attaches the existing
started projection so reconnect cannot rewrite historical competitors or restart Match.
Periodic checkpoints still use absolute revision modulo interval: recovery at 37 with
interval 20 produces the next checkpoint at 40. Normal finalization/rating services are
used after continuation, including correct per-mode ratings and Casual remaining unrated.

Both P1/P2 must have distinct durable `MatchParticipant.userId` values. Seats are reserved
offline to those IDs. Display-name snapshots are presentation only, never ownership proof.
Existing authenticated reservation logic issues fresh tokens and reclaims the seat without
old connId/token data. Another account or a same-named guest cannot occupy it. Same-user
multiple-tab connections follow the existing reservation takeover policy: the newer
connection replaces the old transport and old socket receives SEAT_CONNECTION_REPLACED.
Joining a locked match preserves readiness and ignores new client figure selections.
Fresh P1/P2/spectator state uses existing safe projections; recovery never sends raw
authoritative hidden state. Old spectators are not restored and can rejoin normally.

Current normal Casual/Rated seats require authentication. Legacy guest/missing/deleted-user
seats have no durable cryptographic reclaim proof and are cancelled as
GUEST_RECLAIM_UNAVAILABLE; names/IP/user-agent/first arrival are never used. No guest secret
mechanism was introduced because current persistent competitors are authenticated.

Resume tokens and grace timers remain process-local. Successful recovery reserves offline
competitors and refreshes lastActivityAt, giving a new room TTL/reconnect opportunity;
no old timer is resurrected and there is no immediate restart forfeit. Once connected,
normal disconnect grace applies. There are no additional durable turn deadlines to restore.
If an active room expires/is evicted by normal cleanup before completion, the persistence
service neutrally cancels it with SERVER_ROOM_EXPIRED rather than leaving a phantom active
Match. The existing lifecycle retry handles transient cancellation-write failures.

Matchmaking queue entries and cached assignments are not durable and start empty.
Subscription/GET reports NOT_QUEUED. Persisted active matched games recover with their
participants; new matches record `initialConfig.origin=MATCHMAKING`. Legacy initialConfig
without origin defaults to MANUAL for presentation, without changing seat protection,
mode, or Rated eligibility. Lobby name is restored when present; older names use the
existing FATE Lobby fallback. No Prisma schema change/migration is required.

## Interrupted UX and rating repair

An old cancelled recovery URL receives HTTP 410 MATCH_INTERRUPTED from `/rooms/:id`
or WebSocket joinRejected reason match_interrupted. The client clears the stale room
session, stops automatic reconnect, and displays a calm localized notice with a Lobby
link. English and Ukrainian are supported. Runtime-only unrelated missing rooms retain
ROOM_NOT_FOUND. There is no recovery dashboard or endless interrupted-match spinner.

After active recovery, the coordinator pages `FINISHED AND isRated=true AND
ratingProcessedAt IS NULL` and invokes existing `processRatedMatch`. It never recreates
these matches as rooms. Rating transactions, histories and processed markers already
provide exactly-once behavior; repair uses Match.gameMode, including Draft-only repair.
Failures remain FINISHED and are logged independently for another restart/operational
retry. No continuous background repair worker or repair HTTP endpoint was added.

## Verification and limits

`test:recovery` covers all three modes, durable frontier, exact/snapshot-tail/initial
paths, pending rolls, future RNG values, bad/unsupported checkpoint fallback, malformed
actions, gaps before/after checkpoints, guests, failure isolation, storage outage behavior,
readiness and idempotent/concurrent startup calls.

`test:recovery:db` uses guarded loopback PostgreSQL, destroys runtime/WS registries,
restores the same Casual/actual matchmade Rated Match at 37, reconnects real WebSocket
players and a spectator, rejects an intruder/guest, tests tab replacement, writes exactly
one revision 38, captures 40, restarts again at 54 and 71, finishes normally, verifies
continuous deterministic replay and exactly-once per-mode rating, and tests neutral
corruption UX and finished/unprocessed Draft rating repair.

`test:recovery:e2e` uses real headless browser clients and separate backend processes.
It kills backend A without graceful drain after the journal is durable, starts B against
the same local test DB, requires automatic P1/P2 reconnect with identical pending state,
continues N+1, then deliberately corrupts the test match before another restart to verify
the interrupted notice. Screenshots are under `packages/web/test-results/restart-recovery`.

Tests refuse production, hosted databases (including Neon) and non-test DB/schema names.
Use a migrated local TEST_DATABASE_URL; no production data is required.

Deferred: distributed room leases, Redis, durable matchmaking queues, multi-replica/multi-region
failover, hot standby, socket migration, guest cryptographic reclaim, repair dashboards,
historical manual repair and a background rating worker. Corrupt historical data is retained;
recovery does not repair arbitrary malformed snapshots/actions. A production Render restart
was not performed. Pending non-durable actions still require the asynchronous durability
qualification above. See the implementation report for commands and actual test outcomes.
