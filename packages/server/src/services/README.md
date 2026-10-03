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
