# Stable Event Delivery Foundation (Phase 1)

## Contract

Rules still return plain `GameEvent[]`. The shared view layer exports transport
types only; rules actions never generate or consume delivery UUIDs:

```ts
type DeliveredGameEvent = GameEvent & { eventId: string };

interface LiveEventBatch {
  streamId: string;
  revision: number;
  events: DeliveredGameEvent[];
}
```

Journaled accepted WS results carry those fields alongside
`type: "actionResult"` and `ok: true`. REST action responses carry the same
fields plus the recipient view. Rejections and explicitly accepted non-journaled
no-ops have no batch identity; the result contracts therefore make `streamId`
and `revision` optional. Web ingress ignores results without a batch identity.

Recipient payloads keep the existing projection behavior. Its current
`GameEvent` return type also represents redacted shapes; the server adapter
isolates that compatibility boundary, with a TODO for the later projection
contract phase.

## Ordering and identities

The old delivery `logIndex` was `actionLog.length - 1`. Once the bounded journal
reached capacity it stopped advancing, and the client discarded genuinely new
results. Recovery also restores a revision baseline with an empty in-memory
log, which made the old index restart near zero.

`applyGameAction` now assigns IDs after rules acceptance, increments the existing
`room.revision`, and stores the identified events in the existing action journal.
The accepted command and all broadcasts reuse those events. Rejections and
explicit no-ops retain their existing revision semantics. Draft actions and
debug mutations retain their existing revision increments, including the staged
final draft pick/start transition.

Persisted rooms use the existing `Match.id` as `streamId`, both at room creation
and recovery. This does not require another durable identifier. Unpersisted
rooms and test timelines use an opaque server UUID. Creating another room
instance, including reuse of a room name/ID, creates another transient stream;
normal persisted matches bind to their newly created Match IDs. Debug snapshot
import and board reset replace the test stream UUID, while ordinary debug
mutations keep it. Reconnecting to an existing room retains its identity.

`identifyAcceptedEvents` uses Node `crypto.randomUUID()` once per event, without
mutating rules event objects or using gameplay RNG. Projection copies the
original ID onto each recipient payload, including a redacted payload. An event
omitted by projection remains omitted. Broadcast and retransmission never
assign IDs.

## Deferred presentation and ingress

The web chain and legacy buffers retain whole event objects, including their
`eventId`. Releasing a chain changes the presentation batch revision to the
completion batch's revision but never changes early event IDs. Combat playback
adds offsets by spreading the batch; it retains event objects and identity.
The completion bookkeeping event is delivered with its own ID and consumed by
the existing visual resolver.

`lastEventRevision` plus `eventStreamId` replace the store's log-index watermark.
An acknowledged `pendingEventBatches` queue retains every received batch for
the current stream until the resolver observes it. Each entry captures the
recipient view at ingress. The resolver iterates all entries in order and
queues every released playback plan before acknowledging the captured entries;
newer entries received meanwhile are retained. `latestEventBatch` remains a
convenience field for debug UI, rather than the delivery queue. A stream change
clears obsolete ingress and deferred presentation state.

Existing effect consumers use the same stream/revision presentation key.
Debug replay retains the original live batch and event IDs, and queues a copy
with a separate `preview:<uuid>` key. It does not replace the live batch, change
the live revision watermark, or modify chain buffers. The standalone existing
preview page also uses the preview namespace. Synthetic preview payloads may
lack server event IDs; that is why the presentation-only event type permits an
optional ID, while live transport events require one.

## Persistence and compatibility

- No database columns, migration, or snapshot format version change.
- `Match.id` already persists the stream identity; snapshots and accepted rows
  already persist revision. Restore uses those values directly, without scanning
  a journal to construct identities, and the next accepted action increments the
  recovered revision.
- The existing `MatchAction.events` JSON retains the assigned `eventId`; retries
  reuse the captured accepted-action record. The existing filtering of visual
  completion bookkeeping and chain metadata is unchanged. Snapshots still omit
  event history, which belongs to the accepted-action journal.
- Safe historical event summaries retain an ID when their stored event has one,
  while preserving the existing player-neutral allowlist.
- Old snapshots naturally recover the same stream via `Match.id`. Old journal
  events without IDs remain legacy read-only history. Recovery does not invent
  new historical IDs or replay historical event batches as live deliveries.
- Benchmark trace hashes compare semantic events without delivery UUIDs.
  Storage measurements still include the actual persisted UUIDs. Determinism
  tests compare every semantic field, state and RNG, and additionally require
  distinct opaque delivery IDs across independent accepted runs.

## Files

- **Rules:** `src/view/delivery.ts`, `src/view/index.ts` (shared transport types
  only; no gameplay or combat-chain implementation changes).
- **Server:** `src/eventDelivery.ts`, `src/commandResult.ts`, `src/store.ts`,
  `src/ws.ts`, `src/routes.ts`, `src/testRoom/applyTestCommand.ts`,
  `src/persistence/acceptedAction.ts`, `src/persistence/matchLifecycle.ts`,
  `src/services/matchActionService.ts`; focused delivery/recovery/contract test
  changes; benchmark scenario identity and its regression checks.
- **Web:** `src/ws.ts`, `src/api.ts`, `src/store.ts`, the Board/shell queue wiring,
  `src/game/effects/{types,batchIdentity,visualResolution,useVisualResolution,
  useBoardEffects,effectQueue}.ts`; existing SFX/VFX consumer batch contracts and
  presentation request keys, standalone preview identity, and related fixture
  migrations/tests. Sound/VFX assets, registries and ability mappings are untouched.

## Regression coverage

Focused tests cover the requested nine invariants: bounded journal revisions,
recovery continuation, recipient ID equality, duplicate projection/broadcast
rebuild, distinct IDs for identical actual gameplay payloads, deferred chain
IDs, recovered stream continuity, new match/reset stream identity, and preview
separation. Additional tests cover journal JSON/history ID retention, duplicate
ingress suppression, acknowledgement preserving newer arrivals, stream reset,
and three batches reaching ordered playback after one React commit.

The standard root regression runner covers rules, server units, persistence and
recovery contracts, all web test files, OpenAPI checks, and database-free actual
WebSocket suites. PostgreSQL integration suites require a separately configured
local `TEST_DATABASE_URL`.

## Validation results

- `npm run -w rules test`: passed.
- `npm run test`: 41 suite executions passed, including 488 web tests, server
  units, persistence/recovery, contracts and database-free WebSocket suites.
- Focused server delivery suite: 6 tests passed; focused ingress, chain and
  preview assertions and the React queue regression passed in the web suites.
- After aligning the persisted replay fixture stream ID, focused server
  delivery, `matchRecovery.test.ts` and `replay.test.ts` passed again.
- `npm run -w server typecheck`, `npm run -w server benchmark:typecheck`,
  `npm run lint`, and the final `npm run build`: passed.
- PostgreSQL integration suites were not run: `TEST_DATABASE_URL` is unset,
  no test PostgreSQL listener is available on the example port, and the Docker
  engine is unavailable. No shared database was used.

## Next phase

Reconnect/hydration baseline coordination, suppression of snapshot event
history, reconstruction or cancellation of partially buffered chains after a
reconnect, and event-ID-based presentation deduplication remain future work.
Phase 1 adds no audio/VFX integration and does not change authoritative gameplay.

## Changed file inventory

### rules

- `packages/rules/src/view/delivery.ts`
- `packages/rules/src/view/index.ts`

### server

- `packages/server/bench/replay-snapshot/benchmark.test.ts`
- `packages/server/bench/replay-snapshot/scenarios.ts`
- `packages/server/src/commandResult.ts`
- `packages/server/src/eventDelivery.ts`
- `packages/server/src/persistence/acceptedAction.ts`
- `packages/server/src/persistence/matchLifecycle.ts`
- `packages/server/src/routes.ts`
- `packages/server/src/services/matchActionService.ts`
- `packages/server/src/store.ts`
- `packages/server/src/testRoom/applyTestCommand.ts`
- `packages/server/src/tests/hardening.test.ts`
- `packages/server/src/tests/matchRecovery.test.ts`
- `packages/server/src/tests/modes.test.ts`
- `packages/server/src/tests/realtime.integration.test.ts`
- `packages/server/src/tests/replayTestSupport.ts`
- `packages/server/src/tests/unit/eventDelivery.test.ts`
- `packages/server/src/ws.ts`

### web

- `packages/web/src/api.ts`
- `packages/web/src/components/Board.tsx`
- `packages/web/src/features/sfx/sfxEventMapper.test.ts`
- `packages/web/src/features/sfx/sfxEventMapper.ts`
- `packages/web/src/features/sfx/useBoardSfx.ts`
- `packages/web/src/features/vfx/useBoardVfx.ts`
- `packages/web/src/features/vfx/vfxEventMapper.test.ts`
- `packages/web/src/features/vfx/vfxEventMapper.ts`
- `packages/web/src/features/vfx/vfxPreviewScenarios.test.ts`
- `packages/web/src/features/vfx/vfxQueue.test.ts`
- `packages/web/src/features/vfx/vfxQueue.ts`
- `packages/web/src/features/vfx/vfxTypes.ts`
- `packages/web/src/game/effects/batchIdentity.ts`
- `packages/web/src/game/effects/combatPlayback.test.ts`
- `packages/web/src/game/effects/effectQueue.ts`
- `packages/web/src/game/effects/types.ts`
- `packages/web/src/game/effects/useBoardEffects.ts`
- `packages/web/src/game/effects/useVisualResolution.test.ts`
- `packages/web/src/game/effects/useVisualResolution.ts`
- `packages/web/src/game/effects/visualResolution.test.ts`
- `packages/web/src/game/effects/visualResolution.ts`
- `packages/web/src/game/gameshell-content/components/GameShellBoardColumn.tsx`
- `packages/web/src/game/gameshell-content/hooks/useGameShellCoreState.ts`
- `packages/web/src/pages/VfxPreviewPage.tsx`
- `packages/web/src/store.eventDelivery.test.ts`
- `packages/web/src/store.ts`
- `packages/web/src/ws.ts`
