# FATE Monorepo Review

Date: 2026-06-09

Scope: `packages/rules`, `packages/server`, `packages/web`, root scripts, deploy docs, test and build commands. This is review-only; no runtime source files were changed.

## Executive Summary

- The architecture has the right core shape: deterministic rules engine, authoritative server RNG/state, and a thin WS-driven client.
- The strongest invariant is `pendingRoll`: rules block non-roll actions while a roll is pending, and the WS path also blocks them.
- `npm run -w rules test` is currently red at the first architectural boundary test, so the 16k-line rules suite is not actually being exercised by the default test command.
- `npm run -w server test` passes and covers useful hardening: view masking, WS smoke, reconnect grace, queue serialization, rejected action log invariants, rate limiting, and payload cap headroom.
- `npm run build` passes, but web build does not type-check. A separate `npx tsc -p packages/web/tsconfig.json --noEmit` fails with multiple TS errors.
- The highest correctness risk is implicit rules rejection: server infers rejection from "same state and no events", which is brittle for valid no-ops and silent failures.
- `applyResolvePendingRoll` clears unknown pending roll kinds by default, which can mask missing resolver coverage and unblock play incorrectly.
- The REST API is a major cheat/debug surface: player identity is query-string based and action logs are publicly readable by room id.
- WS event filtering is default-allow and only special-cases a couple of private event types. Player views are masked, but event payloads can still leak hidden information.
- Room, log, seat, and timer state are in memory with no room TTL, persistence, or cleanup strategy.
- Server WS handling is functionally rich but oversized: FATE room protocol, Pong protocol, role management, reconnect, rate limiting, action application, projections, and logging live in one 1,467-line file.
- Hero and UI metadata are duplicated across rules hero definitions, hero meta registry, web figure catalog, asset registry, and `rulesHints.ts`, creating drift risk.
- Production dependency audit is red: `fast-uri` high severity through Fastify's schema stack, `ajv` moderate, and `ws` moderate.
- There is no CI workflow for build/test/typecheck/audit; `.github` only sends Telegram notifications.
- Best next direction: make command outcomes explicit, lock down debug REST/log access, add web type-check to CI/build, and split server WS into protocol/room/command/projection layers.

## Architecture Map

### Packages

- `packages/rules`
  - Pure-ish deterministic game engine. Inputs are `GameState`, `GameAction`, and an `RNG`; output is `{ state, events }`.
  - Entrypoints: `packages/rules/src/index.ts`, `model.ts`, `actions.ts`, `actions/registry.ts`.
  - Owns game model, turn economy, movement, combat, pending rolls, abilities, hero-specific behavior, visibility, and player/spectator projection.

- `packages/server`
  - Fastify HTTP and WebSocket server.
  - Owns room lifecycle, seats, role switching, reconnect grace, server-side `SeededRNG`, action log, rate limiting, payload cap, and per-socket projections.
  - Main paths: `src/index.ts`, `src/routes.ts`, `src/ws.ts`, `src/store.ts`, `src/schemas.ts`, `src/permissions.ts`, `src/roomQueue.ts`.

- `packages/web`
  - Vite/React/Zustand UI.
  - Thin client sends intents over WS, renders `PlayerView`, stores local figure set preferences, and displays pending roll/board prompts.
  - Main paths: `src/store.ts`, `src/ws.ts`, `src/components/Lobby.tsx`, `src/game/GameShellContent.tsx`, `src/game/components/RightPanel`, `src/components/Board.tsx`, `src/pages/FigureSetPage.tsx`.

### Data Flow

1. Client joins a room over `/ws` using `joinRoom`.
2. Server creates or finds `GameRoom`, assigns role/seat, stores `connId` and `resumeToken`, then broadcasts `roomState`.
3. Client sends intents: `setReady`, `startGame`, `resolvePendingRoll`, `requestMoveOptions`, or generic `action`.
4. Server validates schema, rate, seat, pending roll, and player permission.
5. Server calls `applyGameAction(room, action, playerId)`.
6. `store.applyGameAction` calls rules `applyAction(state, action, room.rng)`.
7. Server increments revision/log only on accepted result, then broadcasts:
   - per-recipient `roomState` using `makePlayerView` or `makeSpectatorView`
   - `actionResult` events, with limited event filtering
8. Client replaces state from `roomState`, appends accepted events by `logIndex`, and renders controls from the current `PlayerView`.

### WS Protocol Flow

- Client to server:
  - `joinRoom`, `switchRole`, `leaveRoom`
  - `setReady`, `startGame`
  - `resolvePendingRoll`
  - `requestMoveOptions`
  - `action`
  - Pong messages also share `/ws`: `pongJoin`, `pongInput`, `pongStart`, `pongReset`

- Server to client:
  - `joinAck`, `joinRejected`, `leftRoom`
  - `roomState`
  - `actionResult`
  - `moveOptions`
  - `error`

### PendingRoll Flow

1. Rules request rolls via `requestRoll` in `packages/rules/src/core/rolls/rollUtils.ts:11`.
2. `requestRoll` creates `roll-N`, stores `{ id, player, kind, context }`, and emits `rollRequested`.
3. Rules registry blocks all non-`resolvePendingRoll` actions while `state.pendingRoll` exists at `packages/rules/src/actions/registry.ts:24`.
4. Server WS action path also blocks non-roll actions at `packages/server/src/ws.ts:673`.
5. Server sends full pending roll only to the owning player via `makePlayerView`; other players get only `meta.pendingRoll`.
6. Client displays modal/board prompts only when its `PlayerView.pendingRoll` is visible, while `meta.pendingRoll` blocks other actions globally.
7. Owning client sends `resolvePendingRoll` with pending id and optional choice.
8. Rules verify id and player at `packages/rules/src/pendingRoll/resolvePendingRoll/index.ts:13`.
9. Resolver dispatches to core or hero pending-roll cases, often creating the next pending roll in a chain.

### Design Invariants To Preserve

- Rules determinism: no ambient randomness in rules behavior except injected `RNG`.
- Server authoritative RNG: clients never send dice outcomes.
- Server authoritative state: clients send intents, not patches.
- Pending rolls are explicit: no autoroll; owner must resolve a pending roll.
- Pending rolls gate action economy: no regular actions while a roll/choice is pending.
- Player-specific knowledge is projected server-side; hidden state should not leak through views or events.
- Rejections must not advance revision, mutate state, or append logs.
- Each room must serialize commands to avoid seat/action races.

## Findings Ordered By Severity

### Critical

#### C1. Rules test command is red and stops before gameplay suite

Why it matters: `npm test` depends on `npm run -w rules test`, and the rules suite fails at the first boundary test. This means the large gameplay, pending-roll, visibility, and golden snapshot coverage is not running in the default test path.

Where:
- `packages/rules/src/tests/simpleTests.ts:418`, `testActionModuleBoundaries`
- Failure reports 17 violations such as `abilityActions.ts -> ./abilityActions/index`, `heroes/asgore.ts -> ./asgore/index`
- Root script: `package.json:12`, `test`

What to do:
- Decide whether shim files importing folder `index` files are now allowed.
- If allowed, update the architectural test allowlist to reflect the current module split.
- If not allowed, remove or replace the shim pattern.
- Add a fast smoke subset plus full rules suite split so one boundary failure does not hide all gameplay results.

Risk of regressions: Low if only the test allowlist is corrected; Medium if module structure is changed.

Effort estimate: S.

#### C2. Web build ships while TypeScript is red

Why it matters: `npm run build` passes because `packages/web` runs only `vite build`, which does not type-check. A separate `npx tsc -p packages/web/tsconfig.json --noEmit` fails with type errors in board, event log, rules modal, RightPanel, and combat target hooks. Production deploy can succeed with invalid TS contracts.

Where:
- `packages/web/package.json:6`, `build: "vite build"`
- Type-check failures include:
  - `packages/web/src/components/Board.tsx:580`
  - `packages/web/src/components/EventLog.tsx:203`
  - `packages/web/src/components/RulesModal.tsx:52`
  - `packages/web/src/game/components/BoardStage.tsx:12`
  - `packages/web/src/game/components/RightPanel/RightPanelContent.tsx:78`
  - `packages/web/src/game/gameshell-content/hooks/useGameShellCombatTargets.ts:72`

What to do:
- Add `typecheck` to `packages/web`.
- Make root `build` or CI run `npm run -w web typecheck && npm run -w web build`.
- Fix the stale/loose types, especially old `BoardStage` props and `Object.values` unknown inference.

Risk of regressions: Low if type fixes are mechanical; Medium if hidden stale components are actually used.

Effort estimate: S-M.

### High

#### H1. REST API allows player spoofing and exposes full action logs by room id

Why it matters: WS seats have resume tokens and role checks, but REST endpoints use `?playerId=P1|P2` without seat ownership. Anyone who knows a room id can request a player view, submit actions as either player if rules allow, or read the action log. This is a cheat surface and can also expose private choices/events.

Where:
- `packages/server/src/routes.ts:12`, `parsePlayerId`
- `packages/server/src/routes.ts:88`, `GET /api/games/:id`
- `packages/server/src/routes.ts:109`, `GET /api/games/:id/log`
- `packages/server/src/routes.ts:123`, `POST /api/games/:id/actions`

What to do:
- Treat REST game/action/log endpoints as dev-only unless authenticated.
- Require a seat-scoped token for REST player views/actions, or remove REST action submission from production.
- Gate logs behind host/admin/debug auth and filter logs per viewer.
- Prefer one command gateway shared by WS and REST so validation stays identical.

Risk of regressions: Medium; external debug clients may depend on current REST behavior.

Effort estimate: M.

#### H2. Event filtering is default-allow and likely leaks hidden/private info

Why it matters: `makePlayerView` masks state, but `actionResult.events` are separately broadcast. The filter only hides `stakesPlaced` from non-owners and `intimidateTriggered` from non-defenders. Any new event with positions, target queues, hidden unit ids, dice, or private choices is sent to everyone by default.

Where:
- `packages/server/src/ws.ts:582`, `broadcastActionResult`
- `packages/server/src/ws.ts:609`, `filterEventsForRecipient`
- `packages/rules/src/view/player.ts:115`, player pending roll projection is private, but event filtering is separate

What to do:
- Move event projection into rules next to `makePlayerView`.
- Change policy to default-deny for private event fields, or define `visibility` metadata per event type.
- Add tests for spectator and opponent event streams for stealth, stakes, Chikatilo, Loki, hidden AoE, and pending choice flows.

Risk of regressions: Medium; UI event log may need projected event variants.

Effort estimate: M.

#### H3. Unknown pending roll kinds are silently cleared

Why it matters: If a new pending roll kind is added but not wired to a resolver, `applyResolvePendingRoll` clears the pending roll and returns changed state with no events. Server accepts that because state changed. This can silently skip required choices/rolls and corrupt turn flow.

Where:
- `packages/rules/src/pendingRoll/resolvePendingRoll/index.ts:37`, hero resolver dispatch
- `packages/rules/src/pendingRoll/resolvePendingRoll/index.ts:48`, default `clearPendingRoll`
- `packages/server/src/store.ts:194`, changed state is accepted

What to do:
- Make unresolved pending kinds reject with unchanged state plus a diagnostic event/result, or better an explicit `Rejected` result.
- Add exhaustive mapping tests: every `RollKind` must have exactly one resolver or an explicit terminal policy.
- Make clearing a pending roll an explicit resolver decision, not the dispatcher default.

Risk of regressions: Medium; some existing "clear and continue" edge cases may need explicit resolver branches.

Effort estimate: S-M.

#### H4. Rules accepted/rejected outcome is implicit

Why it matters: The server classifies "same state and no events" as rejected. That works for many invalid actions but is fragile for legitimate no-ops, intentional idempotency, and future actions that update by mutation or return equal references incorrectly. There is already a whitelist for `setReady`, which confirms the model is leaking.

Where:
- `packages/server/src/store.ts:62`, `isExplicitlyAcceptedNoop`
- `packages/server/src/store.ts:189`, `applyGameAction`
- `packages/rules/src/actions/registry.ts:91`, default no-op

What to do:
- Change rules `ApplyResult` to a discriminated result: `{ ok: true, state, events, stateChanged } | { ok: false, code, message }`.
- Have action handlers return explicit rejections for invalid phase/actor/target/choice.
- Keep server revision/log invariants, but stop inferring intent from object identity.

Risk of regressions: High because it touches most rules handlers, but can be incremental via compatibility adapter.

Effort estimate: L.

#### H5. WS origin handling is not explicitly enforced for WebSockets

Why it matters: HTTP CORS is configured, but the WS route does not perform an explicit `Origin` check. Browser WebSockets are not protected by CORS the same way as fetch. Any site can attempt a WS connection unless Fastify/websocket origin is explicitly rejected. Combined with public room listing and open spectator joins, this increases griefing and leakage risk.

Where:
- `packages/server/src/index.ts:27`, CORS config
- `packages/server/src/index.ts:32`, any `*.vercel.app` origin allowed
- `packages/server/src/ws.ts:802`, `/ws` route has no visible origin validation

What to do:
- Add WS upgrade origin validation using the same allowlist policy.
- Avoid wildcard `*.vercel.app` in production; require exact `WEB_ORIGIN`.
- Add tests for accepted and rejected WS origins.

Risk of regressions: Medium; local/dev preview URLs need a clear allowlist story.

Effort estimate: S-M.

#### H6. Production dependency audit is red

Why it matters: `npm audit --omit=dev` reports 7 production vulnerabilities. `fast-uri` is high severity via Fastify schema dependencies; `ws` has a moderate advisory. Even if exploitability is limited, deployment readiness should not knowingly ship an audit-red server.

Where:
- `package-lock.json`
- `packages/server/package.json`, `fastify`, `@fastify/websocket`, `ws`

What to do:
- Run `npm audit fix` in a dedicated PR and review lockfile changes.
- For `fast-uri`, plan Fastify ecosystem upgrade. Audit suggests `npm audit fix --force` would move to Fastify 5, which is breaking.
- Add `npm audit --omit=dev --audit-level=high` to CI once dependency policy is agreed.

Risk of regressions: Medium for non-breaking fixes; High if upgrading Fastify major.

Effort estimate: S for `ws`/non-breaking updates, M-L for Fastify 5.

### Medium

#### M1. Web and server protocol types can drift

Why it matters: Server schemas are Zod definitions in `packages/server/src/schemas.ts`, while web protocol types are handwritten in `packages/web/src/ws.ts`. There is no generated/shared contract for accepted/rejected payloads, `RoomMeta`, or pending-roll choices. Drift will surface at runtime.

Where:
- `packages/server/src/schemas.ts:45`, `ResolveRollChoiceSchema`
- `packages/server/src/schemas.ts:164`, `GameActionSchema`
- `packages/server/src/schemas.ts:277`, `ClientMessageSchema`
- `packages/web/src/ws.ts:31`, `ServerMessage`
- `packages/web/src/ws.ts:67`, `ClientMessage`

What to do:
- Create a shared `protocol` package or export inferred server schema types.
- Add compile-time checks that web message constructors satisfy server input types.
- Add WS contract tests that replay serialized client messages through `ClientMessageSchema`.

Risk of regressions: Low if introduced additively.

Effort estimate: M.

#### M2. Network schemas lack domain caps and bounds

Why it matters: There is a 64 KB WS payload cap, but individual strings and coordinates are mostly unbounded. `useAbility.payload` is `z.unknown()`. Invalid payloads eventually hit rules, but earlier rejection reduces CPU/log noise and avoids weird context sizes.

Where:
- `packages/server/src/schemas.ts:12`, `CoordSchema`
- `packages/server/src/schemas.ts:28`, `CreateGameBodySchema`
- `packages/server/src/schemas.ts:197`, `useAbility.payload`
- `packages/server/src/schemas.ts:215`, `JoinRoomMessageSchema`

What to do:
- Add max lengths for room id, name, resume token, unit id, ability id, arena id.
- Add coordinate bounds or at least non-negative caps aligned to board size.
- Replace broad `unknown` ability payload with per-ability payload schemas where possible.
- Reject extra keys with `.strict()` where compatibility allows.

Risk of regressions: Medium; clients or saved figure imports may rely on loose payloads.

Effort estimate: M.

#### M3. Room state is memory-only with no TTL or persistence

Why it matters: Server restarts drop all games. Long-running deployments accumulate rooms, logs, spectators, and timers. There is no cleanup for ended/abandoned rooms.

Where:
- `packages/server/src/store.ts:59`, in-memory `games`
- `packages/server/src/store.ts:212`, unbounded `actionLog`
- `packages/server/src/ws.ts:445`, reconnect grace timers

What to do:
- Add room TTL and cleanup for empty/ended rooms.
- Cap or persist logs.
- For production, store snapshots and action logs in durable storage.
- Add health metrics for room count, socket count, queue depth, and log size.

Risk of regressions: Medium; TTL policy can surprise users if too aggressive.

Effort estimate: M.

#### M4. Per-socket projections recompute legal data for every broadcast

Why it matters: Every accepted action broadcasts `roomState` to each socket. Each player projection recomputes legal placements, moves, attack targets, ability views, and legal intents for all friendly units. This is fine for small rooms today, but will be a hotspot with spectators, larger boards, bots, or multi-room load.

Where:
- `packages/server/src/ws.ts:556`, `sendRoomState`
- `packages/server/src/ws.ts:574`, `broadcastRoomState`
- `packages/rules/src/view/player.ts:94`, legal recomputation loop

What to do:
- Measure projection time and serialized byte size per broadcast.
- Cache per-revision player/spectator projections inside `GameRoom`.
- Consider sending revisioned snapshots plus smaller event/delta updates later.

Risk of regressions: Low if caching is revision-keyed and tested.

Effort estimate: M.

#### M5. `server/src/ws.ts` mixes too many responsibilities

Why it matters: A 1,467-line WS file owns FATE protocol, Pong protocol, seats, reconnect grace, rate limiting, command validation, command application, projection, event filtering, and logging. This makes security review and changes risky.

Where:
- `packages/server/src/ws.ts:159`, send helpers
- `packages/server/src/ws.ts:242`, seat assignment
- `packages/server/src/ws.ts:445`, reconnect grace
- `packages/server/src/ws.ts:609`, event filtering
- `packages/server/src/ws.ts:655`, command gate
- `packages/server/src/ws.ts:802`, route registration and message switch

What to do:
- Split into:
  - `ws/protocol.ts` for message send/parse
  - `rooms/seats.ts` for seat/resume/host transitions
  - `rooms/projection.ts` for room state/event projection
  - `commands/applyFateCommand.ts` for validation and apply/broadcast
  - `pong/ws.ts` for Pong protocol
- Keep behavior identical during the split.

Risk of regressions: Medium due to many paths; mitigated by existing WS hardening tests.

Effort estimate: M.

#### M6. Hero metadata and UI constants are duplicated

Why it matters: Hero ids, classes, HP adjustments, ability ids, figure catalogs, and labels are repeated in rules and web. Drift can cause wrong HP bars, unavailable heroes, missing assets, or stale ability controls.

Where:
- `packages/rules/src/heroes.ts:52`, rules `HERO_CATALOG`
- `packages/rules/src/heroMeta/index.ts:8`, `HERO_REGISTRY_LIST`
- `packages/web/src/catalog/figures.ts:3`, web `HERO_CATALOG`
- `packages/web/src/rulesHints.ts:3`, "Keep in sync" constants and HP helper
- `packages/web/src/game/gameshell-content/helpers.ts:327`, pending roll labels

What to do:
- Export hero/ability display metadata from rules or a shared catalog package.
- Make web derive HP and ability labels from `PlayerView.abilitiesByUnitId` and hero meta.
- Add a drift test comparing web figure ids against rules hero meta and asset registry.

Risk of regressions: Medium if UI assumptions are moved too quickly.

Effort estimate: M-L.

#### M7. CI does not enforce the repo health gates

Why it matters: Local commands can fail unnoticed. Current `.github/workflows/telegram.yml` sends notifications only; it does not run install, build, test, typecheck, or audit.

Where:
- `.github/workflows/telegram.yml:1`
- Root scripts in `package.json:7`

What to do:
- Add CI workflow:
  - `npm ci`
  - `npm run -w rules test`
  - `npm run -w server test`
  - `npm run -w web typecheck`
  - `npm run build`
  - `npm audit --omit=dev --audit-level=high`
- Keep Telegram workflow separate.

Risk of regressions: Low; initial work is getting the gates green.

Effort estimate: S.

### Low

#### L1. Pong code shares the FATE WS route and test script omits Pong tests

Why it matters: Pong is unrelated to the authoritative FATE game but shares `socketMeta`, `roomSockets`, rate limiting, and `/ws` switch cases. Its test file exists but is not run by `packages/server` test script.

Where:
- `packages/server/src/ws.ts:843`, `pongJoin`
- `packages/server/src/tests/pong.test.ts`
- `packages/server/package.json:10`, test script excludes `pong.test.ts`

What to do:
- Move Pong to a separate route/module or clearly mark it experimental.
- Add `tsx src/tests/pong.test.ts` to the test command if it remains in repo.

Risk of regressions: Low for test inclusion; Medium if route is split.

Effort estimate: S.

#### L2. Some files contain mojibake/encoding-corrupted text

Why it matters: Corrupted text harms docs, UI polish, and scripts that post notifications. It can also hide intended comments.

Where:
- `.github/workflows/telegram.yml:19`, bullet prefix text
- `.github/workflows/telegram.yml:33`, Telegram message text
- `packages/web/src/components/Lobby.tsx`, room ready checkmarks display as mojibake
- `packages/web/src/pages/FigureSetPage.tsx`, infinity/dot separator display as mojibake
- `packages/rules/src/index.ts:6`, corrupted comment

What to do:
- Normalize repo files to UTF-8.
- Prefer ASCII in source comments or ensure editorconfig/tooling enforces UTF-8.

Risk of regressions: Low.

Effort estimate: S.

#### L3. Generated/build artifacts and logs are present in the repo working tree

Why it matters: Root has dev log files, and package dist artifacts may be regenerated. This can create noisy diffs and stale deployment assumptions.

Where:
- Root `rules-watch.*.log`, `server-dev.*.log`, `web-dev.*.log`
- `packages/rules/dist` and other generated output after builds

What to do:
- Ensure generated logs/dist are ignored unless intentionally committed.
- Keep deploy build independent of existing local `dist`.

Risk of regressions: Low.

Effort estimate: S.

## Quick Wins

- Fix the rules boundary test or the module shim structure so `npm run -w rules test` runs the full suite.
- Add `npm run -w web typecheck` and fix current web TS errors.
- Add a CI workflow for install, rules test, server test, web typecheck, build, and high-severity audit.
- Gate or disable `/api/games/:id/log` and REST action submission in production.
- Add explicit WS origin checks.
- Add max lengths and `.strict()` to high-volume schemas.
- Include `pong.test.ts` or remove Pong from the default FATE server path.
- Update dependencies for `ws` and non-breaking audit fixes.
- Add a smoke test that asserts non-owner event streams do not include private stake/pending data.

## Strategic Improvements

- Introduce explicit typed command results end-to-end: rules -> server -> web.
- Split server WS into protocol, room/session, command, projection, and Pong modules.
- Move event visibility into rules and make it testable next to `makePlayerView`.
- Add revisioned snapshots and replay so reconnects and debugging do not depend on current in-memory state only.
- Consolidate hero, ability, pending roll, and figure metadata into a shared source.
- Build a property/golden test harness that runs random action sequences under seeded RNG and asserts invariants after every step.
- Add persistence and room TTLs before serious production use.
- Add telemetry for projection cost, command latency, rejected action rates, queue depth, and payload sizes.

## Testing Review

### Covered Well

- Rules have broad gameplay coverage in `simpleTests.ts`, including turn flow, stealth, movement, attacks, heroes, pending-roll sequences, and golden snapshots.
- Rules include explicit tests for no autoroll/pending roll sequence.
- Server tests cover view masking, WS join/reconnect smoke, reconnect grace expiry, role switch serialization, rejected action log invariants, rate limit window reset, and payload cap headroom.
- Golden snapshots exist for complex action/pending-roll/event flows.

### Missing Or Weak

- Default rules test currently fails before gameplay tests run.
- Web has no test script and no type-check gate in build.
- No browser/component tests for pending roll prompts, board selections, reconnect behavior, or figure set import/export.
- No end-to-end tests that assert per-player event streams are filtered.
- No REST hardening tests for player spoofing/log access.
- No replay determinism test that starts from seed plus action log and reproduces final state/events.
- No load/performance tests around `broadcastRoomState` with multiple sockets.
- No deployment CI.

### Suggested Test Pyramid

- Rules:
  - Keep pure unit tests for movement/combat/hero resolvers.
  - Split `simpleTests.ts` into focused files by subsystem.
  - Add invariant tests that run after every accepted action.
  - Add exhaustive pending-roll resolver coverage by `RollKind`.

- Server:
  - Add command gateway unit tests independent of WebSocket.
  - Add WS integration tests for origin rejection, event filtering, spectator views, and REST-disabled production mode.
  - Add replay/log tests once snapshots exist.

- Web:
  - Add `typecheck`.
  - Add Vitest/RTL for store message handling and pending-roll UI state.
  - Add Playwright smoke for lobby -> join two players -> ready -> start -> resolve initiative.

### Golden Snapshots

- Keep golden snapshots for:
  - pending-roll chains
  - complex AoE/intimidate chains
  - action log/replay output
  - per-player projections
  - per-recipient event streams
- Store snapshots as separate fixtures rather than giant inline blobs once the suite is split.
- Include seed, action sequence, expected final summary, and expected visible projections.

## Security And Cheating Surfaces

- Role/seat spoofing:
  - WS seats are protected by server-side `connId` and `resumeToken`, with reconnect grace tests.
  - REST bypasses seats by accepting `playerId` query params.
  - Open `/rooms` enables room discovery; combined with open spectator join and weak REST auth this is a cheat surface.

- Action validation and no-op rejections:
  - WS checks seated role, ended phase, pending-roll gate, and owner/turn permission.
  - REST uses `isActionAllowedByPlayer` but lacks the explicit non-roll pending gate.
  - Rules/server still rely on no-op inference for rejection.

- Token leakage:
  - Resume tokens are sent to the browser and replayed on join.
  - Tokens are not persisted across refresh, which reduces leakage duration but hurts UX.
  - Schemas do not cap token length.
  - Avoid putting resume tokens into URLs, logs, analytics, or localStorage unless hashed/rotated.

- Spectator visibility/leaks:
  - `makeSpectatorView` hides live stealthed units and pending rolls.
  - Event streams are the bigger leak risk because filtering is default-allow.
  - Action logs are fully exposed through REST.

- Payload caps and rate limits:
  - WS payload cap and per-socket message rate exist.
  - HTTP endpoints do not appear to have explicit rate limits.
  - Zod schemas need per-field limits and stricter payload schemas.

- Replay logs exposure:
  - Logs are useful for replay/debug but should be access-controlled and projected.
  - Current logs include raw actions/events.

## Performance Review

- Per-socket projection cost:
  - `broadcastRoomState` loops sockets and calls `makePlayerView`/`makeSpectatorView` per socket.
  - `makePlayerView` recomputes legal placements, moves, attack targets, ability views, and legal intents for all friendly units.
  - With 2 players this is fine. With many spectators/bots/multi-node fanout, cache by room revision and role.

- Recomputation hotspots:
  - Legal moves and attack targets in `packages/rules/src/view/player.ts:94`.
  - Board/UI target helpers in web recompute many target sets in large hooks.
  - Serialization of full views on every accepted action.

- WS broadcast patterns:
  - Full snapshot is broadcast after every accepted action.
  - `actionResult` is also broadcast separately, causing two messages per action.
  - Consider revisioned snapshots plus events/deltas once correctness is locked.

## Maintainability Review

- Module boundaries:
  - Rules has useful subsystem directories, but legacy top-level shims and newer folders conflict with the boundary test.
  - Pending-roll organization is much improved but resolver dispatch is still switch-heavy.
  - Hero code is split per hero, but post-action hooks in `actions/registry.ts` are centralized and easy to forget.

- Naming/folder clarity:
  - Duplicate concepts exist: `core/rolls/rollUtils.ts` and `pendingRoll/builders/buildPendingRoll.ts` both define `replacePendingRoll`.
  - Multiple `coordKey` helpers exist in rules and web.
  - `rulesHints.ts` is a catch-all "keep in sync" file that should shrink over time.

- Long files:
  - `packages/rules/src/tests/simpleTests.ts`: 16,976 lines
  - `packages/server/src/ws.ts`: 1,467 lines
  - `packages/web/src/game/gameshell-content/cellHandlers.ts`: 944 lines
  - `packages/web/src/components/Board.tsx`: 639 lines
  - `packages/web/src/game/gameshell-content/components/PendingRollModal.tsx`: 592 lines
  - `packages/web/src/store.ts`: 588 lines

- Duplication risks:
  - Hero catalogs and HP calculations are duplicated between rules and web.
  - Pending roll labels and choice UI live in web while pending kinds live in rules.
  - Event formatting is hand-maintained in web and already type-checks poorly.

## Deployment Readiness

- Local dev scripts:
  - `npm run dev` starts rules watch, server dev, and web dev.
  - `waitForRulesDist.mjs` reduces server startup races.
  - `postinstall` builds rules, which helps local file dependency but adds install-time side effects.

- Render/Vercel environment:
  - README documents Render server and Vercel web settings.
  - Production web build fails fast if `VITE_API_URL` or `VITE_WS_URL` is missing.
  - Build command for Render builds rules and server only, which is appropriate for server deploy.

- Health endpoints:
  - `/health` and `/api/health` exist and return `{ ok: true }`.
  - No readiness details for room counts, dependency versions, or queue health.

- CORS / WS origin:
  - HTTP CORS allows localhost, `WEB_ORIGIN`, and any `*.vercel.app`.
  - WS route should explicitly validate `Origin`.
  - Production should prefer exact origins over preview wildcard unless preview deploys are intentional.

- Build pipeline:
  - Root `npm run build` passes.
  - Web type-check is missing from build.
  - No CI gate exists.

- Vulnerabilities:
  - `npm audit --omit=dev` reports 7 vulnerabilities: `fast-uri` high, `ajv` moderate, `ws` moderate.
  - Some fixes may require Fastify major upgrade.

## Proposed Roadmap

| Item | Motivation | Scope | Success criteria | Effort | Dependencies |
| --- | --- | --- | --- | --- | --- |
| Fix rules test gate | Restore confidence in rules changes | Update boundary test or module shims | `npm run -w rules test` reaches and passes full suite | S | None |
| Add web typecheck | Stop shipping TS-red web | Add script and fix current errors | `npm run -w web typecheck` passes and CI runs it | S-M | None |
| Lock down REST debug API | Remove spoof/log cheat surface | Auth/dev-gate player views/actions/logs | Production rejects unauthenticated REST actions/logs | M | Decide debug policy |
| WS origin validation | Prevent cross-site WS abuse | Validate `Origin` on `/ws` | Tests cover allowed/rejected origins | S-M | Deploy origin list |
| Explicit command result | Remove no-op inference | Add accepted/rejected rules result adapter | Server no longer infers rejection from identity/events | L | Rules handler migration |
| Event projection | Stop hidden info leaks | Per-recipient event visibility in rules | Tests prove opponent/spectator streams are safe | M-L | Event visibility policy |
| Split server WS | Improve reviewability | Extract protocol/seats/commands/projection/pong | Smaller modules with unchanged tests passing | M | Current tests green |
| Room TTL and persistence | Production stability | TTL cleanup, snapshot/log store | Restart/reconnect/replay story documented and tested | M-L | Storage choice |
| Shared metadata/protocol | Reduce drift | Shared hero/protocol package or generated types | Web no longer duplicates hero ids/HP/protocol shapes | M-L | Typecheck green |
| CI health gate | Deployment confidence | GitHub Actions install/test/typecheck/build/audit | PRs cannot merge red checks | S | Tests/typecheck green |
| Dependency upgrades | Security posture | Update `ws`, plan Fastify upgrade | Audit high severity is clean | S-M | CI gate |
| Projection metrics/cache | Performance readiness | Measure and cache per-revision views | Broadcast cost visible and stable under load | M | Metrics approach |

## Command Results

- `npm run -w rules test`: failed.
  - Fails in `testActionModuleBoundaries` with 17 module boundary violations.
- `npm run -w server test`: passed.
  - View, WS smoke, and hardening tests passed.
  - Node printed experimental warning for MockTimers.
- `npm run build`: passed.
  - Rules build, server build, and Vite web build completed.
  - Vite printed CJS Node API deprecation warning.
- Extra check: `npx tsc -p packages/web/tsconfig.json --noEmit`: failed.
  - Confirms web build does not type-check.
- Extra check: `npm audit --omit=dev`: failed.
  - 7 production dependency vulnerabilities.

## Ideas Worth Considering Later

- Typed `Accepted`/`Rejected` results end-to-end from rules to server to web.
- Revisioned snapshots and replay from seed plus action log.
- Persistence for snapshots/log store and room TTLs.
- Multi-node WS scaling plan with room affinity or pub/sub fanout.
- Audit log access control with per-viewer projection.
- AI/bot testing harness for random legal action exploration.
- Telemetry and metrics: command latency, projection time, payload bytes, room/socket counts, rejection rates.
- Golden snapshots for player/spectator event streams, not just final state/events.
- Load test with many spectators and repeated pending-roll chains.
- Protocol versioning so old clients fail gracefully after deploys.
