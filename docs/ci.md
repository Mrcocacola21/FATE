# Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to the default
branch, `main`, including forks. It has no tag trigger or path filters and performs
no deployment. One sequential job, `Quality` (ID `verify`), runs on `ubuntu-latest`
with a 30-minute timeout. Every validation, test and build step is required;
an unsuccessful command stops the job and fails the workflow.

## Required stages and local equivalents

Run these from the repository root in order. First configure a **disposable local
test database** as described in [the testing guide](testing.md), with `NODE_ENV=test`
and `DATABASE_URL` / `DIRECT_URL` pointing to the same target as `TEST_DATABASE_URL`.

| Stage | Command |
| --- | --- |
| Locked install, including development tools | `npm ci --include=dev --no-audit` |
| Prisma schema validation | `npm run -w server db:validate` |
| Fresh Prisma client generation | `npm run -w server prisma:generate -- --force` |
| Lint, zero errors and warnings | `npm run lint` |
| Rules, server, web and typed browser harness | `npm run typecheck` |
| OpenAPI and committed response-schema consistency | `npm run -w server openapi:validate` |
| Rules gameplay and architecture boundaries | `npm run test:rules` |
| Server pure and in-memory unit suites | `npm run test:server` |
| All web components/helpers, including i18n and rank assets | `npm run test:web` |
| Guarded migration deployment to the empty test DB | `npm run test:db:prepare` |
| Applied migration status | `npm run -w server db:migrate:status` |
| Server contracts and real persistence/API suites | `npm run test:integration` |
| Live WebSocket and persisted restart/reconnect | `npm run test:ws` |
| Browser installation from locked Playwright Core | `npm exec -w web -- playwright-core install --with-deps chromium` |
| Primary two-player browser journey | `npm run test:e2e` |
| Production compilation of rules, server and web | `npm run build` |

Install's existing `postinstall` builds rules declarations before dependent
server/web typechecking. The root build orders rules before server, then typechecks
and builds web. Only the final build sets `NODE_ENV=production`, with public loopback `VITE_API_URL` and `VITE_WS_URL`
placeholders; it does not start the production server. Build/test commands run
serially, and no `dist`, generated client or `node_modules` cache is restored.

`npm run test:unit` still combines rules, server and frontend units. `npm test`
still runs DB-free units, contracts and legacy WebSocket regressions. The new commands
expose those same unit suites separately for useful CI step names. Integration
continues to include contracts, so CI does not run a redundant contract step.

## Runtime, cache and database

Node **22** follows the existing README, previous CI and production deployment guide;
this change does not upgrade the application runtime. The repository uses npm
workspaces and root `package-lock.json` (lockfile v3), without an engines field,
`.nvmrc` or `.node-version`. `actions/setup-node` caches only npm downloads, keyed by
the lockfile. `npm ci` fails on dependency/lockfile disagreement and never falls
back to `npm install`. There is no audit/repair or new formatter gate.

The job creates a fresh `postgres:16` service with database/user/password `fate_test`,
published on port 5432. `pg_isready -U fate_test -d fate_test` runs every five seconds,
with a five-second timeout and ten attempts. GitHub waits for health before steps.
This matches the PostgreSQL 16 development/test architecture without using its
persistent Compose volume.

All three database variables use this workflow-local disposable URL:

```text
postgresql://fate_test:fate_test@127.0.0.1:5432/fate_test
```

`test:db:prepare` checks the existing loopback/test-name/production-mode guard before
running `prisma migrate deploy` against the empty service. Integration, WS and E2E
each acquire the existing test-target lock, create a unique run-owned schema, apply
the full committed migration chain and clean up only that schema. Migration errors
fail the command. There is no reset, `db push`, `migrate dev`, seed or admin bootstrap.
The DB guard is unchanged and always rejects hosted Neon/Render hosts. Tests own
their fixtures.

Disposable, distinct JWT keys longer than 32 bytes are defined directly in the job.
Core CI requires no repository secrets, production/personal database, production
origin or deployment account. Tests configure origins and ephemeral server ports
themselves; browser readiness uses `/ready` and Vite readiness.

## E2E and failure handling

The primary E2E journey is **required** on PRs and main: both players register/log in,
create/join a Casual Classic lobby, play legal actions through real browser
WebSockets, finish normally, and verify history and replay. The existing seeded
journey has a five-minute child timeout. Chromium comes from the installed, locked
`playwright-core` CLI; the harness accepts its downloaded executable as a fallback
to an explicit path or system browser. There is no unpinned browser CLI download,
browser cache, retry or homepage-only replacement.

Extra feature/visual/admin/ratings browser scripts remain optional local commands;
their API/component/persistence coverage stays mandatory. No arbitrary coverage
percentage or external reporting service is introduced.

The orchestrator propagates nonzero and signalled child exits. Discovery rejects
empty server-unit, frontend and DB-integration lists, and Node test batches must emit
a nonzero TAP test and passing-test count; entirely skipped batches fail, while
individual intentional skips remain visible and permitted. Node's runner is invoked without `--test-only`, so focused
tests cannot exclude the rest. Historical gameplay runners report checks rather
than invented individual test counts.

Required steps use normal success conditions, without `continue-on-error`, `|| true`
or unconditional success wrappers. On failure only, artifact upload retains suite
JSON reports and available browser logs/screenshots/traces for seven days. Missing
diagnostics do not alter the original failed check.

Concurrency groups by workflow/ref. New PR commits cancel superseded PR runs;
main pushes queue instead of cancelling an active main run. Token permissions are
`contents: read`; checkout does not persist Git credentials.

## Required checks and deployment boundary

In GitHub protection/rulesets for `main`, require the **Quality** check from the
**CI** workflow (shown as **CI / Quality** in the workflow UI) before merge. Replace
an older required `verify` check if configured. Require an up-to-date branch and
restrict direct pushes/bypasses as appropriate. Branch protection lives in GitHub
settings; editing this workflow does not enable it.

The old CI workflow was upgraded in place; no duplicate was added. Its permissive
audit step was removed. `.github/workflows/telegram.yml` remains a separate push
notification workflow. Its existing shell fallback commands do not mask this CI's
checks. No deployment workflow was found. Render/Vercel automatic deployment
settings are external; deployment sequencing and credentials remain CD work.

The official actions use published stable majors: [checkout](https://github.com/actions/checkout),
[setup-node](https://github.com/actions/setup-node) and
[upload-artifact](https://github.com/actions/upload-artifact).
