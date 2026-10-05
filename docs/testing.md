# Testing FATE

FATE keeps its deterministic gameplay runner and existing test files. Layers have separate commands; a browser journey does not substitute for rules, rating calculations, or persistence assertions.

| Command | Ownership | Database / sockets / browser |
| --- | --- | --- |
| `npm run test:unit` | All existing rules gameplay and architecture checks, server pure helpers and in-memory domain/service tests, every web `.test.ts(x)` | No DB, listening server, or browser |
| `npm run test:rules` | Rules gameplay and architecture checks | No DB or browser |
| `npm run test:server` | Server pure helpers and in-memory unit suites | No DB or browser |
| `npm run test:web` | Every web `.test.ts(x)` | No DB or browser |
| `npm run test:contract` | Existing Fastify inject/API/security/OpenAPI and mixed legacy service suites | No DB; local process startup checks for deployment |
| `npm run test:integration` | Contract suites + real PostgreSQL repository/service/API suites | Guarded local PostgreSQL |
| `npm run test:ws` | Existing live WebSocket regressions + PostgreSQL lifecycle and restart/reconnect suites | Guarded local PostgreSQL, real ephemeral-port servers/sockets |
| `npm run test:e2e` | One real two-player register → login → create/join → play → normal finish → history → replay journey | Guarded local PostgreSQL, Fastify, Vite, installed Chromium |
| `npm test` | Unit + contract + existing DB-free WebSocket regression suites | No DB or browser required; preserves the previous default workflow |
| `npm run test:db:prepare` | Prisma generation and current migration deployment only | Guarded local PostgreSQL |

The default command deliberately stays DB-free. Before a major merge, run `npm test`, `npm run test:integration`, `npm run test:ws`, and `npm run test:e2e`. During rules/UI work use `test:unit`; during API work use `test:contract`; use the DB and WS layers when changing those boundaries. `npm run typecheck` checks rules, server, web and the new typed browser harness; also run `npm run lint` and `npm run build` as normal.

## Runners and directories

- `packages/rules/src/tests/index.ts`: historical custom TypeScript runner, `core/`, `heroes/`, and shared deterministic fixtures. No existing gameplay file was deleted, renamed, or rewritten.
- `packages/server/src/tests/unit/`: `node:test` entrypoints for Glicko-2, statistics, rank precision/progress, seeded RNG/domain transitions, replay format/revision, matchmaking configuration, RBAC, validation/errors and DB guard.
- `packages/server/src/tests/unitCases/`: pure assertions extracted intact from the mixed rating/statistics suites. Those legacy commands still call the same assertions.
- `packages/server/src/tests/*.test.ts`: preserved suites. `scripts/testLayers.mjs` explicitly assigns their ownership, including legacy mixed tests in the contract layer rather than calling them pure units.
- `packages/server/src/tests/*.integration.test.ts`: existing real Prisma suites discovered automatically. The two WS/DB suites (`matchRecovery` and `realtime`) run under `test:ws`.
- `packages/server/src/tests/helpers/`: real DB fixture ownership, buffered event-based WebSocket client, and legal action selection for smoke gameplay.
- `packages/web/src/**/*.test.ts(x)`: Node test runner with `tsx`, React test renderer and focused semantic assertions. The new root unit command discovers all files, including gameplay/mobile/i18n/effects suites previously omitted by the root command.
- `packages/web/scripts/journey-smoke.ts`: Playwright Core journey. Earlier feature/visual smoke scripts remain available through their original workspace commands; they are optional and are not all run by the compact E2E layer.
- `packages/web/scripts/journey-vite.mjs`: separately managed Vite process with an explicit ephemeral-port readiness message. This avoids mixing Vite/esbuild with loaded Prisma/Fastify native libraries in one Windows process.
- `scripts/runTests.mjs`: cross-platform serial orchestration and migration bootstrap. Child-process environment changes do not affect the shell or other suites. Results with suite exit codes, times and available TAP counts go to `test-results/testing/<layer>.json`.

No new test framework or product migration was added. Rules use their existing custom runner; server/web use `tsx` and Node assertions/`node:test`; browser smoke uses the existing Playwright Core dependency.

## Local PostgreSQL and safety

Install dependencies with `npm ci`. Prisma client generation is checked automatically by layered commands; it opens no DB connection. One local option, compatible with PowerShell:

```powershell
docker run --detach --rm --name fate-test-postgres --publish 127.0.0.1:5433:5432 --env POSTGRES_DB=fate_test --env POSTGRES_USER=fate_test --env POSTGRES_PASSWORD=local_test_password postgres:16-alpine
$env:TEST_DATABASE_URL = 'postgresql://fate_test:local_test_password@127.0.0.1:5433/fate_test'
npm run test:db:prepare
npm run test:integration
npm run test:ws
npm run test:e2e
docker stop fate-test-postgres
```

Wait for PostgreSQL to accept connections (`docker exec fate-test-postgres pg_isready -U fate_test -d fate_test`) before preparing/running. Do not reuse an application database. `.env.test.example` documents placeholders; the runner requires the variable in the shell and does not load a production `.env`.

Every DB layer invokes `scripts/testDatabase.cjs` **before migrations, clients or test writes**. It rejects `NODE_ENV=production`, missing/invalid URLs, non-PostgreSQL protocols, any host except `localhost`, `127.0.0.1`, or `[::1]`, and targets without a distinct `test` segment in the database or schema name. `contest`/`latest` do not qualify. Hosted Neon/Render databases are always rejected, even if their database/schema is named `test`. Errors do not echo connection credentials. Pure unit guard tests exercise these rejections without opening a connection.

The orchestrator creates a unique `fate_<layer>_test_<uuid>` schema for each integration/WS/E2E run and points `TEST_DATABASE_URL`, `DATABASE_URL` and `DIRECT_URL` at it in child environments. Prisma applies current checked-in migrations once per layer with `prisma migrate deploy`; the configured database/schema is never reset, and `db push` is never used. At shutdown, the runner validates its generated schema name and drops **only that run-owned schema** after child runtimes exit. This also contains legacy fixture leaks (for example an anonymous cancelled room or deletion-surviving audit event) without deleting unrelated data. Existing migration regression tests create/drop their own generated test schema. `test:db:prepare` intentionally deploys to the configured test target and retains it. There are no test-support product migrations.

The guard permits a test schema on a local DB, but a **dedicated test database is preferred**. Fixture suites own synthetic accounts and match IDs, delete their own rows in `finally`, and disconnect clients. Existing integration fixtures remain intact. Do not run an application or optional legacy smoke harness against this database during the layered runs: restart recovery intentionally scans unfinished matches.

## Isolation, time and shutdown

Server suites run in individual processes, serially. Node test files also run with concurrency 1. This avoids leaking module stores, timer mocks or `process.env` mutations between files. DB layers acquire a local filesystem lock keyed by host/port/database/schema, regardless of credentials. Different layers cannot concurrently use the same target. The lock does not coordinate different machines; CI should allocate one disposable DB per job.

Normal release removes the run schema and lock. If a process crashes, the command fails clearly on the next attempt. Check for a live test process before removing an abandoned `fate-tests-*.lock` directory from the OS temp directory; remove only the abandoned generated test schema if schema cleanup was also interrupted.

Rules resolve from source through `tsconfig.tests.json`; tests do not clean/build `rules/dist`. The explicit `rules clean` command remains, but `rules build` now compiles without deleting the shared output directory. E2E Vite also aliases rules to source. This removes the prior server-test/rules-build deletion race and stale build dependency. Production build still uses the regular package output.

`scripts/generatePrisma.mjs` compares the generated schema (ignoring formatting/comments while preserving quoted values) and installed Prisma/client versions. An up-to-date client is reused, avoiding Windows DLL replacement while a DB suite runs. If the schema or Prisma version changed, stop old DB runtimes before regenerating. `npm run -w server prisma:generate -- --force` explicitly regenerates. Existing admin/recovery fixture cleanup also deletes its own audit events before parent records, so deletion-surviving audit history cannot accumulate from those tests.

Matchmaking tests already inject a clock and drive ticks directly: dynamic range expansion, mutual `min(A.range, B.range)` compatibility, candidate selection, duplicate joins, cancel and disconnect grace do not wait for real expansion intervals. JWT expiration and reconnect grace in existing tests use their controlled clocks/timers. Network waits are bounded by a message predicate, revision, response or DB condition, not a fixed delay. Short polling in older harnesses checks a condition with a deadline; it is not a sleep asserting that work must be done. The legacy WS smoke's fixed disconnect delay was replaced with the close event.

`helpers/wsClient.ts` buffers frames before connection-open resolves, waits by type/predicate, consumes matching frames and clears stale replies at each sent request (the protocol has no general action request ID). It rejects pending waits on close/error and terminates a socket if graceful close exceeds its deadline. Assertions compare actual P1/P2/spectator projections with domain projection functions.

All live server listeners use ephemeral ports. Browser contexts, tracing, Vite, Fastify, timers, WebSockets and Prisma close in `finally`. The runner bounds each child execution so an open handle fails the command instead of hanging indefinitely. Windows timeout/interruption kills the child's process tree with hidden `taskkill`.

The browser harness keeps backend/Prisma in its own test process and starts Vite in a separate Node process. It waits for the frontend's explicit readiness message and HTTP response. Shutdown waits for that process to exit; on Windows it closes the owned process tree with hidden `taskkill`. This addresses native Windows startup crashes observed with the combined in-process Vite/Prisma harness, without adding test retries.

## Primary E2E journey

The baseline is one **Casual Classic match with seed 37**, two isolated browser contexts and real accounts:

1. Both users register through forms, sign out through the account menu, then log in through forms. The test verifies real HttpOnly refresh cookies.
2. P1 creates a named Classic Casual lobby through the UI. P2 joins through the room-browser card and dialog. Both displayed identities and persistent participant seats are checked.
3. Both ready through the UI, and the host starts through the UI.
4. A legal cooperative bot deploys pieces, resolves initiative/combat rolls, moves and attacks. It reads the local authoritative room only to choose legal actions, then sends each command from the appropriate **browser's normal client store over its actual WebSocket**. It never writes the room state, seeds a finished match, uses sandbox/debug commands or calls a shortcut finalization route. Both client revision acknowledgements gate each next command.

The revision barrier accounts for the UI's existing automatic `unitStartTurn`, so a placement/end-turn command can legitimately advance more than one revision. The bot waits for the active turn and confirms its own command's journal entry instead of racing that automation. Leaving the result UI accepts the normal confirmation dialog before checking history navigation.
5. Actual rules victory displays both game-over overlays. The test verifies FINISHED Match, participants/outcomes, full action journal, final MatchSnapshot and no Casual rating history.
6. P1 leaves through the result UI, opens Match History, opens the newly played match's details and follows Watch Replay. It navigates to revision 1 and the end, checks the board is read-only, compares the final replay response exactly with the played game's replay projection, and independently validates final state/RNG determinism from persistence.

The only production testability change is an optional server/lifecycle `roomSeed` dependency; default room seed behavior is unchanged and explicit room seeds retain precedence. No production raw-state endpoint is added. Gameplay commands use normal protocol/rules behavior; the bot accelerates controls through the client store rather than clicking every move/attack button. Existing component suites cover those controls.

Chromium is required. Windows Edge/Chrome, common Linux Chromium paths, macOS Chrome and the locked Playwright-downloaded Chromium are detected; otherwise set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Install the latter with `npm exec -w web -- playwright-core install --with-deps chromium` (system dependency installation on Linux needs elevated privileges). The tests themselves do not download browsers or use external application endpoints. Each browser run owns `test-results/journey/<run-id>/`. On failure, inspect its `failure.log`, per-player PNGs and Playwright trace ZIPs. Passing runs retain only compact `result.json`, whose location is printed. Readiness uses `/ready` and Vite's listening server, with no startup sleeps.

## Coverage boundaries and troubleshooting

| Critical behavior | Primary owner |
| --- | --- |
| Gameplay, abilities, legal/illegal transitions, mode differences, pending rolls, victory | Existing rules suite |
| Glicko reference/invalid input/convergence, rank floating boundaries/progress, RNG continuation, statistics math, replay reconstruction/format | Unit |
| Auth/session invalidation, per-mode rating isolation/concurrency/exactly-once, leaderboard, journal/checkpoints, replay read-only, statistics, RBAC/audit transactions | PostgreSQL integration |
| Canonical error/validation, OpenAPI references/operation IDs/secrets | Contract + representative real DB API integration |
| Seats, reconnect/security, projection, durable actions, block/revocation, matchmaking room handoff, restart and RNG continuation | WebSocket + real DB recovery |
| Real registration/login/lobby/play/finish/history/replay | One browser journey |

An absent/unsafe `TEST_DATABASE_URL` is an error, never a green skip. A connection failure usually means local PostgreSQL is stopped or the port differs. Schema errors mean preparation/migrations failed; do not manually patch test tables. Missing `rules/dist` is irrelevant to layered tests, but ordinary dev/browser scripts using the normal package entrypoint still require the existing rules build.

When investigating a failure, first rerun the owning layer or its individual existing workspace command. Do not add blanket retries. Keep new scenarios at the narrowest layer that owns the invariant. TAP counts represent individual Node tests; historical custom runners group multiple assertions and must be reported as checks/suite executions rather than invented test counts.

The [CI workflow](ci.md) requires all layers, including the primary browser journey, on PRs and main. Existing runners do not share an instrumentation/reporting format, so no arbitrary global coverage gate was introduced. Full browser process-restart smoke remains an optional legacy command (`npm run -w web test:recovery:e2e`); the required WS layer already disposes/rebuilds actual runtimes on the same DB and verifies seat reclaim, revision N+1 and RNG continuation. Extra Rated/admin browser smoke is optional because its deep invariants are already covered in integration/component tests.
