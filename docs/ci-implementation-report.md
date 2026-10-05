# CI implementation and verification

Implemented and verified locally on 2026-10-05. See [CI policy and exact local
commands](ci.md) for triggers, environment, stage order and branch protection.

## Repository findings and final changes

The existing `.github/workflows/ci.yml` used Node 22/npm, ran rules/server tests,
only web typecheck and the root build, and ignored audit failures. It omitted lint,
full typecheck, all frontend tests and real PostgreSQL integration. The only other
workflow was `telegram.yml`, a separate notification workflow; it was left intact.
No deployment or duplicate quality workflow was found.

The root uses npm workspaces with lockfile v3. No engines/version file exists;
Node 22 is already documented in README and the production deployment guide.
Both local `origin/HEAD` and remote `git ls-remote --symref origin HEAD` identify
`main` as the default branch. The existing root typecheck covers rules/server/web
and the typed browser harness. Root install's `postinstall` builds rules types;
root build compiles rules before server, then typechecks/builds web.

| File | Final change |
| --- | --- |
| `.github/workflows/ci.yml` | Upgrade the existing workflow to the single mandatory sequential `Quality` job, PostgreSQL service and required E2E; remove ignored audit |
| `package.json` | Add `test:rules`, `test:server`, `test:web`; preserve `test`, `test:unit` and existing DB/WS/E2E commands |
| `scripts/runTests.mjs` | Reuse existing suites through separate layers; reject empty discovery and entirely skipped/zero-pass Node batches |
| `packages/web/scripts/journey-smoke.ts` | Accept locked Playwright-downloaded Chromium as an executable fallback |
| `packages/web/src/statistics/components.test.tsx` | Mock rank API/config and scope the existing no-button assertion to statistics |
| `README.md` | Add CI overview and required-check guidance |
| `docs/testing.md` | Document separate unit commands, browser installation and required CI policy |
| `docs/ci.md` | Document commands, isolation, failure semantics and GitHub protection/CD boundary |
| `docs/ci-implementation-report.md` | Record actual implementation and verification |

No lockfile, migration, application business logic or database guard was changed.
The frontend test fix retains checks that navigation requests Bob's ID and clears
Alice's charts; it stops conflating the independent rank section's buttons/network
responses with the statistics section. Its focused suite passed all 11 tests on
Windows, and the full suite passed on Linux.

## Final workflow behavior

PRs, including forks, and pushes to `main` run `CI` / `Quality`, job ID `verify`.
There are no path filters, tag triggers or optional quality stages. The job runs
serially on Ubuntu with a 30-minute timeout and `contents: read`. Concurrency
cancels superseded PR runs, while main runs queue. Checkout credentials are not
persisted. npm downloads are cached against `package-lock.json`; dependencies and
build outputs are installed/generated fresh.

PostgreSQL 16 has an explicit `pg_isready` health check. `DATABASE_URL`, `DIRECT_URL`
and `TEST_DATABASE_URL` all target loopback `fate_test` with disposable credentials.
Existing guards run before the initial `test:db:prepare` migration deployment and
before each DB layer. Eleven committed migrations apply from zero, followed by
`migrate status`. Integration/WS/E2E retain their unique schema, locking, fixture
ownership and cleanup behavior. There is no hosted DB, seed, reset or admin bootstrap.

Prisma validation/generation, zero-warning lint, all-package typecheck, OpenAPI,
rules, server, frontend, contract/DB integration, realtime/WS, primary E2E and the
full build are mandatory. Integration owns contracts; every web test is discovered,
including i18n/rank assets. Fresh Prisma generation is forced before validation
consumers. The build alone uses `NODE_ENV=production` and loopback public Vite URLs;
tests use `NODE_ENV=test` and disposable distinct JWT keys. No production secrets
are required. No test/build commands run concurrently over shared `dist`.

The required browser journey uses locked Playwright Core/Chromium, real two-player
accounts, normal legal actions and normal match completion/history/replay. Extra
feature/visual/admin browser scripts remain optional local commands. Browser
startup is readiness-based; no global retries were added. Failure diagnostics are
uploaded only on failure, retained seven days. Required commands have no failure
masking or `continue-on-error`.

## Actual local verification

All CI commands were exercised in disposable Linux containers using Node **22.23.3**,
npm **10.9.9**, and a fresh **PostgreSQL 16.15** service. The source copy excluded
local `node_modules`, `dist`, `.env` files and test outputs. Windows dependencies
and build artifacts were not reused. The final production-environment root build
also passed in a separate isolated filesystem with the final source changes.

| Command/check | Actual result |
| --- | --- |
| `npm ci --include=dev --no-audit` | Exit 0; locked install and existing postinstall passed |
| `npm run -w server db:validate` | Exit 0; Prisma schema valid |
| `npm run -w server prisma:generate -- --force` | Exit 0; fresh client generated |
| `npm run lint` | Exit 0; 0 errors, 0 warnings |
| `npm run typecheck` | Exit 0; rules, server, web and browser harness passed |
| `npm run -w server openapi:validate` | Exit 0; committed response schemas match; valid OpenAPI 3.0.3 with 43 operations |
| `npm run test:rules` | Exit 0; gameplay and architecture passed; 379 reported legacy checks |
| `npm run test:server` | Exit 0; all existing in-memory suites plus pure units; 13 native TAP tests and legacy assertions |
| `npm run test:web` | Exit 0; 463 tests passed, 0 failed, 0 skipped |
| `npm run test:db:prepare` | Exit 0; all 11 migrations applied to the empty service DB |
| `npm run -w server db:migrate:status` | Exit 0; schema up to date |
| `npm run test:integration` | Exit 0; 39 process executions including bootstrap, contract and DB suites |
| `npm run test:ws` | Exit 0; 12 process executions including bootstrap, legacy WS and two DB/WS suites |
| `npm exec -w web -- playwright-core install --with-deps chromium` | Exit 0; locked browser and Linux dependencies installed |
| `npm run test:e2e` | Exit 0 in about 60 seconds; two accounts, seed 37, Casual Classic, final revision 710, normal finish and exact replay verified |
| `NODE_ENV=production npm run build` with public loopback Vite URLs | Exit 0; rules, server and production web build passed |
| `npm test` | Exit 0; 39 process executions, 515 native TAP tests plus 379 reported legacy checks; DB-free default preserved |
| `actionlint` 1.7.12 on the final CI workflow | Exit 0; no diagnostics |
| YAML parse, `node --check scripts/runTests.mjs`, `git diff --check` | Passed |

Process counts include generation/migration/schema-check setup invocations, not
invented individual test counts. Legacy runners contain additional assertions
without TAP totals. Raw logs, suite JSON and the compact journey result are retained
locally under ignored `test-results/ci-local/`. Test containers and their disposable
DB volumes, plus the task-specific temporary image, were removed after verification.

An initial full frontend run correctly failed and stopped the local pipeline on
the existing public-statistics assertion (462/463 passed). After the fixture/scope
fix, the full frontend and default regression runs passed. Six additional fault
checks in an isolated filesystem confirmed these failures propagate:

| Intentional failure | Observed exit |
| --- | --- |
| No frontend test files discovered | 1 |
| All discovered Node tests skipped | 1 |
| A focused passing test beside a failing sibling | 1; the sibling still executed |
| Missing `TEST_DATABASE_URL` for integration | 1; no green skip or migration |
| Injected TypeScript assignment error | 2 from root typecheck |
| Same injected error during root build | 2 from root build |

The injected files/failures existed only in a disposable copy. Production builds
still emit the existing Vite CJS deprecation, old Browserslist data and large-chunk
warnings; these are separate from the zero-warning ESLint gate. Dependency updates
and bundle optimization were not added to this correctness-CI change.

## External settings and limits

No GitHub Actions run of these changes was observed, and no commit/push was made.
Local verification does not claim a successful hosted run, artifact upload or npm
cache restore. GitHub protection settings and external Render/Vercel deployment
settings were not changed or verified.

Require the **Quality** check from **CI** in the `main` protection/ruleset before
merge, replacing an old required `verify` check if present. Restrict direct pushes
and bypasses as appropriate. With that setting, a failed mandatory stage prevents
merge; this workflow itself already fails on any such stage. CD, provider auto-deploy
sequencing, production migrations and production smoke testing remain separate work.
