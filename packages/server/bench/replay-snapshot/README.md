# Replay / snapshot research harness

This offline harness measures storage, reconstruction latency, and replay work on
one identical deterministic trace per scenario. It uses real FATE rules and the
current production `ReplayService`, initial-state builder, accepted-action
serializer, and snapshot v1 serializer/deserializer. It adds no Prisma model,
migration, route, UI, rating operation, or production persistence policy.

## Run on Windows / PowerShell

Use the repository's canonical Node **22**, `npm ci`, and `npm run -w rules build`
(also run by postinstall). Node, V8, hardware and Git metadata are recorded.
`tsx` uses `tsconfig.tests.json` to resolve the actual rules source. No benchmark
runtime is included in the server production build.

```powershell
npm.cmd run benchmark:replay:quick
npm.cmd run benchmark:replay -- --modes=STANDARD,DRAFT,CLASSIC --actions=50,100 --seeds=1,2 --snapshot-intervals=5,10,20,50,100 --warmup=2 --iterations=3 --output=bench-results/all-modes-01
npm.cmd run -w server test:benchmark
npm.cmd run -w server benchmark:typecheck
```

`npm.cmd` avoids argument loss observed with the installed PowerShell `npm.ps1`
wrapper. Check the echoed `tsx` command and saved `config` when running an
experiment. All arguments use `--name=value`; unknown/duplicate options and
malformed values fail. Number lists are deduplicated and sorted. Mode and scenario
lists are deduplicated; empty lists fail. Seeds are integers 1..4294967295; zero
is rejected because the production RNG constructor normalizes it to one.

Quick: STANDARD, controlled, 50/100 actions, seeds 1/2, intervals 10/20/50,
2 warmups, 3 measured iterations per target. This is a correctness smoke, with
too few repetitions for thesis conclusions.

Research: STANDARD, controlled, 100/250/500/1000 actions, seeds 1..10, intervals
5/10/20/50/100, 10 warmups, 30 measured iterations per target. This is a manual
experiment, never a normal CI timing threshold. Expect minutes rather than seconds;
start with quick, then a single long trace to estimate cost on your machine.
The complete research matrix is not run automatically during implementation.

```powershell
npm.cmd run benchmark:replay:research -- --modes=STANDARD --actions=100,250,500,1000 --seeds=1,2,3,4,5,6,7,8,9,10 --snapshot-intervals=5,10,20,50,100 --warmup=10 --iterations=30 --output=bench-results/thesis-run-01
```

Repeat in separate output directories. Files are created exclusively: rerunning
into an existing artifact fails, rather than overwriting an experiment.
Default directories include a UTC timestamp. `bench-results/` is gitignored.
`--strict=true` requires a clean Git worktree; the default records dirty status.

## Scenarios and reproducibility

`scenarios.ts` creates an **unpublished** ephemeral room with an explicit rules
RNG seed. It never attaches lifecycle/persistence, opens sockets or registers a
room. Every gameplay action goes through `applyGameAction` and must increment the
accepted revision. Draft choices use the actual `banDraftHero` / `pickDraftHero`
acceptance checks and the same setup journal as production fixtures.

The action policy has its own seeded LCG: `(seed XOR 0x9e3779b9) >>> 0`. The policy
version, rules seed, policy seed, initial configuration, Figure Set description,
mode, scenario type, requested and actual lengths, action-type histogram, and a
SHA-256 trace identity are recorded. Synthetic action timestamps start at
2000-01-01 UTC plus revision milliseconds. No uncontrolled randomness influences
the workload. Production `createGameRoomWithId` receives an explicit seed, so its
unseeded default is never used.

STANDARD uses Jebe archers for both players, with default other classes. CLASSIC
uses production classic armies. DRAFT uses the safe class draft and first legal
hero in stable production pool order. The Figure Set is fixed per mode, not
randomly changed between strategies. Placement and controlled movement choose
among production legal helpers using the policy RNG. Pending rolls use real
choices, including normal-rule declaration, Hassan selection, charged impulse
targets, Asgore/Don choices, and passing optional reactions. The policy is bounded,
not an exhaustive bot supporting every conceivable hero ability.

- `--scenarios=controlled` (default): legal movement, required dice/automatic
  impulses, unit turn starts, and end-turn actions. It does not request ordinary
  attacks. Automatic hero effects can still cause combat or end a match. This is
  a **controlled legal workload**, not a claim about typical human play.
- `--scenarios=natural`: greedy movement toward enemies and legal attacks until
  normal completion or the configured action cap. No win conditions are disabled.
- `--scenarios=controlled,natural`: separate scenarios, each shared identically
  across all strategies. If a game ends early, `actionCount` and `finalRevision`
  show its actual length and `stoppedReason=game_completed`. An unfinished natural
  match reports `target_reached`; it is not mislabeled as completed gameplay.

One trace is generated and passed to **every** strategy. A different requested
length regenerates the same deterministic prefix for the same seed/mode/policy.
Generation and reference-size collection occur outside all reconstruction timers.
Only one scenario's state history is retained at a time.

Default targets include 0, 1, floor(25%/50%/75%), final, and for each interval K:
K-1 plus a near-final snapshot boundary, boundary-1 and boundary+1. A boundary
with a following action is chosen when available. Add three deterministically
seeded uniform revision draws (`seed XOR 0x85ebca6b`). Deduplicate, sort, and store
the **exact list** in each scenario. `--random-targets=0` disables random draws.
`--targets=0,20,21,39,40,41,59,60` overrides selection; targets beyond the actual
trace length fail. Every strategy measures the same targets, including intervals
larger than the match. Target sets deliberately sample boundaries and worst tails;
their mean replay work is not a uniform-in-time expectation or a hit-rate estimate.

## Persistence definitions and storage accounting

| Strategy            | Persisted payloads                                                                 | Reconstruction at R                                           |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| FULL_STATE          | Complete state at 0 and every accepted revision, including RNG continuation        | Direct load/validate at R; 0 replayed actions                 |
| ACTION_LOG          | Seed + production initial configuration once, and every accepted action            | Actual ReplayService from 0; R replayed actions               |
| SNAPSHOT_ACTION_LOG | Same initial configuration and complete actions, plus full snapshots at K, 2K, ... | Actual ReplayService from latest S <= R; R-S replayed actions |

Primary `--snapshot-policy=periodic_only` has **no forced final snapshot**.
Optional `--snapshot-policy=production_policy` adds a final checkpoint when the
match actually ends, matching production `MatchSnapshotService.shouldCapture`.
An action cap alone does not force a final snapshot. Revision zero is an initial
configuration for log strategies and one full state for FULL_STATE, never both.
Periodic snapshot count excludes zero. Duplicate final/periodic boundaries count
once. Any positive interval is supported; an interval above the trace length is
retained unchanged and normally yields zero snapshots.

State encoding uses production `serializeMatchSnapshot` / `normalizeSnapshotState`:
unit arrays, complete authoritative/private domain state, empty presentation
`events`, format version 1, and exported Numerical Recipes uint32 LCG state.
Revision zero uses the identical normalization and state schema (the production
snapshot API deliberately accepts revisions >=1 only). The benchmark envelope
also carries game mode and compact `captureReplaySetup` room configuration while
in lobby/draft, so full state does not require an action history to resume setup.
Both full states and snapshots use this same envelope. Gameplay Figure Sets are
already represented by unit hero IDs. GameState presentation event history is not
required by rules; the production action journal owns event history.

Actions are generated using production `toAcceptedActionRecord`, including the
sanitized action payload, `_replay` setup version 1, persisted events, actor seat,
nullable synthetic actor user ID, action type, revision and deterministic creation
time. Surrogate row IDs and shared match linkage are omitted from logical payload
accounting for all strategies. No artificially shortened action format is used.
No real users, credentials, socket envelopes, or full states appear in results.

Logical bytes are **sum(Buffer.byteLength(serializedRecord, 'utf8'))** of actual
JSON record strings, without an artificial enclosing array or newline delimiters.
`initialStateBytes` contains the seed/config cost, `actionLogBytes` the complete
journal, `snapshotBytes` periodic/final payloads, `fullStateBytes` all states.
Envelope fields are counted inside their component; `metadataBytes=0` means there
is no additional persisted metadata record. Research output/configuration files
are not included in persistence storage totals. Full state does **not** also
store actions. Logical totals omit PostgreSQL linkage columns/page/index overhead.

Collect raw per-record state/action/snapshot byte sizes, counts and distributions,
total bytes, bytes per accepted revision (including amortized initialization),
persisted record count, write operations per revision (excluding the one initial
write), storage amplification vs pure log, and saving vs full state. Reference
state sizes at every revision and action sizes remain available even for strategies
which do not persist those payloads. UTF-8 bytes, not JavaScript string length, are
canonical. Serialization timings include JSON encoding plus production
normalization/validation, and are reported separately from DB transactions.

## PostgreSQL mode and safety

Memory is the default and needs **no DB URL**. PostgreSQL requires an explicitly
provided `BENCHMARK_DATABASE_URL`; it never falls back to `DATABASE_URL`,
`DIRECT_URL`, `TEST_DATABASE_URL`, or `.env`. The repository test DB guard rejects
production mode, non-PostgreSQL protocols and non-loopback hosts (including all
Neon/Render targets). This harness additionally requires a **database** name with
a `test` segment; a test-named schema in a shared database is insufficient.
The URL and credentials are never included in artifacts or driver error output.

Use the project's PostgreSQL 16 standard in a dedicated disposable container;
these sample credentials are local synthetic test credentials only:

```powershell
docker run --detach --rm --name fate-replay-benchmark-test -p 127.0.0.1:5433:5432 -e POSTGRES_DB=fate_benchmark_test -e POSTGRES_USER=fate_test -e POSTGRES_PASSWORD=fate_test postgres:16-alpine
docker exec fate-replay-benchmark-test pg_isready -U fate_test -d fate_benchmark_test
$env:BENCHMARK_DATABASE_URL = 'postgresql://fate_test:fate_test@127.0.0.1:5433/fate_benchmark_test'
npm.cmd run -w server test:benchmark:postgres
npm.cmd run benchmark:replay:quick -- --storage-backend=postgres --output=bench-results/postgres-quick-01
npm.cmd run benchmark:replay:research -- --storage-backend=postgres --modes=STANDARD --actions=100,250,500,1000 --seeds=1,2,3,4,5,6,7,8,9,10 --snapshot-intervals=5,10,20,50,100 --warmup=10 --iterations=30 --output=bench-results/thesis-postgres-01
docker stop fate-replay-benchmark-test
Remove-Item Env:BENCHMARK_DATABASE_URL
```

No migration or application table is needed. Each run creates only its generated
`fate_bench_test_<UUID>` schema. Each strategy/scenario uses new insert-only tables
with revision PK and `payload text`; no updates or reused/dead tuple storage.
Only the strategy's necessary components are created. One transaction persists
initialization; then one transaction per revision persists state OR action plus
optional snapshot. Raw transaction durations include Prisma/SQL/commit and exclude
serialization, table DDL and storage queries. Tables are removed after each scenario,
and the run-owned schema is removed in finally. A hard process kill can leave its
schema; remove only the identified run-owned `fate_bench_test_*` schema after
checking ownership. Application tables are never created/read/written by the harness.

`databaseBytes` is the sum of **pg_total_relation_size** for the relevant tables:
heap, indexes, TOAST and auxiliary forks. Fixed PostgreSQL page overhead and text
TOAST compression are real physical costs and can dominate small runs. This is a
benchmark-local **text payload adapter**, not an exact simulation of production
Prisma JSONB rows, FK/UUID/user columns or production indexes. Logical bytes remain
the portable thesis comparison; databaseBytes describe this documented adapter.
Keep PostgreSQL major/build/configuration fixed across experiments; actual server
version is recorded. There is no VACUUM/update ambiguity or disk-volume `du` metric.

## Latency, correctness, and statistics

Each target first reconstructs and validates **before any timed reconstruction
samples**. All strategy/target groups warm up first; warmup timings are discarded.
Dataset write order rotates by seed, and measured group order rotates by iteration.
Samples run sequentially in one process, without Promise.all CPU contention.
Every measured result is validated outside the timer before its latency is stored.
An invalid result marks the target incorrect, writes a safe failure artifact when
possible, and returns nonzero; invalid latency never enters aggregates.

`performance.now()` is the monotonic high-resolution timer; machine values are
unrounded milliseconds. Three boundaries are recorded per iteration:

1. `loadLatency`: fetching the required serialized initial/state/snapshot/action
   tail from the chosen adapter. Memory measures record lookup/slicing; PostgreSQL
   includes actual indexed queries, driver/network wait and result transfer. These
   queries are sequential and no outside DB loading is hidden inside replay.
2. `reconstructionLatency`: after load, JSON decoding, snapshot validation, initial
   construction/RNG restoration, actual `ReplayService.reconstructAtRevision`
   action validation/permission/continuity/applyAction work and result creation.
   Service construction and async in-memory readers are included. Full state uses
   the same snapshot deserializer/schema (with revision-zero support) and no replay.
3. `totalLatency`: contiguous load + reconstruction. Correctness comparisons,
   RNG continuation probes, logging, trace generation, serialization/building and
   output writing are outside this boundary.

The ReplayService production guard is retained; injected no-op replay metrics and
a silent logger consistently avoid Prometheus/log overhead for all strategies.
No public API/HTTP/WebSocket/UI/rating/recovery lifecycle is called.

Compare canonical `normalizeSnapshotState` with the independently captured state
at R; compare exact exported RNG continuation state and 16 real `rollD6` calls plus
their resulting RNG state. When R has a pending roll with a recorded successor,
apply that actual next domain action to the reconstructed state/RNG and compare
both state and RNG with R+1. Snapshot boundaries and initial revisions are covered.
This measures authoritative domain reconstruction, not the additional room recovery
scan for user/room/draft ownership in `reconstructForRecovery`.

Keep **every raw measured sample**. Statistics: count, min, max, mean, p50/median,
p95, p99 and population standard deviation. Percentile p uses linear interpolation
at `(n-1)*p` in ascending values (R type 7). No measured outliers are removed and
GC is not forced. Aggregate strategy latency summaries pool the explicitly selected
targets; per-target distributions remain the defensible plotting unit. Replay-work
statistics count each selected target once, independent of repetitions.

JIT, GC, CPU/power modes, process-local caches, DB/OS caches, background workloads,
Prisma overhead, and asynchronous scheduling all affect timings. These are **warm
application-level measurements**, not controlled cold-cache or concurrent-user
load tests. For final thesis runs close heavy applications, use AC power, run no
tests/builds concurrently, repeat complete runs, and retain metadata. No significance
test, arbitrary score, optimal-interval claim, cache flushing or auto tuning exists.

## Versioned artifacts

`output.ts` exports Zod `resultSchema` (`schemaVersion=1`, `harnessVersion=1.0.0`).
It validates output before writing and reads/validates the actual JSON afterward.
Its semantic checks verify byte sums/counts, shared trace identity, complete targets,
actual replay counts, snapshot intervals, correctness, raw sample counts and stats.
Exit code is nonzero for invalid config/artifacts, unsafe DB, persistence/reconstruction
failure or cleanup failure. Slower performance than a hypothesis never fails.

- `results.json` (canonical): run status/time, full normalized config, environment,
  scenarios, exact targets, trace metadata, storage and serialization metrics,
  transaction samples, raw load/reconstruction/total latency samples and summaries,
  correctness/RNG status and replay counts/ratios. Failed runs contain a safe error
  category, stage and scenario/strategy/target when available; no driver credentials.
- `summary.csv`: one row per scenario/strategy/interval/target with identity, mode,
  seed, requested/actual action counts, storage components, database bytes,
  snapshot count, amplification, replay work, correctness and latency summaries.
- `samples.csv`: one row per measured iteration with scenario/strategy/interval/
  target identity, replay work, correctness and the three raw latency values.
- `result-schema.json`: machine-readable JSON Schema for version 1 structural
  validation. Zod additionally enforces the cross-field semantic invariants above.

Environment includes UTC run timestamps, Git commit/dirty state, Node/V8 version,
platform/architecture, CPU model/count, total RAM, PostgreSQL version when used,
timer, units, controlled instrumentation/cache/order policies and selected runtime
flags. It omits hostname, username, home path, environment variables and connection
URLs. Output contains sizes/hashes, not complete state/action payloads.

These artifacts support storage vs actual action count, reconstruction vs target
revision, replay-work curves and per-target storage/latency trade-off plots. Basic
descriptive statistics are measured; H1 (full state spends storage to reduce replay),
H2 (pure-log work grows), H3 (snapshots bound tails) and H4 (smaller intervals trade
storage for work) are research hypotheses, not conclusions baked into the code.

## Verification and isolation

`benchmark.test.ts` covers all-mode deterministic traces; full/log accounting;
N=53/K=20 placement; replay at 40/41/59/60; interval above length; percentile/stddev
definitions; UTF-8 bytes; state equivalence; corrupted state/RNG detection; actual
pending-roll continuation; unpublished rooms/read-only datasets; natural completion;
final policy; DB guards; valid JSON/CSV and deterministic reruns. These tests join
normal server/unit/regression discovery, without timing thresholds.

`postgres.integration.test.ts` is explicitly invoked with the safe benchmark URL.
It tests all three strategies, physical/logical bytes, transaction samples, actual
DB reconstruction, cleanup, unchanged public tables and unchanged production-table
counts when those tables exist in the disposable DB. It does not bootstrap any
production schema. Research workloads are not added to CI.

Normal checks: Prisma generate/validate, web and whole-workspace typechecks, zero-
warning lint, unit/integration/regression tests and build. Integration tests require
the existing `TEST_DATABASE_URL` guard. Then run the quick preset alone, and the
optional PostgreSQL quick preset against the disposable DB. See
[`implementation-report.md`](implementation-report.md) for the actual verification
commands, output paths, measurements and limitations of this implementation run.
