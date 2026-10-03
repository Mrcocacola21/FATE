# Services

Application business logic belongs here. Auth routes call AuthService, which coordinates password
and token modules with UserRepository and AuthSessionRepository. Only repositories/database
infrastructure perform Prisma queries. AuthService recognizes Prisma constraint error types to
map concurrent registration conflicts. Registration uses one atomic nested repository write.
MatchService coordinates durable lifecycle metadata through MatchRepository. MatchLifecycle
projects room creation, seat competitors and accepted start/finish transitions; ordinary realtime
actions and the rules engine remain in memory. Normal competitive gameplay uses verified identities.
MatchSnapshotService captures private versioned checkpoints, persists them through
MatchSnapshotRepository, and validates records on internal loads. MatchLifecycle adds checkpoints
to the existing tracked per-match action queue; terminal results wait for actions and snapshots.
ReplayService accepts only reader capabilities, reconstructs from durable match creation inputs
or validated checkpoints, and executes rules with a local SeededRNG. Its independent final validation
starts at revision zero and compares normalized GameState and RNG against the final snapshot.
It never calls MatchLifecycle, room storage, socket handlers or persistence methods.
ReplayQueryService exposes the completed-match read path: lightweight metadata-only timeline queries,
revision/accessibility checks, ReplayService reconstruction and explicit makeReplayView projection.
Authentication and sanitized HTTP error mapping live in replayRoutes; no authoritative state crosses HTTP.
PlayerStatisticsService reads finished participant results through StatisticsRepository and delegates
summary, streak and mode calculations to pure statistics helpers. It excludes incomplete legacy results
with safe diagnostics. Statistics are public derived aggregates, independent of rooms, profiles, current
Figure Sets and replay JSON/checkpoints; historical hero/loadout statistics remain unavailable.
RatingService coordinates pure Glicko-2 updates through RatingRepository and its transaction adapter.
MatchService invokes it only after rated results commit, including idempotent completion retries.
Serializable transactions plus ordered User row locks protect concurrent games and lazy initialization;
both rating states, both audit rows and the Match marker commit together. Public rating/history reads
are independent of processing. The same processRatedMatch operation repairs a completed unprocessed
rated match after restart; no startup scan or historical backfill runs automatically.

LeaderboardService exposes public qualified/provisional standings through LeaderboardRepository.
The repository performs two read-only SQL statements in one RepeatableRead snapshot: population count
and window-ranked/aggregated standings, with safe whitelisted sorting and DB pagination. Current Rating
is authoritative; durable outcomes from successfully processed rated matches provide performance.
Qualification settings are centralized and included in response metadata. Missing/deleted competitive
results yield explicitly unavailable performance rather than fabricated wins/losses or win rate.
Leaderboard never invokes rating processing or changes broader career Statistics semantics.
Phase 17 reuses Match.isRated as the sole durable competitive classification.
Validated create intent becomes immutable GameRoom.matchType; MatchLifecycle
maps it to isRated before publishing the room. Read DTOs map the flag back to
CASUAL/RATED. GameState/rules, action journals, snapshots and deterministic replay
remain independent of this metadata. Casual finalization skips RatingService;
its recovery entrypoint independently rejects Casual. General career statistics
continue to include both classifications, while leaderboard metrics use only
successfully processed rated matches.


### MatchmakingService

One process-local Rated queue keyed by persistent User ID, coalesced pending joins, cached
assignments, authenticated delivery routes and synchronous competitor guards. Pure typed range
configuration lives in `matchmaking/config.ts`. Oldest-first mutual-range candidate selection
claims both users before database work. Known rollback restores waiting priority; uncertain
commit retries the same stable operation via `MatchLifecycle.createMatchedRoom`.

The existing MatchService creation API accepts server-owned initial participants and persists
both seats atomically through MatchRepository's nested create. GameRoom user reservations are
independent of socket IDs and reconnect tokens. There is no second gameplay/persistence/rating
path. HTTP endpoints live in `routes/matchmakingRoutes.ts`; WS subscription/delivery use `/ws`.
See the root README for exact contracts, shutdown/connection policy and single-process limits.
