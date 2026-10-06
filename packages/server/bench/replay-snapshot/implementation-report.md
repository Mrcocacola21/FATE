# Replay / snapshot harness implementation report

Implemented and verified on **6 October 2026** in `C:\codes\FATE`.
The module is offline research tooling; production persistence, routes, recovery,
ratings, matchmaking, GameRoom behavior and Prisma schema are unchanged.
**Zero Prisma migrations** were added.

## Existing architecture actually inspected

`GameState` and `applyAction` are authoritative rules. `SeededRNG` is the Numerical
Recipes uint32 LCG with algorithm ID `lcg32-numerical-recipes-v1`, exported state
and exact restoration (including a zero continuation cursor). Legal placement,
movement, attack and intent helpers already exist. STANDARD, CLASSIC and safe-class
DRAFT use production army builders. Existing replay fixtures execute legal actions
through unpublished rooms and capture revision histories; this pattern is reused,
with a benchmark policy and deterministic timestamps rather than copying fixture
UUIDs/wall-clock time into experiments. No previous benchmark harness was found.

`Match` stores seed, mode and versioned deterministic `initialConfig`.
`MatchAction` stores contiguous revisions, seat/user actor fields, JSONB action
payload, events and timestamp. Production `toAcceptedActionRecord` validates and
sanitizes actions/events; lobby/draft inputs use private `_replay` setup version 1
to preserve unrevisioned seat/readiness/Figure Set/draft changes.

`MatchSnapshot` stores revision, JSONB state, RNG JSONB state and `formatVersion=1`.
Snapshot v1 copies complete authoritative state, converts the unit dictionary into
an array, empties presentation `GameState.events`, validates the explicit state
schema, and retains RNG continuation. Production defaults to interval **20**;
`MATCH_SNAPSHOT_INTERVAL=0` disables periodic checkpoints, while final checkpoints
remain enabled. No cadence or format was changed.

`ReplayService` is read-only and accepts injected readers. It calls the same
`createInitialMatchState` used by live creation, or validates/restores a snapshot,
checks action format/permissions/continuity, and applies the actual rules with its
own RNG. Canonical equality uses `normalizeSnapshotState`. Final determinism can
be independently verified from initial state. `MatchRecoveryService` shares this
service via `reconstructForRecovery`, validates the entire durable revision
frontier, restores RNG and room ownership/setup, and then invokes lifecycle repair.
The harness invokes historical domain reconstruction, never lifecycle/rating repair.

Observability already uses `performance.now()` and has replay/DB histograms.
Tests already have a local-only PostgreSQL URL guard and per-run isolated migration
schemas. The runner discovers legacy server units, pure units, integration,
contracts and transports. `tsx`, Zod, Prisma, AJV and JSON Schema conversion are
already installed; no dependency was added. Node 22 is the documented CI baseline.

## Files and module architecture

New files in `packages/server/bench/replay-snapshot/`:

| File                                    | Responsibility                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `benchmark.ts`                          | Sequential phases, correctness, warmup, rotation, measurements, environment, CLI  |
| `config.ts`                             | Strict Zod CLI/configuration and quick/research presets                           |
| `scenarios.ts`                          | One deterministic legal trace and shared target selection                         |
| `serializers.ts`                        | Production-compatible state/action/initial encodings                              |
| `strategies.ts`                         | Full-state/log/snapshot datasets, accounting, actual ReplayService reconstruction |
| `postgres.ts`                           | Explicit local test DB guard, disposable schema, insert-only text adapter         |
| `metrics.ts`                            | UTF-8 bytes, periodic placement, deterministic descriptive statistics             |
| `output.ts`                             | Version 1 Zod/JSON Schema validation, exclusive JSON and CSV output               |
| `benchmark.test.ts`                     | Eleven correctness/reproducibility/artifact tests                                 |
| `postgres.integration.test.ts`          | Explicit optional PostgreSQL correctness/isolation test                           |
| `tsconfig.json`                         | Separate benchmark typecheck, no production runtime build inclusion               |
| `README.md`, `implementation-report.md` | Methodology, commands, limitations, actual verification                           |

Changed: root `package.json` (three benchmark scripts; benchmark in workspace
typecheck), server `package.json` (typecheck and two test scripts), `scripts/runTests.mjs`
(quick harness correctness in server/unit/regression/CI), `.gitignore`
(`bench-results/`), and root `README.md` (tooling documentation link).
No existing production TypeScript file, production table or migration changed.

## Workload and strategy definitions

Each scenario generates one initial state and one accepted action sequence, then
all strategies consume that exact trace and reconstruct the same selected revisions.
SHA-256 identity is copied to every strategy result and validated on output.
Rules RNG seed is explicit; the policy uses `(seed XOR 0x9e3779b9) >>> 0` with the
same deterministic LCG. Targets use a separate seeded stream. Policy version,
Figure Set, seed/configuration/mode, action histogram and actual length are saved.

Placement/movement enumerate actual legal helpers; every ordinary action must be
accepted and increment the live command revision. Draft actions use actual draft
acceptance checks and the existing setup journal. Pending dice and automatic hero
choices are resolved using real legal choices supplied by domain context. Controlled
traces avoid requesting ordinary attacks; natural traces attack and approach enemies.
Neither policy disables win conditions. Natural CLASSIC seed 1 finished at revision
**877**; the requested cap of 1,000 was honestly reported as unattained.

Full state stores complete authoritative checkpoint payloads at revisions **0..N**,
including RNG cursor, mode and lobby/draft setup needed to resume without a journal.
It does not add an action log to its totals. Direct reconstruction replays **zero**
actions. Pure action log stores seed plus actual initial configuration once and
the entire production-relevant accepted-action representation; at R it replays R.
Snapshot+log adds the same full encoding at K, 2K, ... and uses actual ReplayService
to replay **R-S**, where S is the latest stored snapshot <= R.

Any positive integer interval is configurable; research defaults are **5,10,20,50,100**.
Revision zero is counted once, outside periodic snapshot count. The primary policy
is `periodic_only`; `production_policy` additionally saves a final checkpoint only
on actual game completion, matching production semantics. An action cap alone does
not force a final snapshot. Duplicate intervals are deduplicated/sorted and intervals
above length are retained unchanged.

Default targets: 0/1, quarter/half/three-quarter/final revisions, K-1, and a
near-final snapshot boundary plus its neighboring revisions for each interval,
with three deterministic revision draws. All exact targets are stored. Explicit
`--targets` can replace this policy; out-of-range targets fail. Quick seed 1 at
length 100 selected `0,1,9,15,19,22,25,49,50,51,75,79,80,81,89,90,91,100`.
Representative boundary sampling is intentional; aggregate replay means are not
claimed to estimate a uniform time distribution.

## Measurement, validation and output

Logical storage sums actual UTF-8 JSON bytes with `Buffer.byteLength`, split into
initial configuration, actions, snapshots and full states. Per-record envelope
fields are already counted inside those components; extra metadata record bytes
are zero. Production row IDs/shared linkage are omitted consistently. Actions
retain actual sanitized production payload/setup/events and deterministic timestamps.
Full state uses the production normalized encoding without presentation event history.
Raw state/action/snapshot sizes, distribution statistics, counts, bytes/revision,
record/write counts, amplification versus log and saving versus full state are saved.

PostgreSQL mode uses **new tables per strategy/scenario** in a UUID-owned test schema,
with revision primary keys and serialized text payloads. Insert-only transactions
persist initialization, then one accepted revision each (with action plus optional
snapshot in one transaction). Write/commit timings exclude serialization/DDL.
Physical `databaseBytes` sums `pg_total_relation_size`, including indexes, heap,
TOAST and auxiliary forks. These are adapter-specific physical sizes, distinctly
separate from logical JSON bytes and production JSONB/FK/UUID storage.

Loading is timed separately: memory record lookup/slicing or actual PostgreSQL
indexed selects and transfer of required serialized data. Reconstruction starts
after those reads and includes decode, normalization/schema validation, service
construction, initial state/RNG restoration, production action validation/continuity/
permissions/applyAction and result construction. Total is contiguous load plus
reconstruction. Generation, dataset serialization/writes, canonical comparison,
RNG continuation probes and artifact writing are outside reconstruction timers.

Every target is validated before measured samples. All groups warm first; warmups
are discarded. Write order rotates by seed, measurement order by iteration.
Samples run sequentially using `performance.now()`; no forced GC, cache flush or
outlier removal occurs. The production replay guard remains with consistent no-op
metrics and silent logging. Every measured output is validated before recording
latency, and actual `actionsApplied` is retained. Invalid results mark correctness
false and fail with a safe partial artifact when possible.

Correctness compares canonical authoritative state and exact exported RNG cursor
to independent trace history. It also compares 16 `rollD6` results and continuation
state. At pending-roll targets with a successor it applies the actual next gameplay
action and compares state/RNG to R+1. Statistics retain raw millisecond precision:
count/min/max/mean/p50/p95/p99 and **population** stddev; percentiles use linear
interpolation at `(n-1)*p` (R type 7). No statistical significance/optimal interval
or arbitrary weighted score is emitted.

Artifacts: `results.json` is canonical and versioned (`schemaVersion=1`, harness
1.0.0), with full config/environment/scenarios/storage/timings/raw samples and
correctness/replay-work metrics. `summary.csv` has one row per scenario/strategy/
interval/target; `samples.csv` one per measured iteration. `result-schema.json`
provides structural JSON Schema; Zod adds byte/count/identity/placement/sample
semantic validation. Output is validated before writing and from the actual JSON
file afterward. Exclusive writes prevent overwriting prior experiments.

Environment recorded: UTC timestamps, Git commit/dirty status, Node/V8, platform/
architecture, CPU model/count, RAM, optional PostgreSQL version, timer/units,
instrumentation/cache/order policy and selected runtime flags. No hostname,
username, environment dump, connection URL, actual user data or full state payload
is exported.

## Safety and tests

Memory requires no database and never loads `.env`. PostgreSQL reads only an explicit
`BENCHMARK_DATABASE_URL`. The existing test guard rejects production environment,
hosted/non-loopback targets and wrong protocol. An additional dedicated database
`test` name requirement rejects a test schema in a shared database. Cleanup can
drop only the generated run-owned schema/tables. No application table is used by
the harness. PostgreSQL integration verified reconstruction, nonnegative logical/
physical bytes, transactions, unchanged public table inventory/production-table
counts when present and removal of run-owned schemas. A direct cleanup check after
final runs found **zero** `fate_bench_test_*` schemas.

Eleven harness tests cover malformed config and duplicate normalization, percentile/
population stddev/UTF-8, placement/final policy, all-mode trace determinism and
state equality, long draft automatic choices, full/log accounting, exact 40/41/59/60
tails, interval above length, corrupted state/RNG and actual pending continuation,
natural completion, unsafe URLs and JSON/CSV/schema/reproducible reruns. No timing
threshold is asserted. Normal CI includes these correctness tests and never the
research matrix.

## Actual verification

All commands below completed with exit code **0**:

| Command                                         | Result                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm.cmd run -w server prisma:generate`         | Generated client current; no DB connection                                                          |
| `npm.cmd run -w server db:validate`             | Valid Prisma schema with explicit disposable local DATABASE_URL/DIRECT_URL                          |
| `npm.cmd run -w web typecheck`                  | Passed                                                                                              |
| `npm.cmd run typecheck`                         | Rules/server/benchmark/web/browser harness passed                                                   |
| `npm.cmd run lint`                              | 0 errors, 0 warnings                                                                                |
| `npm.cmd run test:unit`                         | 14 suite executions passed; final report includes 11 harness tests and 483 frontend tests; 99.81 s  |
| `npm.cmd run test:integration`                  | 41 suite executions passed against disposable local test DB; 193.18 s                               |
| `npm.cmd run test`                              | 41 regression suite executions passed, including replay/snapshots/recovery and transports; 241.44 s |
| `npm.cmd run build`                             | Rules/server/web passed; existing Vite large-chunk advisory remains                                 |
| `npm.cmd run -w server test:benchmark`          | 11/11 passed                                                                                        |
| `npm.cmd run -w server test:benchmark:postgres` | 1/1 passed                                                                                          |

The verification DB was a newly created disposable local Docker PostgreSQL 16
container bound to 127.0.0.1:5433, database `fate_benchmark_test`, never Neon.
Schema validation originally lacked DIRECT_URL in the shell; it passed after
explicitly supplying this disposable URL. Existing production credentials were
not exported or changed, and no production database connection was opened. The disposable container was stopped after verification.
The installed PowerShell `npm.ps1` discarded forwarded CLI flags; commands above
and the documented workflow use `npm.cmd`, with echoed and saved args verified.

Final measured commands, after other verification workloads finished:

```powershell
npm.cmd run benchmark:replay:quick -- --output=bench-results/verification-memory
$env:BENCHMARK_DATABASE_URL = 'postgresql://fate_test:fate_test@127.0.0.1:5433/fate_benchmark_test'
npm.cmd run benchmark:replay:quick -- --storage-backend=postgres --output=bench-results/verification-postgres
npm.cmd run benchmark:replay -- --modes=STANDARD,DRAFT,CLASSIC --actions=1000 --seeds=4 --snapshot-intervals=5,20,100 --targets=0,1,19,20,21,99,100,101,999,1000 --warmup=0 --iterations=1 --output=bench-results/verification-long-all-modes
```

Quick memory completed in **5.60 s**, PostgreSQL quick in **18.92 s** (harness elapsed
time, excludes CLI startup/output writing). Each had 4 scenarios, 5 strategies,
330 scenario/strategy/target groups and **990 raw measured iterations**, all correct
with RNG continuation validated. Non-timing trace identities, logical totals,
snapshot placements and replay counts agreed between backends.
The reduced all-mode long smoke completed in **10.37 s**, reconstructed actual
1,000-action traces in all three modes at ten targets, and passed all strategies.
It deliberately used one repetition and is a correctness smoke, not thesis latency
evidence. Additional generation-only validation reached 1,000 accepted actions for
every seed 1..10 in each mode (30 traces).

Measured environment: Node **v22.14.0**, V8 **12.4.254.21-node.22**, Windows x64,
AMD Ryzen 7 5800HS, 16 logical CPUs, 16,539,385,856 bytes RAM. PostgreSQL reported
**16.15**, x86_64 Linux musl/Alpine build. Base Git commit was
`b8c75495967beab7f526a58472b3b2652f30bc56`, with uncommitted harness changes recorded
as `gitDirty=true`.

Example for the **same STANDARD seed-1, 100-action trace**, reconstructing **R=79**:
latencies are memory-mode per-target statistics from only three repetitions;
physical bytes are from the matching PostgreSQL run, not memory measurements.

| Strategy       | Interval | Logical bytes | Database bytes | Replayed actions | p50 ms | p95 ms | p99 ms |
| -------------- | -------: | ------------: | -------------: | ---------------: | -----: | -----: | -----: |
| Full state     |        — |     1,375,854 |        352,256 |                0 | 0.6591 | 1.0253 | 1.0579 |
| Action log     |        — |        33,410 |        122,880 |               79 | 7.2523 | 9.3832 | 9.5726 |
| Snapshot + log |       10 |       173,656 |        212,992 |                9 | 1.8024 | 2.3691 | 2.4195 |
| Snapshot + log |       20 |       104,362 |        204,800 |               19 | 2.3334 | 4.2460 | 4.4160 |
| Snapshot + log |       50 |        62,634 |        172,032 |               29 | 2.9328 | 3.0028 | 3.0090 |

## Exact retained output paths

All final benchmark artifacts are under `C:\codes\FATE\bench-results\` (gitignored):

- `verification-memory\results.json`, `summary.csv`, `samples.csv`, `result-schema.json`
- `verification-postgres\results.json`, `summary.csv`, `samples.csv`, `result-schema.json`
- `verification-long-all-modes\results.json`, `summary.csv`, `samples.csv`, `result-schema.json`

For every bullet the four filenames are inside that named directory. Normal test
reports are `C:\codes\FATE\test-results\testing\unit.json`, `integration.json`
and `regression.json`. Captured verification logs remain in the gitignored
`C:\codes\FATE\.tmp\benchmark-{unit,integration,regression,build}-verification.log`.
Earlier development smoke/failure artifacts in timestamped `bench-results/replay-*`
and `bench-results/all-modes-development` are not used as final measurements.

## Limits and deliberately deferred work

This measures a documented controlled legal workload and a simple natural bot,
not a population sample of human matches or all hero ability configurations.
Requested sizes are not fabricated when games end. The optional DB adapter stores
text payloads with revision indexes; its physical numbers are not exact production
JSONB/UUID/FK overhead. Small tables, page allocation and automatic TOAST compression
affect physical sizes. No controlled cold-cache, cache flush, GC isolation, concurrent
load, user recovery ownership scan or network/UI benchmark is claimed.

JIT/GC/scheduling/power/background activity remain sources of variation despite
warmup and rotation. The quick presets are correctness checks, not significance
evidence. The full 10-seed/30-repetition research matrix, repeated independent
thesis experiments, statistical inference, plotting, process isolation, resume,
compression experiments and production interval optimization are deliberately
deferred. The documented research commands expose the raw trade-offs needed for
later Python/Excel/R analysis without hardcoded thesis conclusions.
