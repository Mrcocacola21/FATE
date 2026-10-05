# Automated testing expansion: implementation report

## Architecture actually found

The repository already had a custom deterministic rules runner (`ts-node`), server scripts using `tsx` with Node assertions/`node:test`, React component tests using `tsx`/`node:test` and React test renderer, guarded real PostgreSQL/Prisma integration scripts, and feature/browser smoke using **Playwright Core**. No Vitest/Jest migration or second browser framework was needed.

The original root command ran rules, a broad DB-free server regression chain, and selected web suites. Many useful web gameplay/mobile/i18n/effects tests were available only through separate commands. Real DB suites already covered auth, profiles, match persistence, ratings, statistics, leaderboard, replay, admin/audit and recovery, but had no root integration layer. Actual socket suites were mixed into the normal server command. Existing feature browser smoke generally used prepared fixtures or direct store commands; there was no single primary UI registration-to-played-history-to-replay journey.

The original server test script ran `rules build`, which implicitly deleted shared `rules/dist`. This could conflict with build/dev/browser checks. Some legacy suites mixed pure calculation, mocked repository/service tests and Fastify contracts. Environment changes and module/global room stores made parallel execution unsafe without process isolation. Existing matchmaking tests already had an injected clock, and DB safety already rejected hosted targets.

## Preserved coverage and final ownership

**All existing gameplay files and 378 successful gameplay-check output lines are preserved.** A direct before/after comparison found all 378 original lines in the final regression output, with no missing checks. `packages/rules/src/tests` has no diff. Core and hero tests keep their names, fixtures, semantics and runner order. Existing frontend suites also remain intact; all are now included in the unit layer.

| Layer | Command / owner |
| --- | --- |
| Unit | `npm run test:unit`: rules custom runner + boundary check; 8 existing server pure/in-memory domain suites; 6 pure entrypoint files (12 Node cases); all web test files |
| Static/API contract | `npm run test:contract`: generated OpenAPI schema check + 17 existing mixed service/HTTP/security/contract files |
| DB/API integration | `npm run test:integration`: contract coverage + 19 real Prisma/PostgreSQL scripts |
| WebSocket integration | `npm run test:ws`: 8 preserved socket/runtime suites + DB-backed restart/reconnect script + one new focused real-DB transport scenario |
| E2E | `npm run test:e2e`: one two-player browser journey; normal Casual Classic match with seed 37 |
| Default regression | `npm test`: unit + contract + the preserved DB-free socket suites; no PostgreSQL/browser requirement |

`scripts/testLayers.mjs` owns the explicit legacy classifications. New pure tests live in `packages/server/src/tests/unit/`; pure assertions extracted intact from rating/statistics live in `unitCases/` and are called by their original mixed suites too. Deliberate overlap between independently runnable layers does not multiply rating edge cases through API/browser flows.

## Domain, API and persistence coverage

| Area | Coverage retained or added |
| --- | --- |
| Rules | Legal/illegal actions, turn ownership, movement/combat/abilities, pending rolls, modes, hidden state, game-over and deterministic snapshots remain in the original suite |
| RNG / pure transitions | Seeded roll repeatability, exact serialized continuation (including uint32 zero), invalid snapshots, identical actual initiative/rule-choice/placement transitions without GameRoom or sockets |
| Glicko-2 | Existing canonical/full-precision reference, win/loss/draw, independent RD/volatility behavior, inactivity, finite results, invalid input, bounded convergence and input purity extracted into a standalone pure unit |
| Rank | Every exact/fractional tier boundary, rounding across boundaries, Shadow and Destiny special cases, progress/next rating; original API and frontend rank coverage preserved |
| Replay unit | Existing real-rules reconstruction from initial/snapshot/exact revision, gaps/duplicates/corruption, RNG and read-only readers; added format/type/actor/revision validation and terminal revision purity |
| Statistics unit | Existing zero games, win/loss/draw, win rate, null/invalid samples, rounded average turns, streaks, mode grouping/ties and observation eligibility extracted intact |
| Matchmaking unit | Existing injected-clock dynamic ranges, mutual compatibility, candidate fairness, tie selection, idempotency/cancel/concurrency/grace and rollback; new exact expansion/cap boundaries |
| RBAC / errors unit | Pure moderation role matrix, actor block/self restrictions, AppError/fallback shape and safe validation normalization; existing complete HTTP tests remain |
| Auth integration | Real registration/duplicate identity/login/invalid credentials/refresh/logout/session revocation, blocked-account and stale role/block security in the existing auth/admin suites |
| Rating integration | All three modes, Casual exclusion, independent rating/RD/volatility/ratedGames/history, full-precision expected states, atomic rollback, exactly-once processing and shared-player concurrency |
| Manual Rated range | Existing required 1900/1300 Standard rejection and 1450/1500 Draft compatibility; added exact 400 allowance and fractional 400.0001 rejection |
| Match / actions | Parent/participant relationships, identity/mode/classification, accepted/rejected journal behavior, revision uniqueness, retry/idempotency, persistent action history and final results |
| MatchSnapshot | Existing periodic/final checkpoints, format/state/RNG, uniqueness/equivalent duplicate/conflict and latest/at-or-before lookup coverage |
| Persisted replay | Real action/snapshot histories, initial/nearest/target/final reconstruction, gaps/corruption/unsupported formats, read-only transaction checks and unchanged storage |
| Recovery | Actual runtime A disposal and runtime B reconstruction on the same DB, room/match/state/revision/RNG identity, authenticated reservations, revision N+1, repeated recovery, interruption audit and finalization/rating repair |
| Statistics / leaderboard integration | Real completed rows, eligibility/exclusions/nulls/streaks/averages/modes; per-mode qualification/provisional/sorting/ties/pagination/rank/win rate/activity and Casual exclusion |
| Admin / audit | Real API role matrix, current DB role truth/stale tokens, block/unblock, self/target/last-admin restrictions, secret exclusion; transactional moderation/role/recovery events, rollback/retry safety, filtering/pagination and deletion survival |
| API / OpenAPI | Canonical errors and representative validation/malformed body/query/enum/pagination/date checks, controlled 500/privacy behavior, spec generation/refs/operation IDs/auth schemes and safe responses |

Existing integration scripts were reused instead of replacing database boundaries with repository mocks. No production schema or gameplay mechanic was added.

## New transport and browser harnesses

`helpers/wsClient.ts` uses real `ws` connections and registers its frame buffer before open completes. Type/predicate waits consume matching frames, clear stale replies when a new request is sent, reject on error/close and have bounded timeouts. It provides send/wait/close rather than duplicating raw socket parsing. The protocol has no general gameplay request correlation ID, so revision predicates and per-request buffers prevent incidental ordering assumptions.

`realtime.integration.test.ts` verifies normal room creation, persistent P1/P2 identity, spectator non-occupancy and denied gameplay, exact client-specific projections, accepted action revision/journal, rejected stale roll without a journal entry, disconnect/reclaim, third-user seat protection, block/revocation with audit and blocked reconnect, and real matchmaking delivery into one persistent Rated Draft room with reserved seats. A focused transport fixture also broadcasts private/public stake markers and a hidden placement event: P1 sees the private marker/event while P2 and spectators receive only public data. The original journal-backed state is restored before further gameplay. Existing suites retain authenticated guest/spectator, multiple tab, privacy, modes and sandbox coverage. The required WS layer also includes the existing DB restart/reconnect/RNG/finalization scenario.

The primary browser journey performs real registration forms for A/B, sign-out, real login forms and refresh-cookie checks; UI lobby create/join/readiness/start; actual legal deployment/move/attack/pending-roll actions; normal rules victory and both overlays; persistent FINISHED Match/participants/action journal/final snapshot/no Casual rating history; UI result leave/confirmation, Match History, details, Watch Replay, revision navigation and final read-only board/state comparison. It also independently reconstructs final state/RNG from the played match's persisted data.

The bot reads the local authoritative room **only to choose legal commands** and sends each from the appropriate browser's normal store/WebSocket. It does not seed a finished match, edit GameState, use debug/sandbox controls or bypass finalization. Individual board clicks are covered by component tests; the compact browser journey accelerates gameplay through the real client action path. Both browser revisions and the UI's automatic `unitStartTurn` gate each next command.

Fastify/Prisma stay in the test process. `journey-vite.mjs` runs Vite separately, emits an ephemeral-port readiness message and supports shutdown. The parent verifies HTTP readiness, owns two browser contexts and waits for resource disposal. Failure-only screenshots, console summary and Playwright traces are stored in unique run directories; passing runs retain compact JSON. Existing optional feature/visual/true-process-restart browser commands remain available and were not all rerun as part of the baseline layer.

## Safety, fixtures, clocks and races

DB layers guard configuration **before migrations or test writes**. Only loopback PostgreSQL with a distinct `test` database/schema name segment is accepted; missing URLs, production mode, hosted Neon/Render and ambiguous names fail. Actual command invocations with a synthetic Neon-like URL and with no test URL returned exit 1 before migration/client startup. Unit guard cases cover the broader matrix and avoid credential disclosure.

Every DB/WS/E2E run now owns a generated `fate_<layer>_test_<uuid>` schema, deploys all current migrations once, and drops only that validated schema after runtimes exit. The configured schema is never reset. Synthetic fixture IDs remain scoped and cleanup/disconnect remain in `finally`; legacy admin/recovery cleanup now removes owned audit events before deleting parents. Per-run schemas contain anonymous/cancelled match or deletion-surviving audit leftovers from legacy fixture paths. A target-keyed local lock serializes DB layers across local processes; independent CI machines need independent disposable DBs.

Server files run in isolated serial processes, and Node web/pure test files use concurrency 1. This isolates environment/module stores/timer mocks. Existing injectable clocks drive matchmaking and fake time handles JWT/reconnect policy. Socket/DB/browser synchronization waits for messages, revisions, responses or bounded conditions. The legacy disconnect sleep was replaced with its close event; no blind browser startup/gameplay waits or blanket retry policy was added.

Tests resolve rules directly from source through `tsconfig.tests.json`; browser Vite aliases rules to source. Server tests no longer rebuild/clean rules, and normal `rules build` no longer deletes `dist`. `generatePrisma.mjs` reuses a client only when normalized schema and installed Prisma/client versions match, avoiding unnecessary replacement of a Windows-loaded query-engine DLL. A schema/version change still requires stopping the old DB runtime before generation; explicit `--force` is available. Production default seed behavior is unchanged; the sole production testability refactor is an optional `roomSeed` dependency in server/lifecycle, with explicit room seeds taking precedence.

During development, normal UI automatic turn-start revisions and its leave confirmation dialog exposed incorrect initial harness assumptions; the harness now follows those behaviors. Combining Vite/esbuild and loaded Prisma/Fastify in one Windows process produced native startup failures; separating the frontend process addresses that boundary. These were resolved without adding retries. Existing Node mock-timer experimental and Browserslist/build-size notices are infrastructure/tooling notices; lint remains a zero-warning gate.

## Changed files and scripts

- Root `package.json`, rules/server package scripts: independent layers, DB preparation, aggregate typecheck, source-based legacy server tests and cached Prisma generation; existing focused commands retained.
- `scripts/runTests.mjs`, `testLayers.mjs`, `generatePrisma.mjs`, `tsconfig.tests.json`, `tsconfig.smoke.json`: orchestration, ownership, safe migration/schema isolation, reporting, source resolution and typed browser harness verification.
- Server `index.ts` / `persistence/matchLifecycle.ts`: optional deterministic room seed dependency.
- Server `tests/unit/`, `unitCases/`, `helpers/`, `realtime.integration.test.ts`: focused pure tests, extracted calculations, shared fixtures/socket/bot/condition helpers and actual DB transport scenario.
- Existing `rating.test.ts`, `playerStatistics.test.ts`: call preserved extracted pure assertions; `perModeRatings.integration.test.ts`: exact Rated boundary; `admin.integration.test.ts` and `matchRecovery.integration.test.ts`: owned audit cleanup; `ws.smoke.ts`: close-event synchronization.
- Web `scripts/journey-smoke.ts`, `journey-vite.mjs`, `browserModules.d.ts`: single browser journey, isolated frontend process and checked Vite browser-store imports.
- `.env.test.example`, `.gitignore`, README and `docs/testing.md`: safe configuration, developer workflow, troubleshooting and ownership documentation.

No dependency, lockfile, CI workflow, Prisma migration or existing gameplay/component test file was removed. No global coverage percentage gate was introduced: runners have different reporting formats and explicit invariant tests remain the acceptance mechanism. CI pipeline implementation, optional extra Rated/admin browser journeys and mandatory browser process-restart are deliberately deferred; service/WS restart coverage is active and mandatory.

## Verification results

All required commands passed with exit 0. Machine-readable per-layer results live in `test-results/testing/`. Historical custom scripts aggregate assertions, so their individual assertion counts are not invented or added to Node test counts.


| Executed command | Result | Count | Measured runtime |
| --- | --- | --- | --- |
| `npm run test:unit` | PASS, exit 0 | 13 suite/bootstrap executions; 476 Node tests | 95.83 s |
| `npm run test:integration` | PASS, exit 0 | 39 suite/bootstrap executions; 39 Node tests | 179.24 s |
| `npm run test:ws` | PASS, exit 0 | 12 suite/bootstrap executions; 1 Node tests | 52.72 s |
| `npm run test:e2e` | PASS, exit 0 | 3 suite/bootstrap executions | 86.49 s |
| `npm test` | PASS, exit 0 | 39 suite/bootstrap executions; 515 Node tests | 205.97 s |

Unit details: **378 preserved gameplay checks**, one separately run architecture boundary check, **476 Node tests** (463 web + 12 pure cases + one existing admin UI rating case), and seven additional preserved custom server scripts. Integration runs 19 PostgreSQL scripts plus 17 contract files/schema checks and bootstrap. WS runs eight preserved transport suites, one PostgreSQL recovery script and one new DB-backed Node scenario. E2E is **one journey**, not three browser tests: its three executions include client preparation, migrations and the journey. The default root regression includes 515 Node cases plus the preserved custom runners. Counts overlap between independently runnable layers and must not be summed as unique tests.

The isolated-frontend primary E2E passed **twice consecutively**, including a run concurrent with the production build, with seed 37, two UI-created accounts, **710 accepted revisions**, P1 victory and exact final replay/RNG validation. Passing artifacts: `test-results/journey/bf1da0d8/result.json` and `test-results/journey/b16680fc/result.json`. No test retry configuration was added.

Additional commands actually executed successfully:

- `npm run -w server prisma:generate` (fresh generation and current-client reuse checked).
- `npm run -w server db:validate`: schema valid.
- `npm run -w web typecheck`, server typecheck, and final aggregate `npm run typecheck`: rules/server/web/browser harness, zero type errors.
- `npm run lint`: exit 0, **0 errors / 0 warnings**.
- `npm run build`: rules/server/web production build passed; existing Browserslist age and bundle-size notices remain.
- `npm run test:db:prepare`: current migrations applied in guarded local PostgreSQL.
- Hosted/missing DB rejection fixtures: both intentionally exit 1 before migrations; expected safety passes, not skipped suites.
- Original rules runner before changes and direct output comparison against the final root run: **378/378 original check lines present**, no rules test file diff.
- `git diff --check`: no whitespace errors.

The standalone `test:contract` command was not separately invoked; its full contents passed within integration and default regression. Optional old feature/visual/browser process-restart scripts were not rerun or reported as passing. CI jobs, unified percentage coverage and additional mandatory browser journeys are deferred.

Cleanup was verified: zero generated `fate_<layer>_test_<uuid>` schemas after the DB/WS/E2E runs; no test Node/esbuild processes remained (the two pre-existing Node processes were preserved). The disposable local PostgreSQL container created for verification was stopped and automatically removed. Passing browser contexts/backend/frontend/Prisma all exited through owned cleanup. No production/hosted DB or external application service was used.
