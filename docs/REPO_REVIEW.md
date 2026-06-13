# FATE Repo Review

Date: 2026-06-12

Scope: `packages/rules`, `packages/server`, `packages/web`, root scripts, tests, build gates, and deploy/CI surface.

## Summary

FATE has the right ownership split: `packages/rules` owns deterministic game rules and projections, `packages/server` owns authoritative rooms/RNG/seats/WS delivery, and `packages/web` remains a thin client. The largest risks were not core gameplay rewrites; they were missing gates and unsafe edges around debug endpoints, event delivery, pending roll dispatch, and in-memory bounds.

Baseline results before changes:

- `npm run -w rules test`: failed immediately in `packages/rules/src/tests/simpleTests.ts` boundary checks, hiding the gameplay suite.
- `npm run -w server test`: passed.
- `npm run build`: passed.
- `npx tsc -p packages/web/tsconfig.json --noEmit`: failed with web TS errors.

## Architecture

- `packages/rules`
  - Deterministic state transition engine.
  - Entrypoints: `packages/rules/src/index.ts`, `packages/rules/src/actions/registry.ts`, `packages/rules/src/pendingRoll/resolvePendingRoll`.
  - Owns `GameState`, `GameAction`, `GameEvent`, pending rolls, hero logic, legal actions, and player/spectator projections.
- `packages/server`
  - Fastify plus `ws` authority for rooms, seats, reconnect tokens, server-side RNG, command serialization, and logs.
  - Key files: `packages/server/src/routes.ts`, `packages/server/src/ws.ts`, `packages/server/src/store.ts`, `packages/server/src/origin.ts`.
- `packages/web`
  - Vite React client that renders `PlayerView` and sends intents over WS.
  - Key files: `packages/web/src/store.ts`, `packages/web/src/ws.ts`, `packages/web/src/game`, `packages/web/src/components`.

## Invariants To Preserve

- Rules stay deterministic; randomness enters through injected RNG only.
- Server remains authoritative for room state, seats, revisions, and RNG.
- Clients send intents, not state patches.
- `pendingRoll` blocks regular actions until resolved by the owning player.
- WS event type strings remain stable.
- Player views and event streams must not leak hidden/private information.
- Rejected commands must not advance revision or append action logs.

## Improvements Implemented

- Split rules boundary checks from gameplay tests:
  - `packages/rules/package.json`
  - `packages/rules/src/tests/simpleTests.ts`
  - Root `package.json`
- Added web typecheck gate and fixed TS errors:
  - `packages/web/package.json`
  - `package.json`
  - `packages/web/src/components/Board.tsx`
  - `packages/web/src/components/EventLog.tsx`
  - `packages/web/src/components/RulesModal.tsx`
  - `packages/web/src/game/components/BoardStage.tsx`
  - `packages/web/src/game/components/RightPanel`
  - `packages/web/src/game/gameshell-content/hooks/useGameShellCombatTargets.ts`
- Prevented unknown `pendingRoll.kind` from clearing the pending roll:
  - `packages/rules/src/model/roll.ts`
  - `packages/rules/src/model/events/core.ts`
  - `packages/rules/src/pendingRoll/resolvePendingRoll`
- Moved event projection into rules and made sensitive delivery default-safe:
  - `packages/rules/src/view/events.ts`
  - `packages/server/src/ws.ts`
  - `packages/server/src/routes.ts`
- Hardened debug REST endpoints in production:
  - `packages/server/src/routes.ts`
  - `README.md`
- Added explicit WS Origin validation with the same allowlist as CORS:
  - `packages/server/src/origin.ts`
  - `packages/server/src/index.ts`
  - `packages/server/src/ws.ts`
- Added bounded in-memory cleanup and log truncation:
  - `packages/server/src/store.ts`
- Added tests for the above:
  - `packages/rules/src/tests/simpleTests.ts`
  - `packages/server/src/tests/ws.smoke.ts`
  - `packages/server/src/tests/hardening.test.ts`
- Added CI:
  - `.github/workflows/ci.yml`

## Risks And Priorities

### Now

- Keep the full rules gameplay suite visible in `npm run -w rules test`.
- Keep boundary enforcement in `npm run -w rules test:boundaries`.
- Keep `npm run build` type-checking web before bundling.
- Keep production debug REST protected by `FATE_DEBUG_TOKEN`.
- Keep WS event projection near view projection in rules.

Acceptance:

- `npm run -w rules test` runs the gameplay suite and passes.
- `npm run -w rules test:boundaries` passes.
- `npm run -w server test` passes.
- `npm run -w web typecheck` passes.
- `npm run build` passes.

### Next

- Replace implicit rules rejection (`same state + no events`) with explicit accepted/rejected results.
- Add seat-scoped REST auth if REST actions/views are needed outside development.
- Add persistence-backed room storage and durable action logs.
- Expand event projection tests for each hidden-info hero flow: Chikatilo false trail, Vlad stakes, stealth search, AoE reveal chains, and private choice rolls.
- Split `packages/server/src/ws.ts` into protocol parsing, room membership, command application, and projection delivery modules.

Acceptance:

- Rejections carry stable codes from rules to server.
- REST can authenticate a specific seat without trusting `?playerId=`.
- Event projection tests cover owner, opponent, and spectator for each private flow.

### Later

- Replace in-memory cleanup with persistence plus resumable room snapshots.
- Add admin/debug tooling that reads filtered logs through authenticated endpoints.
- Consolidate hero metadata across rules, web catalogs, assets, and docs.
- Add load tests for `MAX_ROOMS`, `MAX_LOG_EVENTS`, reconnect grace, and WS rate limits.

## Notes

The safe changes intentionally avoid gameplay/protocol rewrites. The only gameplay-suite edits were test-gate and stale-test corrections that became visible once the full suite ran: synthetic Undyne follow-up states needed to reset both `turn` and legacy `has*ThisTurn` flags, and one Direction Shift assertion described behavior that is not currently implemented.
