# FATE audio and VFX integration plan

Reviewed: 2026-10-06, Europe/Kiev. Scope: architectural review of the current working tree, including the newly organized, untracked assets. **This document is the only file created by this task.** No implementation, dependency installation, asset conversion, or protocol change was performed.

## 1. Decision and current architecture

**Extend the existing authoritative event pipeline, sound registry/player, VFX layer, and combat presentation scheduler. Do not build a second effects framework.** The foundation exists, but it is not sufficient for reliable integration of the entire asset library.

The most urgent prerequisite is event delivery identity: the current `logIndex` is an array position, not a durable sequence. Next come recipient-safe event payloads, ability correlation, dice results, and movement provenance. Registering every asset before fixing these boundaries would make existing gaps audible and visible.

### Verified repository boundaries

| Package | Current ownership | Recommended ownership |
| --- | --- | --- |
| `packages/rules` | Deterministic actions, combat, manual roll resolution, hero mechanics, `GameEvent`, player/spectator projection | Continue defining gameplay event meanings and recipient authorization. Add only missing semantic data/events; no asset paths or audio timing here. |
| `packages/server` | Fastify/WS, authoritative RNG, room state, accepted-action revision, journal, recovery, per-recipient broadcasts | Assign stable delivery identity, publish projected events with their revision, provide explicit snapshot baselines, preserve ordering. |
| `packages/web` | React/Zustand client, responsive DOM board, targeting previews, CSS effects, raster VFX, sound playback scaffolding | Translate authorized events into presentation cues; own assets, volumes, animation timing, loading, and instance lifetimes. |

### Existing systems to reuse

| Code inspected | What actually exists |
| --- | --- |
| [rules/model/events/index.ts](packages/rules/src/model/events/index.ts), [core.ts](packages/rules/src/model/events/core.ts), [heroes.ts](packages/rules/src/model/events/heroes.ts) | A discriminated `GameEvent` union, including movement, combat, hazards, hero outcomes, reaction events, and combat-chain metadata. |
| [rules/view/events.ts](packages/rules/src/view/events.ts) | `projectEventsForRecipient` filters/redacts each batch for P1/P2/spectator. Some unauthorized events become `{ type }`, cast back to `GameEvent`; this is not a fully typed public-event contract. |
| [server/ws.ts](packages/server/src/ws.ts) | `sendRoomState` builds a recipient view. `broadcastActionResult` projects events separately for every socket. Accepted commands normally broadcast `roomState` **before** `actionResult`. |
| [server/store.ts](packages/server/src/store.ts) | Every journaled accepted action increments `room.revision`. `logIndex` is returned as `room.actionLog.length - 1`; the journal is bounded by `MAX_LOG_EVENTS`, default 5000. Recovery restores revision with an empty in-memory action log. |
| [web/ws.ts](packages/web/src/ws.ts), [web/store.ts](packages/web/src/store.ts) | WS result types and one Zustand gameplay store. `applyActionResult` rejects `logIndex <= lastLogIndex`, keeps 200 display events, and stores one `latestEventBatch`. Snapshot handling does not set an event baseline from revision. |
| [rules/core/rolls/combatVisualChain.ts](packages/rules/src/core/rolls/combatVisualChain.ts) | `chainId`, `visualBatchId`, `deferVisuals`, `isChainComplete`, and `combatVisualBatchReady` defer multi-target combat presentation until a rules chain completes. |
| [web/game/effects/visualResolution.ts](packages/web/src/game/effects/visualResolution.ts), [useVisualResolution.ts](packages/web/src/game/effects/useVisualResolution.ts), [combatPlayback.ts](packages/web/src/game/effects/combatPlayback.ts) | Chain buffering, attack/HP/death/removal scheduling, `eventDelaysMs`, initial baseline suppression, and a 1500 ms snapshot-only HP reconciliation fallback. |
| [web/game/effects/eventToEffects.ts](packages/web/src/game/effects/eventToEffects.ts), [BoardEffectsLayer.tsx](packages/web/src/game/effects/BoardEffectsLayer.tsx) | Generic DOM/CSS effects: beams, area highlights, movement trails, flashes, text, and board pulses. |
| [web/features/vfx](packages/web/src/features/vfx/README.md) | A registry, event mapper, hook-local queue, sprite-strip renderer, geometry helpers, procedural portals, reduced-motion support, and `/vfx-preview`. |
| [web/features/sfx/sfxPlayer.ts](packages/web/src/features/sfx/sfxPlayer.ts), [useBoardSfx.ts](packages/web/src/features/sfx/useBoardSfx.ts), [sfxEventMapper.ts](packages/web/src/features/sfx/sfxEventMapper.ts) | Shared `SfxPlayer`, master mute/volume, confirmed-event mapper, timers, and bounded dedupe. Playback currently constructs `new Audio(src)` per request. |
| [web/assets/sfx/registry.ts](packages/web/src/assets/sfx/registry.ts), [resolver.ts](packages/web/src/assets/sfx/resolver.ts) | Typed hero IDs/categories and fallback resolution. **Both `heroSfx` and `commonSfx` are empty**, so the sound scaffold currently resolves no registered gameplay files. |
| [web/components/Board.tsx](packages/web/src/components/Board.tsx) | Calls the visual scheduler and then the CSS, raster, and sound hooks with its released batch. VFX/SFX already share combat offsets. P2 is flipped. |
| [web/game/components/RightPanel/sections/BattleAbilityActions.tsx](packages/web/src/game/components/RightPanel/sections/BattleAbilityActions.tsx), [AbilityMenu.tsx](packages/web/src/game/components/RightPanel/AbilityMenu.tsx) | Ability selection/control presentation. These should receive local UI sounds only; `AbilityMenu` itself is a layout container. |

Actual hero IDs include `grand-kaiser`, `vladTepes`, `sans`, `asgore`, `riverPerson`, `jackRipper`, and `hassan`. Use these exact values. Boatman/Tralala belongs to `riverPerson`; there is no separate `boatman` hero folder. Rules ability IDs include `kaiserDora`, `kaiserCarpetStrike`, `sansGasterBlaster`, `asgoreFireball`, and `riverTraLaLa`; reuse exported constants when available.

## 2. Best source of audiovisual triggers

| Source | Rating | Repository-specific assessment |
| --- | --- | --- |
| Raw `roomState` changes for one-shots | **AVOID** | A snapshot represents current facts. It lacks action provenance and can arrive on join, reconnect, rebroadcast, or debug restore. |
| `actionResult.events` after acceptance and recipient projection | **RECOMMENDED** | Already delivered to all room sockets and already consumed by the effects pipeline. Strengthen identity/data rather than replace transport. |
| Event-log UI entries / accumulated `store.events` | **AVOID** for live playback | This is display history, truncated to 200 entries. It has no reliable per-event delivery identity and is reconstructed independently of presentation. |
| Raw server journal / persisted replay events | **AVOID** as live player input | Internal events may contain private information. Playback must pass the same projection boundary. |
| Dedicated recipient-safe gameplay contract within `actionResult` | **RECOMMENDED** | Make the existing stream explicitly typed and safe, adding a few missing events. A separate WS message type is unnecessary initially. |
| Local intent/button presses | **RECOMMENDED** for UI; **AVOID** for gameplay outcomes | Selection, tab/panel feedback, hover, and invalid local input can be immediate. Cast, projectile, hit, damage, death, teleport, or trap placement requires confirmation. |
| State-driven persistent badges/auras | **RECOMMENDED** | Mount from authorized current state, including snapshots, without playing an application sound. |

Recommended flow:

```text
rules action + server RNG
  -> accepted semantic events
  -> server stamps delivery identity once
  -> rules recipient projection
  -> actionResult with stream/revision and projected events
  -> web session gate + receipt dedupe + ordered presentation input
       -> confirmed step feedback: dice results / cast / reaction cues
       -> existing chain buffer + combatPlayback for resolved outcomes
            -> SfxPlayer / AudioManager backend
            -> BoardEffectsLayer + VfxLayer + visual HP/death playback

authorized roomState -> current units/statuses/ground markers/pending UI
local UI interaction -> UI sound + existing targeting preview
```

These are two presentation phases of the **same accepted events**, not two independent consumers that each play the same cue. Dice can reveal during an unresolved chain; damage/impact remains deferred where rules metadata requires it.

## 3. Smallest safe event-layer refactor

### Keep semantic ownership in rules

There is already a generic gameplay event stream. Do not introduce a parallel `PublicGameEvent` union with duplicate `unitMoved`, `attackResolved`, etc. Introduce a truthful **`ProjectedGameEvent` contract** beside the existing model/view types: it must represent full authorized payloads and deliberately nonpositional notices without pretending all raw fields exist.

Today `redactedEvent(type)` uses `as GameEvent`, while consumers see a nominally complete discriminated union. Missing fields happen at runtime. Preserve compatibility during migration, but presentation adapters must never interpret a type-only event as authorization to play a signature or infer a cell.

Rules owns payload semantics and the projector. The server owns the envelope and delivery metadata. Web owns the mapping from semantic event/ability/phase to sound/VFX keys. Rules should not know that `stakeTriggered` uses a PNG or a WAV.

### Recommended additions/enrichments

| Change | Problem solved | Owner and delivery |
| --- | --- | --- |
| Stable opaque `eventId` and monotonic batch `revision`, scoped by `streamId` | Duplicate delivery, log truncation, room recovery, delayed chain release | Server stamps accepted events once, before projection; passes IDs through projection and the existing WS result. |
| Explicit initial/resync snapshot baseline | Reconnect must not replay older one-shots | Server includes stream identity and baseline revision; web tracks connection hydration separately from live state updates. |
| Recipient-safe event-time anchors (`sourceCell`, `targetCell`, death position where allowed) | A later view can move, hide, kill, or transform a unit before an animation uses it | Rules creates semantic geometry at resolution; projection authorizes each field; web freezes one-shot placement. |
| Stable ability-use/combat correlation and `abilityId` on resulting combat where applicable | `abilityUsed` and hit results often arrive in different actions; Fireball is indistinguishable from a normal attack at final resolution | Rules assigns deterministic use/correlation IDs and carries them through pending contexts/attack outcomes; server adds delivery IDs independently. |
| `rollResolved` for actual random rolls | Many manual attacker rolls create the next pending phase without emitting their dice as a public result event | Rules emits result values with `rollId`, kind, player, dice/sides/sum as appropriate; projector limits recipients; web presents results immediately after receipt. |
| `snarePlaced` / `snareTriggered` (proposed names) | Jack placement has no positional event; trigger mutates trap/status state without a dedicated event | Rules emits on committed placement and actual trigger; owner-only placement and authorized revealed trigger arrive in `actionResult`. |
| Movement source/mode and correlation on existing `unitMoved` | Current event contains only `unitId`, `from`, `to`; a one-cell step cannot identify walking versus teleport versus drag | Rules adds provenance such as normal/rider/teleport/forced/boat/tralala and optional ability/use/movement ID. Reuse existing step events. |
| Optional movement completion/interruption notice | Tralala can end on target death or invalid continuation without a final `riverTraLaLaResolved` | Add only if loop lifecycle cannot be expressed by existing confirmed steps, reaction events, and safe current state. No full future route needs broadcasting. |

Do not start with a generic event bus, event sourcing rewrite, server FX engine, or a second gameplay journal. A generic `damageApplied` wire event is **optional later**, not required for the first implementation. Normalize existing damage-bearing events in web first; add explicit HP snapshots for paths that cannot be represented accurately. If a universal damage event is adopted, designate it as the sole damage cue source so `attackResolved` does not double-play damage.

`chainId` groups a resolution; it is not an event ID and not sufficient for dedupe. `rollId` identifies a pending roll; it is not a cast/projectile identity.

### IDs must preserve privacy and survive buffering

Use opaque server-assigned IDs, stored with the accepted action and reused for rebroadcast. Do not generate a new UUID on each call to `broadcastActionResult`. Do not use a browser timestamp as identity. Do not consume deterministic gameplay RNG for presentation/delivery IDs.

Avoid exposing a raw global event ordinal in the wire ID: skipped private events could reveal hidden event counts. An original ordinal may remain internal. Opaque UUIDs assigned once and persisted are a straightforward option. A keyed stable derivation is acceptable only if its key/lifecycle survives recovery and does not reveal ordinals.

Keep IDs unchanged when `visualResolution` concatenates deferred events and removes aggregate bookkeeping. Currently it creates a new batch under the final action's `logIndex`; deriving IDs from that final batch index and the new event-array position would rewrite historical identity.

## 4. Hidden information and recipient projection

### Existing safeguards

`makePlayerView` omits unseen live enemy units; last-known positions are separate. Friendly units receive the owner view. `collectPlayerStakeMarkers` includes own stakes and revealed stakes; spectator stakes include revealed markers only. `makePlayerView` explicitly returns `events: []`, and `makeSpectatorView` does too. Snapshot event history therefore does not currently drive playback.

`getVisiblePendingRollForPlayer` returns full pending data only to the rolling player and filters sensitive target lists. `projectPendingDecision` gives opponents/spectators allowlisted status descriptions rather than the private pending context. `server/ws.ts` limits detailed pending-roll presentation to its owner.

`projectEventsForRecipient` already handles `stakesPlaced`, hidden movement, Chikatilo marks, reactions, and river transport. Nonowners receive a nonpositional `hiddenSetupCompleted` for stakes. These boundaries should be extended, not bypassed.

### Required rules for the new pack

1. **Filter before transmission.** A browser visibility check is only a defensive check; it cannot protect already transmitted secrets.
2. Choose server-side **per-recipient projection**, rather than sending full events with `visibility: "ownerOnly"` and expecting web to obey the flag. Internal visibility metadata can help rules, but it must not carry secrets to excluded recipients.
3. Stake placement coordinates/placement sound: owner only. Opponent may retain the existing nonpositional completion notice; no placement bursts or location-based audio.
4. Jack placement coordinates: owner only. A trigger cue is public only to recipients entitled to know the trapped unit/cell. The current opponent view does **not** expose all revealed Jack markers: `jackTraps` is filtered to owner; spectator `jackTraps` is empty. Add the safe trigger event without widening all trap-state access.
5. Hassan selection: owner only, including targets, candidate cells, and target-count-dependent sounds/timing. A visible source does not authorize the source's secret payload.
6. Stealth entry: owner's authorized unit can receive entry feedback on confirmed success. Do not locate a vanished enemy by its last-known marker. Reveal feedback requires an authorized newly visible position. Suppress hidden source sounds as well as images.
7. Do not use `lastKnownPositions` as current one-shot targets. Do not pan sounds toward hidden positions, or reveal hidden victims through per-target sound counts, beam ticks, durations, or effect variants.
8. Recheck authorization when releasing a delayed cue. If a target becomes hidden before playback, suppress its unit-attached visual. A historical cell effect can remain only when the projector explicitly authorized that public historical location; do not follow a hidden unit.

### Projection gaps that matter before adding fields

- The public allowlist currently forwards several events unchanged, including `attackResolved`, `unitDied`, `stakeTriggered`, `bunkerEntered`, and `forestActivated`. Adding position/target/ability data to these types without updating projection could create leaks.
- `aoeResolved` filters unit lists and damage/roll maps and may remove source IDs, but retains center/radius. Keep public blast geometry where the rules authorize it; do not automatically attach hidden caster coordinates.
- `buildPendingAoEPreview` currently returns caster ID, ability ID, center, and radius without recipient-specific checks. Both player and spectator views use it. A committed public blast area may be appropriate to expose, but its hidden caster association is a separate permission: audit/remove unauthorized caster IDs even when center/radius remain public. Secret targeting requires recipient-specific filtering before using this preview for a telegraph.
- The projector uses final `GameState` for visibility. A hidden unit that moves and reveals within one action can end visible, causing earlier movement events to be forwarded with their old `from`/`to`. Event-time field authorization is needed if that earlier path was secret. Conversely a newly hidden unit may suppress previously public data. Document/test the intended semantics rather than simply checking final visibility.
- Dead units are treated as visible by the projector. Adding a death coordinate requires an explicit public-death policy; do not infer that every previously hidden death location is authorized.
- Raw gameplay-event redaction preserves chain metadata. FX must not use type-only bookkeeping to infer a private action, location, target count, or effect duration.

**RECOMMENDED:** represent an unauthorized event as omitted or an explicitly typed safe notice. Never use an asset manifest's `PUBLIC` label as event authorization. Manifests describe artistic intent, not network permissions.

## 5. Reconnect, snapshots, duplicate delivery, and React safety

### Concrete current defects/limitations

1. **Journal truncation:** after the bounded log reaches its maximum, subsequent `logIndex` values remain `maxLogEvents - 1`. `applyActionResult` then rejects all further batches. This affects event-driven presentation and logs regardless of the new assets.
2. **Recovery:** `restoreGameRoom` restores a nonzero revision with `actionLog: []`; new `logIndex` values restart from zero. Revision is the available durable ordering mechanism.
3. **Missing baseline:** disconnect resets `lastLogIndex` to -1 and clears the current view/batch. Initial snapshot does not establish a revision watermark. Existing hooks suppress their initial batch, but this is not a transport-level reconnect contract.
4. **Session key:** live Board receives `effectSessionKey={roomId}`. Changes of role/recipient within the same room should also reset queues and visibility snapshots.
5. **One latest batch:** React effects consuming only `latestEventBatch` can miss intermediate batches when several WS results arrive before render/effect processing. This is a delivery-risk observation, not a measured production loss in this audit.
6. **Debug replay:** `replayLastEffects` writes `Date.now()` into `latestEventBatch.logIndex`. That creates a presentation index unrelated to the server sequence and can poison hook watermarks. Put preview/replay identity in a separate presentation namespace.

### Recommended minimal protocol shape

Conceptual addition to the existing messages, not an implementation in this task:

```ts
// Envelope fields are server-owned. Payload is rules-owned and recipient-safe.
type FxDeliveryEvent = {
  eventId: string;             // opaque; stable across duplicate delivery
  event: ProjectedGameEvent;  // proposed typed projection of existing events
};

type AcceptedEventBatch = {
  streamId: string;
  revision: number;           // existing accepted-action revision
  events: FxDeliveryEvent[];
};
```

This can be represented as event metadata instead of wrappers if that makes migration smaller, provided projection, persistence, and buffering preserve it. Keep one canonical representation. Use the existing match identity for the active stream; before a match has an identity, use a stable room-instance identity. A new match/debug rollback must explicitly start a new stream; reconnect to the same recovered match must not. Expose that identity consistently in snapshot/result messages, which currently lack a shared match stream field.

An additional global `eventSeq` is unnecessary initially: **batch revision + stable opaque event IDs** solves the observed problems. Revision gaps are valid (no visible events, accepted non-FX actions). Do not demand a contiguous public event sequence.

### Hydration algorithm

1. On join/reconnect/recipient change, set `awaitingBaseline`, invalidate old connection callbacks, cancel SFX timers/loops, clear VFX and unfinished local presentation plans.
2. On the **first snapshot for this hydration**, bind `streamId` and recipient. Treat its revision H as already observed history. Render persistent current effects immediately and silently. Ignore any old one-shot batch at revision <= H.
3. Process later live action batches with revision > H in WS order. Deduplicate at receipt and enqueue every accepted batch, independently of React render cadence.
4. A normal live `roomState` update does **not** advance the consumed-event watermark merely because it contains revision R. The server sends this update before the corresponding result at R; using every snapshot as a baseline would drop every valid live result.
5. Pair live result R with authorized state R. If ordering changes in the future, buffer until the matching state arrives; do not resolve coordinates from an unrelated newer snapshot. Current WS ordering usually provides the snapshot first, but React batching can collapse views.
6. Preserve separate watermarks for received batches and scheduled cues. Deferred events have already passed receipt dedupe and remain eligible for first playback when their chain completes. Do not reject them because their original revision is below the latest received revision.
7. On reconnect inside a chain, discard pre-disconnect one-shots and build from the baseline. Later truly new events may play; a completion marker must not fetch/replay prior chain history. Missing portions should degrade to safe current-state presentation.
8. On loss of focus/backgrounding or long scheduling delays, expire stale one-shots rather than play a catch-up burst. Mute/disabled FX still consume event identities. Unmute does not replay muted history.

No server retransmission history or resume cursor protocol is needed just for cosmetic effects. Losing a one-shot while disconnected is preferable to replaying history. Persistent state always reconciles.

### Dedupe responsibilities

Current VFX caps: 64 active instances and 512 processed request IDs. SFX also remembers at most 512 request IDs. These are useful limits to retain, but their synthetic IDs depend on log index and event-array position.

At ingress, remember received stable IDs/batch revisions. At presentation dispatch, claim each semantic cue once and fan it out to both sound and visual outputs. A cue can have several parts, e.g. primary/accent/hit variants; derive child keys such as `eventId:impact:primary`, scoped by stream. Audio and VFX must not compete for a single destructive consumer flag.

Bound recent-ID memory, and retain the monotonic receipt watermark so an old replay stays rejected after its ID is evicted. Keep allowed deferred events in their chain queue separately. Do not use content hashing alone: two legitimate attacks can produce identical payloads.

Distinguish duplicate **delivery** from duplicate **execution**. A WS retry that the server executes twice produces two new revisions/IDs. FX dedupe cannot repair that rules outcome; command idempotency is a separate gameplay concern. Existing stale-socket checks and pending-roll ID validation should remain. Do not suppress legitimate independent actions just because their sound key matches.

### React and store design

**RECOMMENDED:** move ordered receipt/dedupe and playback lifecycle into a lightweight session coordinator outside React render, attached once to the gameplay connection/store lifecycle. Continue using existing React hooks as display subscriptions/adapters. Cleanup must be safe under remount/StrictMode; UI components do not dispatch gameplay sounds from render.

Do not play sound in an HP comparison, a whole-state `useEffect`, or a status-mount effect. Current Board contains state-comparison animations for visual variants/bone expiry; do not attach one-shot audio to these, and audit their snapshot-only behavior when replacing them with event cues.

Keep the current Zustand gameplay store. A second global `fxStore` is unnecessary. Audio buffers, nodes, timers, dedupe sets, and loop handles are nonreactive manager data. VFX instance lists need a React subscription; hook-local state is sufficient for a single Board, or one small external observable queue if the coordinator owns it. Only settings such as mute/volume require reactive UI state; expose a small preferences store later if several controls need it. Do not store `AudioContext` or decoded buffers in Zustand.

## 6. Audio architecture and registry

### Options

| Option | Rating | Reason |
| --- | --- | --- |
| Existing `new Audio(src)` for every sound | **ACCEPTABLE** as a small prototype | Very simple; already implemented. No explicit fetch/decode cache, voice lifecycle, preload readiness, or loop cancellation. Does not meet a strict low-latency target by itself. |
| Cached/preloaded HTMLAudioElement pool | **ACCEPTABLE** | Small improvement if measured latency is good; overlapping voices require a pool/clones, and preloading remains browser-controlled. |
| Small custom manager using native Web Audio buffers | **RECOMMENDED** | Pack mostly contains short samples; cached decoding, overlapping voices, scheduled starts, gain categories, and explicit stop are useful here. No extra dependency required. |
| Howler or another audio library | **ACCEPTABLE** only if demonstrated browser requirements justify it | Current requirements are small enough for native APIs. No library is currently installed. |
| Direct imports/play calls throughout hero components | **AVOID** | Scatters naming/fallbacks, ties effects to local UI and component lifecycle, and defeats common dedupe/scheduling. |

Evolve `features/sfx/sfxPlayer.ts` behind its existing shared API instead of installing a parallel audio service. It may delegate to a new `AudioManager.ts`; retain the existing injectable player boundary for tests. Own a single `AudioContext`, decoded-buffer cache, in-flight load cache, bounded active voices, and optional loop handles. For short sounds, buffer playback offers precise control; resume/create the context from a user gesture. [MDN Web Audio guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).

Add category routing **now**: UI and SFX gains feed master gain. This is a small internal choice that avoids remapping later. Master mute and volume already exist; expose basic user controls with the first audible release. Separate UI/SFX sliders and persisted preferences can follow during polish. Persistent status VFX does not imply persistent status audio; default to silent auras. Add loop support only for specific approved ambience/charge needs and stop/replace it by keyed session/use handle.

### Central sound registry

Extend the existing registry/resolver. Retain its naming convention:

- `common.combat.hit`, `common.combat.miss`, `common.combat.diceRoll`;
- `common.ui.buttonClick`, `common.movement.teleport`;
- `hero.grand-kaiser.abilities.kaiserDora`;
- `hero.asgore.abilities.asgoreFireball.cast`, `.travel`, `.impact`;
- `hero.vladTepes.abilities.vladStakes.place`, `.trigger`;
- `hero.sans.abilities.sansGasterBlaster.charge`, `.fire`.

These are **proposed registry keys** following current typed categories, not names claimed to exist in today's empty maps. Use `SoundDefinition` values rather than bare URLs when adding variants/category/gain/loop metadata. Prefer a literal registry with `satisfies` and derive a closed key union from it; today's trailing `${string}` type does not catch key spelling mistakes.

Actual import/URL candidates, relative to `packages/web/src/assets/`:

| Key/use | Existing path |
| --- | --- |
| Common hit variants | `sfx/common/combat/hit01.wav` through `hit04.wav` |
| Miss variants | `sfx/common/combat/miss01.wav` through `miss03.wav` |
| Dice variants | `sfx/common/combat/diceRoll01.wav` through `diceRoll04.wav` |
| Local button feedback | `sfx/common/ui/buttonClick01.wav` through `buttonClick03.wav` |
| Dora signature | `sfx/heroes/grand-kaiser/abilities/Dora.wav` |
| Forest committed activation | `sfx/heroes/vladTepes/abilities/vladForestCast.wav` |
| Stakes placement/trigger | `sfx/heroes/vladTepes/abilities/vladStakesPlace01.wav`, `vladStakesTrigger01.wav` and numbered variants |
| Gaster charge/fire | `sfx/heroes/sans/abilities/sansGasterBlasterCharge.wav`, `sansGasterBlasterFire.wav` |
| Fireball phases | `sfx/heroes/asgore/abilities/asgoreFireballCast.wav`, `asgoreFireballTravel.wav`, `asgoreFireballImpact01.wav`, `asgoreFireballImpact02.wav` |
| River movement | `sfx/heroes/riverPerson/abilities/riverBoatMove01.wav` through `riverBoatMove03.wav` |
| Tralala activation | `sfx/heroes/riverPerson/phantasms/riverTraLaLaActivate.wav` |

Variants must be explicit URL arrays. Choose once per cue using a local hash of stable cue identity, or local randomness independent of rules RNG; a rerender must not choose/play again. Primary/accent VFX pairs are simultaneous components, not random variants.

Fallback: exact hero/phase -> explicitly approved common semantic fallback -> silence. Missing assets should produce one development diagnostic, never break gameplay. No fallback may turn a redacted event into audible gameplay. Use registry imports or literal `new URL(..., import.meta.url)`, not arbitrary runtime filesystem strings. `.mp3.mpeg` legacy clips need explicit Vite URL handling (`?url` if required) and response MIME/browser decode checks; do not rename them in this task.

### Preloading and low latency

Fetch core URLs once, decode with `decodeAudioData`, cache buffers, then create a fresh source node for each one-shot. The decode API accepts complete file data and resamples to the context rate. [MDN decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData).

`new Audio()` alone does not prove the sound is ready; `preload="auto"` is a browser hint. [MDN preload](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preload).

For hit, dice, buttons, and common cast feedback, complete fetching/decoding before expected interaction. Start roster preloads when the match roster is known. Do not block gameplay on optional assets. If unavailable at cue time, use a ready fallback or skip the cue; do not let a completed asynchronous load play an old hit half a second later. Buffer scheduling must share the presentation clock and check session/expiry before starting. Do not promise zero latency on an untested device.

## 7. VFX architecture and registry

### Keep DOM/CSS rendering

The current renderer is adequate for this pack. No Pixi, Phaser, WebGL engine, or new canvas scene is recommended. Reuse `VfxLayer`, `VfxSprite`, `vfxGeometry`, and `BoardEffectsLayer`.

Use conceptual sublayers rather than four unrelated frameworks:

| Layer | Ownership / role |
| --- | --- |
| Ground telegraphs | Existing targeting preview plus a modest ground overlay; current authorized preview/pending state, not a one-shot queue. |
| Board movement/projectile/impact | Extend existing `VfxLayer`; board-local cell, area, ray, and ordered segment placement. |
| Unit statuses | Render persistent aura/badge from current projected unit state, ideally near current token markup or a small `UnitStatusVfx` component. |
| Screen/UI | Optional lightweight component near GameShell when an actual screen cue is needed. Do not clip it inside Board or add it speculatively. |

Separate visual responsibilities are useful; separate global stores are not necessary. Keep pointer events disabled on decorative layers. Selection/pending controls remain usable while presentation runs; the server remains authoritative.

### Registry metadata

Extend `features/vfx/vfxRegistry.ts`, which already has asset type, duration, default placement, scale, frames/fps, blend mode, opacity, provenance, and reduced-motion handling. Add typed geometry and primary/accent composition where required. Existing `VfxEffectId` is a closed camelCase union; maintain existing IDs and add descriptive keys or aliases rather than renaming everything. Semantic new keys may be namespaced, e.g. `hero.grand-kaiser.kaiserDora.impact`, `hero.sans.sansGasterBlaster.beam`, `hazard.stake.trigger`.

Suggested entry fields: URL(s), asset type, frame count/size, numeric duration, anchor/placement, layer, dimensions in cells, beam thickness/axis, optional loop/static frame, opacity/blend, reduced-motion mode, and approved fallback. Keep rules ability IDs in the event mapper. No pixel dimensions in hero rules definitions.

Actual candidates relative to `packages/web/src/assets/`:

| Effect | Path and geometry |
| --- | --- |
| Dora impact | `vfx/heroes/grand-kaiser/dora_impact_primary.png` + `dora_impact_accent.png`; 3x3 |
| Carpet impact | `vfx/heroes/grand-kaiser/carpet_impact_primary.png` + `carpet_impact_accent.png`; 5x5 |
| Bunker active | `vfx/heroes/grand-kaiser/bunker_status.png`; static 1-cell perimeter |
| Forest eruption | `vfx/heroes/vladTepes/forest_eruption_primary.png` + `forest_eruption_accent.png`; 3x3 |
| Stake trigger | `vfx/heroes/vladTepes/stake_trigger.png`; revealed cell |
| Gaster cannon/beam | `vfx/heroes/sans/gaster_cannon.png`, `gaster_beam_primary.png` + `gaster_beam_accent.png`; source plus full selected ray |
| Fireball | `vfx/heroes/asgore/fireball.png`; directional projectile with phased use |
| Boat/drag | `vfx/heroes/riverPerson/boat_start_pickup.png`, `boat_travel.png`, `boat_drop.png`, `tralala_primary.png` + `tralala_accent.png` |
| Stealth entry/reveal | `vfx/status/stealth_enter.png`; same bytes, distinct triggers/permissions |
| Generic combat | `vfx/combat/combat_hit_light.png`, `combat_hit_heavy.png`, `combat_miss.png`, `unit_death.png` |

Per-folder `manifest.json` is currently documentation (`fate_asset_library_documentation_v1`), not a runtime schema. Fields such as duration, fps, geometry, and end conditions contain prose; primary/accent entries share concept IDs, and stealth has a shared-file alias. Do not cast this JSON to `VfxDefinition`. Curate numeric runtime definitions in the registry, retain the manifests as provenance, and validate registry dimensions/frames against them. A build-time generator can follow if manual maintenance becomes costly.

### Renderer gaps exposed by generated strips

- Current line placement paints `definition.asset` as a repeated static background, with fixed 7 px thickness and 42 px background size. It does not animate a sprite strip through its frames. Add an animated beam sprite inside a rotated geometry wrapper; scale thickness in cells and source-frame width along the ray.
- Current path placement builds up to ten segment lines plus endpoint sprites. This is a trace approximation; it does not animate a projectile or token along the authoritative path. Use ordered step interpolation where needed, driven by confirmed segments.
- `.vfx-area` sets `animation-name: vfx-area-wash`, overriding the strip animation list from `.vfx-sprite-strip`. Geometry/envelope must be on an outer wrapper while frame stepping stays on an inner sprite, or compose the animations explicitly.
- `VfxLayer` uses a bounding box for areas. At the edge, shrinking a clipped 3x3 to a 2x2 bounding box distorts the intended centered artwork. Keep the full logical square and clip it at the board edge; use per-cell effects/masks for sparse or nonrectangular regions.
- One-shot `placement="unit"` follows the latest unit position before falling back to its saved source cell. Impact/death should use the authorized event-time cell; persistent auras should follow current unit state.
- Generated Fireball is a combined 17-frame strip described as gathering/travel/hit-or-miss. Metadata gives total duration but no numeric frame ranges for outcome phases. Inspect frames and author playback slices/neutral travel plus hit accent; do not play a baked hit bloom on a miss.
- Persistent loops are not represented by the current finite VFX queue. Keep them out of expiry queues; use current-state components.

## 8. Board-relative geometry, orientation, and stacking

### Coordinate conversion

Reuse `cellToBoardPoint`, `cellToBoardRect`, `cellsToBoundingBox`, and `lineBetweenCellsToCssTransform` in `features/vfx/vfxGeometry.ts`. Make this the shared helper for CSS effects too; `BoardEffectsLayer` currently duplicates conversion formulas.

`Board.tsx` gets `cellSize`, `labelSize`, and `boardPixelSize` from `useBoardFit` with a ResizeObserver. The overlay root is already offset by `(labelSize, labelSize)`. Compute all FX positions inside that root; do not repeatedly measure every cell or include coordinate gutters twice.

For N=9, size s, logical `(col,row)`:

```text
P1: x = (col + 0.5) * s;       y = (N - 1 - row + 0.5) * s
P2: x = (N - 1 - col + 0.5)*s; y = (row + 0.5) * s
```

Rect origin is the same formula without `+0.5`, width/height s. P2 flips both axes, exactly as the current Board. Current row labels are **0..8**, not 1..9: a displayed C3 is `(2,3)`, at P1 center `(2.5s,5.5s)` and P2 center `(6.5s,3.5s)`. If a future notation uses one-based rows, convert notation only at the input boundary. Events keep numerical logical coordinates.

Keep queued positions in logical cells so resize/zoom recalculates geometry without rebuilding event identity. For a screen overlay only, add the actual board-grid bounding rect minus the screen overlay's origin; do not use the scroll wrapper bounds as the grid origin.

### Proposed conceptual layers

| Board-local z | Content |
| --- | --- |
| 0 | Existing field/background |
| 5 | Low-opacity ground telegraphs, visible hazard bases |
| 10 | Current row/cell/token presentation |
| 20 | Persistent unit aura decorations |
| 30 | Movement trails, projectiles, beam bodies |
| 40 | Impact accents |
| 50 | HP, status badges, floating outcome text |
| 60 | Selection rings, valid-target outlines, pending/reaction outlines and direction preview |
| App modal tokens | Existing pending roll modal, sheets, menus; outside local Board stacking |

These are **proposed layer values**, not claims about the current CSS. Current rows use `relative z-10`; selected/focused cells have their own z values; cell child markers/statuses include z-20/z-30. `BoardEffectsLayer` is z-30 and `VfxLayer` z-40 in an absolute overlay sibling. Thus cell-local z-30 cannot lift a marker above a sibling overlay because it is inside the row stacking context. Broad impacts can cover target highlights/HP even if the highlight has a large local z-index.

Minimal improvement: create an isolated board-grid stacking context, give the overlay root explicit layer ownership, and lift important target outlines/text to dedicated sibling layers. Keep a single clipping boundary for board-space effects. Existing `VfxLayer overflow-hidden` clips beams/oversized effects; `BoardEffectsLayer overflow-visible` may spill text. Preserve purposeful clipping and avoid letting `mix-blend-mode` interact with unrelated page UI. Visual-check both themes and mobile sizes.

## 9. AoE preview, projectiles, rays, and movement

### AoE phases

Keep `selectBoardPreview`, `buildActionPreview`, `buildAbilityPreview`, `buildPendingPreview`, and Board's existing highlight/preview-line rendering as the targeting authority. Preview comes from the viewer's local selected/hovered target and authorized legal/pending data. It is allowed immediately and must not enqueue a resolution sprite/sound.

After acceptance, public ground telegraphs may use projected `pendingAoEPreview`. They are current-state warnings, not repeated cast effects. Final impact comes from completed `aoeResolved` plus the combat scheduler. A 3x3 square is radius 1; 5x5 is radius 2. Preserve full-size centering and clip boundaries, as above.

**Carpet Strike differs from the requested hypothetical preview:** current rules automatically trigger at sufficient charges and choose center with server 2d9. There is no local freely chosen 5x5 center. Show readiness/unknown-center UI before RNG, then only the confirmed `carpetStrikeCenter`/projected pending area. Do not invent a target-selection action.

Schedule a single aggregate area impact near the start of completed combat playback, then target-specific hit/HP/death phases. Do not blindly use an `aoeResolved` offset at the end of the event list: current per-target attacks can precede the aggregate event, producing an explosion after damage. The scheduler should use its geometry as completed-chain presentation metadata and place the launch/impact deliberately.

Avoid double damage flashes: `effectsFromEventBatch` already suppresses aggregate target flashes when matching `attackResolved` exists. Retain this rule across audio and new raster effects. For direct AoE damage without per-target attack events, such as Jack Covering Tracks, normalize `damageByUnitId` into HP playback once; current `combatPlayback.damageFromEvent` does not handle this aggregate damage path.

### Source -> target projectiles

Convert authorized event-time source/target cells to centers. Animate a small sprite in an outer translated/rotated wrapper; frame stepping remains in the inner sprite. Use launch -> travel -> hit/miss -> damage, on one shared presentation clock. Numeric duration may depend on visible distance within a sensible bounded range. Aim hit audio at the impact offset rather than the current generic hardcoded +180 ms in `sfxEventMapper`.

Required data: accepted ability-use ID, source ID/cell, target ID/cell, outcome, damage/HP values, and event identity. Fireball currently has `abilityUsed { unitId, abilityId }` followed by generic attack pending context and later `attackResolved` without ability/roll/use ID or coordinates. Safe visible coordinates can supply a short-term anchor, but cross-action ability correlation is an actual gap. Do not label every Asgore attack as Fireball.

### Gaster Blaster: source -> board boundary

Current `applySansGasterBlaster` takes selected target/line/center, `collectSansLineTargetIds` collects all enemy units along the full Mettaton-style line, and queued combat eventually emits `aoeResolved` with `abilityId=sansGasterBlaster`, selected point as `center`, and `radius=0`. Radius zero means **ray metadata here**, not a one-cell blast.

For a visible source S and selected point T, derive `d=(sign(T.col-S.col), sign(T.row-S.row))`, checking cardinal/diagonal validity. Extend along d to the last in-bounds cell. To hit the literal board boundary, extend another half-cell to that boundary; for diagonals both coordinates reach their boundaries together. Rotate using converted screen endpoints so P2 direction is correct. The beam traverses allies and every enemy on the selected ray and ends at the board edge, not the first target.

Completed `aoeResolved` provides selected point and safe target lists; a projected visible source position often supplies the remaining geometry. **Acceptable MVP:** render only when both authorized anchors are available. **Recommended enrichment:** event-time source cell and direction/end geometry so playback cannot drift with newer state. Charge facing before completion needs confirmed selection/direction, which `abilityUsed` alone lacks. Do not transmit future hidden target IDs or infer hidden victims from beam hit counts. Per-defender impact is based only on projected outcomes; the ray itself is public geometry.

### Movement

Use existing authoritative `unitMoved { unitId, from, to }`. For ordinary straight movement, interpolating those confirmed endpoints is acceptable. The CSS mapper currently infers teleport from distance/path length; this is an approximation and should not determine important ability semantics.

- Trickster teleport: require confirmed movement with a teleport mode/provenance, render departure/arrival; no walking trail inferred from distance.
- Rider: retain actual reached steps/ordered path, including interruptions. Add path/provenance where an existing resolver emits only final endpoints. Do not reconstruct a hazard-interrupted route from final state.
- Forced movement: use confirmed `intimidateResolved`, collision displacement, or enriched `unitMoved` with cause. Do not turn a forced move into the unit's voluntary ability sound.
- Boat: existing `riverBoatResolved` supplies river/drop destinations but not original cells; current mapper falls back to prior visible positions and a straight line. Reuse actual accompanying move events and add start/path context only where missing.
- Tralala: `actions/movementActions/reactions.ts` emits controller/carried-unit `unitMoved` steps up to each reaction, `reactionOpportunity`, `reactionChoiceResolved`, and `reactionMovementResumed`. Render only reached steps; pause at the confirmed reaction cell, then resume from subsequent confirmed steps. Never animate the entire selected future route before reactions resolve.

The current Tralala VFX mapper reacts only to final `riverTraLaLaResolved` and reconstructs a start-to-end trace. That loses pauses and is insufficient for interactive drag playback. Replace this mapping with step/reaction handling; retain final drop feedback but suppress a second full-route replay. Group carrier/passenger steps by movement ID so a shared boat does not emit two movement sounds per cell. Coalesce many steps in one batch into one short movement cue/segment animation.

Loops, if approved, pause/stop around pending reactions and terminate on target/controller death, stake interruption, invalid drop, cancellation, session change, or permission loss. Do not assume every interruption emits `riverTraLaLaResolved`: there are early exits in `continueReactionMovement`. Snapshot-safe state reconciliation can stop a loop; it must not start new one-shot movement.

## 10. Dice and major ability walkthroughs

### Manual dice sequence

Current `resolvePendingRoll` validates pending ID/player and executes server RNG. `rollRequested` requests a phase; it contains no rolled values. Pending dialogs also include **choices**, not just random rolls.

Recommended sequence: local Roll click -> optional `common.ui.buttonClick` -> server RNG -> authorized result with actual dice -> dice reveal/roll sound -> next pending phase presentation. The server advances immediately; web may hold only its local presentation briefly, with inputs safely disabled if needed. Do not delay the rules engine or require animation acknowledgments. Do not synthesize a client result.

Existing `initiativeRolled`, `carpetStrikeCenter`, `carpetStrikeAttackRolled`, some hero result events, and final `attackResolved` expose dice. But Dora/Forest attacker rolls, for example, store dice in pending context and advance with no result event; opponents lack that private context, and completed combat may arrive much later. Add `rollResolved` for the requested consistent sequence, emitting once per true RNG phase. Use `attackerRollIsNew` to avoid repeating shared AoE attacker dice. Choice dialogs get UI sounds, not dice audio.

One detail in asset documentation conflicts with this requested behavior: sound inventory suggests local dice audio on Roll activation. The user's requirement here takes precedence: actual dice/result audio waits for the authoritative result; only an ordinary UI click is immediate. Documentation suggestions about triggering from state transitions are likewise not a reason to replay one-shots on snapshots.

### Kaiser — Dora (`grand-kaiser`, `kaiserDora`)

1. **Local:** enter existing Dora targeting mode; use legal Archer-line center preview and a 3x3 CSS area. Selecting a cell can play UI feedback only.
2. **Authoritative:** `applyKaiserDora` validates center/range/cost, spends charges/slots where applicable, emits `abilityUsed` and resolves AoE reveal/target collection. The center cannot pass through a blocking earlier enemy under the current Dora line helper.
3. **Authoritative pending:** nonempty AoE requests `dora_attackerRoll`, one shared 2d6 attack, then ordered defender rolls/berserker choices. Empty area emits immediate `aoeResolved` with no manual attack roll.
4. **Step presentation:** committed cast cue may play at acceptance if safe; a public confirmed ground warning can use pending preview. Dice result waits for server values; add the missing result event.
5. **Resolved presentation:** chain completion releases attacks and `aoeResolved`. Schedule 3x3 artillery/impact before its HP changes, then per-target hit/miss, HP tween, actual death/removal.
6. **Assets:** primary/accent Dora impact strips and legacy `Dora.wav`. The WAV lasts 5 seconds; audition its firing/impact timing before deciding its cue. There is no dedicated new Dora launch-versus-impact pair to assume. A generic impact sound can be used if appropriate; do not duplicate the full signature on each target.

### Vlad — Forest of the Dead (`vladTepes`)

1. **Authoritative first:** `activateVladForest` consumes nine oldest owned stakes and emits `forestActivated { vladId, stakesConsumed: 9 }`, then requests `vladForestTarget`. This happens **before center selection**, unlike the hypothetical order in the request.
2. **Local/owner:** choose center through existing pending target UI; show a 3x3 preview without opponents' secret cells. Play at most a UI selection sound locally.
3. **Authoritative center:** `resolveVladForestTarget` validates center, reveals/collects AoE targets, sets `pendingAoE`, and requests `vladForest_attackerRoll`; empty AoE resolves immediately. Use only the confirmed public area for ground warning.
4. **Authoritative RNG:** shared 2d6 attacker roll, ordered defender rolls/choices. Add roll-result delivery for timely dice presentation.
5. **Resolved:** completed `aoeResolved` with radius 1 drives one Forest eruption and its audio, then per-target damage/death. Hit targets gain `movementDisabledNextTurn`; that indicator is state-driven, not repeated forest eruption.
6. **Assets:** `vladForestCast.wav`, Forest primary/accent strips. Do not replay individual removed stakes, and do not show their secret consumed positions. Initial activation has no center and must not place the eruption somewhere guessed.

### Sans — Gaster Blaster (`sans`, `sansGasterBlaster`)

1. **Local:** show ability readiness/selection and selected full Archer ray using authorized preview geometry. No cannon fire on click.
2. **Authoritative:** `applySansGasterBlaster` validates chosen point, spends charges, emits `abilityUsed`, and queues all enemy targets on the piercing line. A no-enemy ray still returns `aoeResolved` with selected point and radius 0.
3. **Confirmed charge:** play charge once at acceptance, at a visible source. Or stage it at the beginning of completed playback to preserve today's deferred-chain behavior. Immediate direction-facing charge needs confirmed selected direction enrichment; do not borrow an opponent's private pending context.
4. **RNG:** existing `tricksterAoE_attackerRoll` and defender phases resolve the attack. Results/dice are confirmed; proposed `rollResolved` supplies timely reveals.
5. **Completed playback:** one cannon/beam fire to the board boundary, then authorized defender hit/miss/HP phases. Do not restart the beam at every defender or stop it at the first one.
6. **Persistent:** Sans curse/bone field readiness/status is current projected state; Gaster beam is a finite one-shot. Charge must not remain indefinitely while manual decisions are pending.

### Asgore — Fireball (`asgore`, `asgoreFireball`)

1. **Local:** target through the existing Archer-style ability preview; optional UI click/selection feedback.
2. **Authoritative:** `applyAsgoreFireball` checks visible enemy, Archer targeting and costs. `commitAbilityCost` emits ability use; pending rolls use the generic `attack_attackerRoll` context with range ignored after validation.
3. **Gap:** current context does not tag this attack with Fireball's ability-use identity, and final `attackResolved` has no ability ID. Add that correlation rather than retaining an unreliable last-button-click flag.
4. **Confirmed cast:** use safe source and accepted target association for the cast sound/source accent. Dice wait for authoritative result. Do not pre-play hit/explosion.
5. **Resolved:** schedule travel at the appropriate attack offset, hit bloom/audio only on hit, faint miss termination on miss, then HP tween and death. Cast/travel/impact share one use ID but are distinct cues.
6. **Asset caveat:** the 17-frame Fireball strip needs explicit safe phase handling so miss does not display hit petals. No conversion is required for this review.

### River Person / Boatman — Tralala (`riverPerson`, `riverTraLaLa`)

1. **Authoritative pending setup:** `applyRiverTraLaLa` requests target choice, then destination, then drop choice. These requests do not yet spend the ability. Local selections are previews.
2. **Authoritative commit:** only valid final drop selection calls `commitAbilityCost`, emits `abilityUsed`, and creates `pendingReactionMovement` with the path. Play activation here, not on opening the first choice dialog.
3. **Reached segments:** `continueReactionMovement` moves carrier and enemy through `unitMoved` steps, checking stakes and reaction opportunities. Play grouped travel feedback only for those reached steps.
4. **Pause:** `reactionOpportunity` / `reactionChoice` presents attack-or-pass. Hold the movement visual at contact; fade/pause travel audio. No guessed continuation.
5. **Attack/pass:** confirmed `reactionChoiceResolved`; attacks use authoritative combat roll/defense and post-hit/death choices. Impact presentation follows the existing combat scheduler.
6. **Resume:** `reactionMovementResumed` plus subsequent confirmed steps resumes travel. Retain continuity using movement correlation; do not replay the activation.
7. **Finish/interruption:** final drop and `riverTraLaLaResolved` produce drop feedback. Death can terminate earlier; stakes can stop at an intermediate cell; a new `reactionDropChoice` can be needed. Stop all transport cues on these conditions and wait for any actual confirmed drop. No end-to-end trace replay at final resolution.

## 11. Persistent status VFX

| Status/current field | Persistent rendering | One-shot event cue |
| --- | --- | --- |
| `unit.bunker.active` | Static bunker perimeter/badge; optional subtle CSS pulse while active | `bunkerEntered` success only; `bunkerExited` exit; do not start entry from snapshot state. |
| `sansLastAttackCurseSourceId` | Restrained curse badge/aura for authorized visible unit | `sansLastAttackApplied`, actual `sansLastAttackTick`, `sansLastAttackRemoved`; source IDs still need projection review. |
| `isStealthed` | Owner/authorized-view stealth indication; hidden enemies absent | Successful `stealthEntered`; authorized `stealthRevealed`. Failed stealth is not entry. |
| `movementDisabledNextTurn`, `immobilizedUntilOwnTurnStart` | Movement-disabled/wrapped indicator from current state | Forest hit or explicit snare trigger, rather than an inferred fresh status mount. |
| `papyrusBoneStatus`, `sansBoneFieldStatus` | Existing colored status UI and bounded aura; use approved atlas region if applicable | Bone apply/punishment/tick events; expiration from a snapshot is silent reconciliation unless a fresh removal event exists. |
| `stakeMarkers`, forest markers | Current authorized ground markers, silently restored | Owner `stakesPlaced`, public revealed `stakeTriggered`; no snapshot placement sound. |
| Owner `jackTraps`, enemy trapped-unit status | Own markers / visible wrapped unit indicator according to current view rules | Proposed `snarePlaced`/`snareTriggered`; do not expose all traps to render an aura. |
| Chikatilo private mark status | Only the recipient's projected mark | Owner-projected `chikatiloMarkApplied`; no enemy-target leak. |
| Transformations / Berserk / other visible form states | Current token art/status immediately on snapshot | Accepted transform/ability event entry only, correlated with the actual transformation. |
| Arena bone field / storm | Current projected `arenaEffects`/board field with its remaining lifetime | `sansBoneFieldActivated`, `lechyStormStarted`, actual roll/tick results. |

Statuses reconcile immediately with authoritative state and permission loss; they do not wait for a historical entry animation. Keep existing readable badges. A static aura is usually preferable to dozens of continuously running sprite loops. Persistent effects can use a short CSS cycle, but silence is the default.

## 12. Asset formats, loading, and performance

### Measurements from the actual working tree

Counts exclude vendor art outside `src/assets` and archive/document previews unless stated. MiB means 1024x1024 bytes.

| Asset group | Actual count/size | Consequence |
| --- | --- | --- |
| Runtime-tree audio files | 185: 168 WAV, 15 MP3, 2 `.mpeg`; about **19.017 MiB** | Small enough for staged prefetching, but do not fetch every hero at landing-page startup. |
| Newly supplied WAVs | 156, 48 kHz/24-bit mono or stereo; measured duration **0.089–1.605 s** | Short SFX fit a decoded-buffer backend well. Preserve supplied masters. |
| Legacy WAVs | 12, 44.1 kHz/16-bit | Native decoding can coexist with new files; no forced resampling/re-export needed. |
| Dora WAV | **882,044 bytes**, 5 s | Preload with Kaiser roster; review audible phase timing. |
| Largest generated core UI WAV | `common/ui/victory.wav`, **462,290 bytes** | Results need not load in the first button-feedback batch. |
| Runtime-tree VFX | **164 PNG**, **5.961 MiB**; plus 32 documentation JSON files | Includes 154 newly organized unique PNGs and 10 curated PNGs. |
| Pack manifests | 155 entries; one shared stealth-file alias | Entry count differs from unique bitmap count. |
| Generated sprite sheets | 128x128 frames; maximum **4096x128** | Existing horizontal-strip rendering fits these assets. |
| Estimated decoded generated PNG pixels | **185.19 MiB RGBA** | Much larger than transfer size; avoid full-library eager decoding. |
| Estimated all 164 PNG pixels | **201.03 MiB RGBA** | Pixel allocation estimate, not measured total browser memory; GPU copies/cache/compositing may add cost. |
| Decoded WAV sample estimate | **23.81 MiB float32** at source rates | Does not include MP3/MPEG buffers, metadata, or context-rate differences. |

PNG dimensions were read directly from actual headers; WAV rate/depth/channel/duration and sample memory were read from actual WAV files. The earlier [ingestion audit](docs/assets/INGESTION_AUDIT.md) additionally documents full decode checks and the retained legacy clips; this review did not repeat listening/art approval.

Largest sheets are 32 frames (4096x128), around 2 MiB RGBA each; primary/accent pairs can consume around 4 MiB before browser overhead. Transfer size alone is misleading.

### Loading stages

1. **First useful UI interaction:** a few button/select/invalid samples. Unlock audio from a user gesture. Loading registries must not trigger audio.
2. **Enter game / room:** common hit/miss/dice/movement/death sounds, a small generic combat VFX set. Fetch/decode with bounded concurrency, e.g. 2–4 jobs as an initial tunable value.
3. **Figure Set / draft known:** fetch assets for selected heroes, then prioritize final match roster after draft/assignment. Use public roster identity, never secret pending targets, to decide what to fetch.
4. **Match start:** decode roster ultimates and core ability strips in advance, particularly Kaiser impacts, Forest, Gaster, and Fireball. Do not decode every possible hero transformation upfront; warm likely transformation assets when justified.
5. **During match:** lazily fill noncritical variants/status art; never start overdue one-shots after a load completes. Cache by URL, dedupe aliases, retain core/roster assets, and bound/drop references for old rosters.

Use `new Image()` plus `decode()` for PNG preparation and keep references for the active roster. Decode completion means image data is ready for use, not that every later GPU/upload stall has been eliminated. [MDN image decode](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode).

Avoid eager glob imports that fetch/decode everything as a side effect. Literal registry URLs can be known without loading image/audio bytes. The renderer may still need a visible-frame warmup test on target browsers.

### Format assessment

| Format | Current evidence | Recommended handling |
| --- | --- | --- |
| PNG/static + horizontal strips | All current runtime VFX raster files | Explicit dimensions/frames; CSS frame stepping, single image decode per sheet; static aura stays static. |
| WebP/static | No current pack files | If introduced later, same image preload/decode approach. No conversion proposed now. |
| Animated WebP | No current pack files | Less precise restart/frame/phase control; prefer current strips for synchronized outcomes. |
| WebM | No production pack files | Captured preview videos are QA output, not gameplay assets. Future videos require video preload/readiness and platform-specific alpha checks. |
| GIF | 30 retained vendor-source GIFs outside runtime tree | Authoring/reference material; do not ship the vendor tree wholesale. |
| PSD | 37 retained vendor authoring files | Not browser runtime assets. |
| WAV/MP3/MPEG | All exist in sound tree | Decode supported sources; explicitly verify legacy MIME/URL handling and playback on target browsers. |

Awkward assets identified now: prose-only manifest timing, static composite `status_small.png` atlas without a ready runtime region API, combined Fireball phases, paired strips requiring synchronized composition, and long legacy signatures/ambience candidates. None requires immediate conversion; define metadata/use first.

The asset index's Audio/VFX headings currently have no detailed new-file listing, while preserved-existing sections do. Use actual files, per-folder manifests, and `docs/assets/sound_inventory.csv`/ingestion mapping for registration rather than assuming the index is a complete runtime manifest. Its statement that generated additions are unregistered is accurate.

## 13. Concrete event-to-assets mapping

Keys below are proposed semantic registry entries. Existing camelCase VFX IDs/CSS cues can remain aliases/fallbacks. All one-shots require accepted delivery identity. “Supported” distinguishes event/data support from registered asset playback; **no new sound is currently registered**.

| Gameplay event | Current code event/action | Audio key | VFX key | One-shot or persistent | Who receives it | Already supported? | Integration gap? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Local click/select | Local UI handlers / `setActionMode` | `common.ui.buttonClick` / `common.ui.actionSelect` | Existing selection outline | Local one-shot/current preview | Local viewer | UI state yes | Wire UI sound at interaction; no server gameplay cue. |
| Rejected interaction | Local validation or `actionResult.ok=false` | `common.ui.actionInvalid` | Existing error UI | Local one-shot | Acting viewer | Rejection UI yes | Register sound; don't play accepted cast. |
| Ability committed | `abilityUsed` | `hero.<heroId>.abilities.<abilityId>.cast` | Hero-specific source cast | One-shot | Authorized recipients | Partial; SFX mapper exists | Source/target/use correlation and stage routing; registry empty. |
| Hit / HP damage | `attackResolved` with hit/damage | `common.combat.hit` | `combat.hit.light` / `.heavy` | One-shot | Authorized combat recipients | CSS + HP scheduler yes | Raster/sound registration, coordinates and source ability; +180 ms sound offset must share impact timing. |
| Miss | `attackResolved.hit=false` | `common.combat.miss` | `combat.miss` | One-shot | Authorized combat recipients | CSS yes | SFX mapper currently has no miss cue. Do not equate every miss with dodge/block. |
| Damage without attack | `stakeTriggered`, curse/bone/storm/collision events, some `aoeResolved.damageByUnitId` | Common hit or specific tick | Damage flash + HP | One-shot | Projected victims only | Some paths yes | Normalize missing aggregate damage once; exact previous/next HP where needed. |
| Final death | `unitDied` | `hero.<heroId>.basic.death` -> `common.combat.death` | `combat.death` | One-shot | Authorized death recipients | CSS death/removal + SFX mapper yes | Event-time public position; don't die on HP=0 before required pre-death decisions. |
| Heal | `unitHealed` | `common.status.heal` | `combat.heal` | One-shot | Authorized visible unit | CSS yes | Register available `unit_heal.png`; extend sound and visual HP scheduling. |
| Ordinary movement | `unitMoved` | `common.movement.move` | `movement.normal` / existing trail | One-shot | Visible/owner units | Event and CSS yes | SFX currently requires known hero; movement mode/provenance. |
| Trickster teleport | `unitMoved` from accepted move | `common.movement.teleport` | `movement.trickster` | One-shot | Authorized unit locations | Endpoints yes | No mode on event; no significant teleport inference from distance. |
| Rider reached route | `unitMoved` / rider combat chain | `common.movement.riderMove` | `movement.rider` | One-shot segments | Authorized reached path | Partial | Exact route/interrupt provenance wherever only final endpoint is emitted. |
| Forced movement | `intimidateResolved`, `hiddenCollisionResolved`, `unitMoved` | `common.movement.forcedMove` | `movement.forced` | One-shot | Recipient-safe source/target cells | Partial CSS | Cause/HP/geometry projection; existing registry needs mapping. |
| Stake placement | `stakesPlaced` | `hero.vladTepes.abilities.vladStakes.place` | `hazard.stake.place` | One-shot | Owner only | Owner event/positions yes | Register variants/strip; suppress opponent placement cue. |
| Stake marker | Projected `stakeMarkers` | None | `hazard.stake.marker` | Persistent | Owner or revealed public | Existing marker yes | Add static art if useful; snapshot mount silent. |
| Stake trigger | `stakeTriggered` | `hero.vladTepes.abilities.vladStakes.trigger` | `hazard.stake.trigger` | One-shot | Public after authorized reveal | Event/position/CSS/HP yes | Sound/raster registration; ensure IDs/position projection. |
| Snare placement | `abilityUsed: jackRipperSnares`, `applyJackTrapPlacement` | `hero.jackRipper.abilities.jackRipperSnares.place` | `hazard.snare.place` | One-shot | Owner only | Ability event only | Add owner `snarePlaced` geometry; current event has no placement cell. |
| Snare trigger | `newBatchPost.ts` on `unitMoved` mutates trap/status | `hero.jackRipper.abilities.jackRipperSnares.trigger` | `hazard.snare.trigger` | One-shot | Authorized revealed victim/cell | No dedicated event | Add `snareTriggered`; don't diff secret trap state. |
| Snare/wrapped status | Projected own trap / `immobilizedUntilOwnTurnStart` | None | Existing wrapped indicator | Persistent | According to current player view | Yes | Optional static decoration; no widened hidden trap list. |
| Dora | `abilityUsed: kaiserDora`, completed `aoeResolved` | `hero.grand-kaiser.abilities.kaiserDora` | `hero.grand-kaiser.kaiserDora.impact` | One-shot | Authorized public area | Event/data/CSS yes | New strips/map; shared impact-first schedule; legacy WAV timing. |
| Forest activation/eruption | `forestActivated`, completed `aoeResolved` for Forest | `hero.vladTepes.abilities.vladForest.cast` | `hero.vladTepes.forest.eruption` | One-shot | Safe activation/confirmed public area | Event/data/CSS yes | Activation precedes center; register and separate phases. |
| Carpet Strike | `carpetStrikeTriggered`, `carpetStrikeCenter`, `carpetStrikeAttackRolled`, `aoeResolved` | `hero.grand-kaiser.abilities.kaiserCarpetStrike.launch` / `.impact` | `hero.grand-kaiser.kaiserCarpetStrike.impact` | One-shot + current telegraph | Authorized public | Yes, events + CSS | RNG center, no local chosen area; strip and staged mapping; avoid aggregate duplicate cues. |
| Gaster | `abilityUsed: sansGasterBlaster`, `aoeResolved` radius 0 | `hero.sans.abilities.sansGasterBlaster.charge` / `.fire` | `hero.sans.sansGasterBlaster.cannon` / `.beam` | One-shot | Public safe ray; projected victims | Partial data | Source-time anchor/direction, animated strip beam, one fire across defenders. |
| Fireball | `abilityUsed: asgoreFireball`, later generic `attackResolved` | `hero.asgore.abilities.asgoreFireball.cast` / `.travel` / `.impact` | `hero.asgore.asgoreFireball.projectile` | One-shot phases | Authorized source/target/outcome | Partial | Stable ability association and miss-safe frame phases. |
| Boat pickup/travel/drop | `abilityUsed`, `unitMoved`, `riverBoatResolved` | `hero.riverPerson.abilities.riverBoat.pickup` / `.move` / `.disembark` | `hero.riverPerson.boat.pickup` / `.travel` / `.drop` | One-shot segments | Authorized carrier/passenger | Existing curated VFX partial | Original cells/provenance; no fabricated routes. |
| Tralala drag | `abilityUsed: riverTraLaLa`, step `unitMoved`, final `riverTraLaLaResolved` | `hero.riverPerson.phantasms.riverTraLaLa.activate` / shared boat movement | `hero.riverPerson.riverTraLaLa.segment` | One-shot segments / optional controlled loop | Authorized controller/target | Steps exist; final VFX exists | React to steps, group bodies, stop final full-route replay. |
| Reaction pause/resume | `reactionOpportunity`, `reactionChoiceResolved`, `reactionMovementResumed` | `common.ui.decisionReady` or confirmed reaction attack | Existing pending UI / movement hold | Current prompt + accepted one-shot | Prompt owner; safe public status | Events and UI yes | Movement correlation and loop cleanup. |
| Dice result | Existing specialized results / proposed `rollResolved` | `common.combat.diceRoll` | Dice reveal UI | One-shot | Rolling owner; others only for authorized public roll | Partial | General result values/roll identity missing; no cue on choice or `rollRequested`. |
| Bunker | `bunkerEntered`, `bunkerExited`; current bunker state | `hero.grand-kaiser.abilities.kaiserBunker.enter` / `.exit` | Bunker entry/hit-exit + `.status` | One-shot + persistent | Authorized visible Kaiser | Events/CSS/curated shield yes | Register generated assets; failed entry does not use entry effect. |
| Stealth | `stealthEntered`, `stealthRevealed`; current stealth state | `common.status.stealthEnter` / `.stealthReveal` | `status.stealth.enter` / `.reveal` | One-shot + owner persistent | Per-recipient visibility | Projected events/CSS/curated reveal partial | Sound success guard; new alias registry; no last-known-position VFX. |
| Sans curse | `sansLastAttackApplied`, `sansLastAttackTick`, `sansLastAttackRemoved` | `hero.sans.statuses.lastAttack.apply` / `.tick` / `.expire` | `hero.sans.lastAttack.apply` + current aura | One-shot + persistent | Authorized target/status | Events/CSS/HP ticks yes | Registry/map and source privacy review. |
| Search reveal | `searchStealth`, `stealthRevealed` | `common.status.search` / `.stealthReveal` | Existing `searchReveal` / `hiddenReveal` | One-shot | Search owner; authorized revealed targets | Curated VFX yes | Register new strips/audio; don't play duplicate reveal for the same reveal event. |
| Hassan private selection | `hassanAssassinOrderSelection`, owner-projected effects | Owner UI / `hero.hassan.phantasms.hassanAssassinOrder` if committed | Owner-only selection/cast | UI state + accepted one-shot | Owner only | Private pending projection exists | No public target/count/cell cues; concrete committed payload only. |
| Battle/turn/result | `battleStarted`, `turnStarted`, `roundStarted`, `gameEnded`, `gameDraw` | `common.ui.battleStart` / `.yourTurn` / result key | Existing HUD/result screen | Event one-shot; screen state persistent | Projected public / your turn local recipient | Events/UI yes | Register sounds; reopening ended snapshot must not replay victory audio. |

## 14. Proposed modules and minimal integration changes

All paths below describe **later implementation**. No listed source file was created or edited in this review.

### Extend existing files first

| Existing file | Later responsibility/change |
| --- | --- |
| `packages/rules/src/model/events/core.ts`, `heroes.ts`, `index.ts` | Add missing semantic fields/events and correlate accepted ability/roll/movement outcomes. |
| `packages/rules/src/core/events/combatEvents/*` | Extend existing event constructors consistently. |
| `packages/rules/src/view/events.ts`, `pending.ts`, `player.ts`, `spectator.ts` | Typed per-recipient projection; event-time anchors and secret pending/public telegraph rules. |
| `packages/rules/src/pendingRoll/resolvers/*`, relevant hero/movement handlers | Emit actual roll results; propagate ability/use context; emit missing snare transitions at mutations. |
| `packages/server/src/store.ts`, `ws.ts`, `commandResult.ts`, `routes.ts` | Stamp IDs at acceptance, use durable revision for event delivery, expose stream/snapshot baseline; align HTTP/test-room result paths too. |
| `packages/server/src/persistence/acceptedAction.ts` and applicable snapshot/contract files | Preserve event delivery metadata across persisted accepted actions; accommodate any new pending correlation fields in recovery schemas. |
| `packages/web/src/ws.ts`, `store.ts` | Receive typed projected batches, hydrate explicitly, process every batch independently of rendering, separate debug presentation IDs. |
| `packages/web/src/game/effects/visualResolution.ts`, `useVisualResolution.ts`, `combatPlayback.ts` | Preserve stable event identities, route early step versus deferred outcome cues, schedule aggregate impacts before HP and missing damage paths once. |
| `packages/web/src/features/sfx/sfxPlayer.ts`, `sfxEventMapper.ts`, `useBoardSfx.ts` | Shared audio backend, variants/phase cues, proper session/volume lifecycle; replace hardcoded hit offset with plan timing. |
| `packages/web/src/assets/sfx/registry.ts`, `resolver.ts` | Register assets/variants and exact semantic fallback; tighten keys. |
| `packages/web/src/features/vfx/vfxRegistry.ts`, `vfxTypes.ts`, `VfxSprite.tsx`, `VfxLayer.tsx`, `vfxEventMapper.ts` | Generated strip composition, beam/projectile support, frozen event anchors, asset-backed outcomes. |
| `packages/web/src/features/vfx/vfxGeometry.ts`, `game/effects/BoardEffectsLayer.tsx` | Shared flip/coordinate conversion, literal board-edge rays, centered/clipped AoE geometry. |
| `packages/web/src/components/Board.tsx`, `game/gameshell-content/components/GameShellBoardColumn.tsx`, `styles.css` | Recipient/session lifecycle, explicit sibling layer stacking, persistent aura integration and readable targeting. |
| Existing `VfxPreviewPage`/preview scenarios | Add synthetic authorized examples of the new strips and both player orientations. Keep live and preview identity separate. |

### Small new files justified by a specific responsibility

| Proposed file | Purpose |
| --- | --- |
| `packages/rules/src/model/events/projected.ts` | Truthful projected-event union/safe notices, without duplicating gameplay semantics. |
| `packages/server/src/gameEventDelivery.ts` | Stamp/preserve delivery identity and build result envelopes once; shared WS/HTTP/debug paths. |
| `packages/web/src/game/effects/presentationSession.ts` | Nonreactive ordered ingress, dedupe, hydration, recipient/session cleanup and cue dispatch. |
| `packages/web/src/game/effects/presentationTypes.ts` | Web-only normalized cues and stable IDs/anchors; UI does not depend on raw private rule contexts. |
| `packages/web/src/features/sfx/AudioManager.ts` | Optional extracted native Web Audio backend behind the existing player facade. |
| `packages/web/src/features/sfx/audioPreload.ts` | Fetch/decode cache orchestration if substantial enough to separate from manager. |
| `packages/web/src/features/vfx/vfxPreload.ts` | Registry-based core/roster image preload/decode cache and release policy. |
| `packages/web/src/features/vfx/UnitStatusVfx.tsx` | Current-state decorations with stable unit/status keys and no application playback. |
| `packages/web/src/features/vfx/GroundTelegraphLayer.tsx` | Optional extraction if adding ground art exceeds the existing targeting layer's responsibility. |

Do **not** add `audioStore`, `vfxStore`, and `fxStore` by default. Do not add a redundant `packages/rules/src/events/publicGameEvents.ts` tree beside `model/events`/`core/events`. Add a screen component or preferences store only when an actual UI use needs it.

## 15. Ordered implementation phases and verification

### Phase 0 — event correctness and privacy prerequisites

Fix log-index identity using existing revision; add stream IDs/stable event IDs and explicit hydration baseline. Preserve original IDs through deferred chains. Make projected event typing honest, review position-bearing public events, and ensure queued delivery cannot lose batches between React commits. Separate preview/replay identity. Audit recipient/session switching and event-time visibility.

This phase solves correctness before sounds make duplicates noticeable. It requires server/web changes and focused rules projection changes; it does not change game mechanics.

### Phase 1 — smallest usable infrastructure

Populate a small core registry slice, evolve the shared SFX player, add master mute/volume and UI/SFX routing, core/roster preload, and repair sprite geometry/animation composition/layer readability. Reuse existing hooks/layers/scheduler. Add persistent status component only when registering its first status asset.

### Phase 2 — generic confirmed feedback

Integrate hit/miss/damage/death/heal, actual movement endpoints, stake trigger, and confirmed dice. Add `rollResolved` and missing snare transitions, and movement provenance wherever generic presentation currently guesses. Synchronize impact/audio/HP/death and prevent aggregate double cues. Keep owner-only placement feedback isolated.

### Phase 3 — major hero abilities

Integrate Dora/Forest/Carpet using completed AoE data first. Then Fireball with explicit use correlation, Gaster with animated full ray and confirmed anchors, and Boat/Tralala with step/reaction pause/resume. Expand remaining heroes by event/data coverage, not by asset-folder order.

### Phase 4 — persistent projected status art

Add bunker, curse, authorized stealth indicators, wrapped/movement-disabled status, visible hazards/forest markers and other approved auras from current state. Silent snapshot restoration is mandatory. Retain existing badges/readability and reduced motion.

### Phase 5 — polish and measured optimization

Audition volume/duration/variants, refine optional category controls and UI sounds, measure first-use latency on supported browsers/devices, tune preload priorities/memory/concurrency, and verify large ultimates under mobile board sizing. No blanket asset conversion before measurement.

### Meaningful checks for the later implementation

Reuse existing `test:effects`, `test:sfx`, `test:vfx`, targeting/layout and server/rules suites. Add focused checks that verify behavior, rather than mirroring registry declarations:

- Duplicate action result, duplicate live snapshot, reconnect, and browser remount each play a valid new one-shot at most once; snapshot alone plays none.
- More accepted actions than `MAX_LOG_EVENTS` still deliver effects; recovered nonzero revision with empty journal continues correctly.
- First reconnect baseline suppresses older results; a live snapshot immediately before its same-revision result does not suppress that result.
- Many accepted results before one React commit all reach the queue in order; deferred-chain events retain identity and are not re-dropped at release.
- P1/P2/spectator serialization contains no unauthorized stake/snare coordinates, Hassan targets, hidden source positions, or historical hidden movement path. Test payload absence, not just hidden DOM.
- Role/stream changes cancel pending sound and VFX; mute/loading failures/background return never produce catch-up bursts.
- AoE aggregate plus target attacks yields one impact and one HP/death progression per target; Jack direct damage also updates visual HP correctly.
- Sans pre-death decisions and rebirth mechanics do not remove a unit merely on HP=0; use confirmed final death plus current rules state.
- C3/corners/edge-clipped 3x3 and 5x5, rays to each boundary, both orientations, coordinate gutters, zoom and resize align correctly.
- Gaster passes all units to the boundary; Fireball miss does not display a hit bloom; Tralala pauses/resumes/interruption/drop never teleports visually through an unresolved reaction.
- Strip frame stepping survives area/beam composition, primary/accent playback stays synchronized, reduced motion retains readable outcomes, and selection/status/HP remain visible over effects.

This review did not run gameplay test suites because implementation was explicitly prohibited. It inspected source, asset headers/manifests/sizes, and browser API documentation. Runtime latency, subjective sound quality, and visual compositing on real devices remain implementation validation work.

### Architectural ratings and complexity

| Option | Rating |
| --- | --- |
| Extend `actionResult` with recipient-safe semantic events and stable delivery metadata | **RECOMMENDED** |
| Define gameplay meanings and projection in rules, identity/transport in server, assets/timing in web | **RECOMMENDED** |
| Use accepted-action revision and opaque event IDs; keep bounded recent IDs | **RECOMMENDED** |
| Reuse current combat buffering and shared timeline | **RECOMMENDED**, with explicit early dice/cast routing and impact-order repair |
| Native Web Audio behind existing SFX facade | **RECOMMENDED** |
| Existing DOM/CSS VFX renderer with targeted extensions | **RECOMMENDED** |
| State-driven persistent visuals from projected current state | **RECOMMENDED** |
| Cached HTMLAudioElement pool | **ACCEPTABLE** if measured latency/voice behavior meets requirements |
| Safe current/previous visible coordinates for an event lacking anchors | **ACCEPTABLE** temporary fallback; skip when uncertain |
| State diff of authorized view for a minor cosmetic compatibility fallback | **ACCEPTABLE** only with silent snapshot hydration; not significant movement/hidden hazards |
| Whole-state diff for one-shot gameplay feedback | **AVOID** |
| Immediate hit/explosion/teleport on ability button click | **AVOID** |
| Client-side hiding of transmitted secret event payloads | **AVOID** |
| New renderer, audio library, global event bus, or three extra stores before need | **AVOID** |
| Autoregister every manifest entry or eagerly decode the full library | **AVOID** |

Overall complexity: **HIGH** for complete, privacy-correct, reconnect-safe coverage of all abilities, interactive movement, and presentation phases. A core MVP reusing existing modules is **MEDIUM**; registry-only additions are **LOW**, but do not solve the identified delivery/data gaps. No new dependency is recommended.

==================================================
FINAL RECOMMENDATION
==================================================

- **Should audio/VFX be event-driven?** Yes for gameplay one-shots: accepted, recipient-projected server events, with a shared presentation identity and schedule. Local UI feedback is immediate; persistent visuals use current authorized state.
- **Which package defines event semantics?** `packages/rules`, alongside the existing model/events and recipient-view projectors. Server owns durable delivery identity/revision; web owns asset choices and presentation timing.
- **Should we add dedicated public gameplay events?** Strengthen the existing stream into a typed recipient-safe contract inside `actionResult`. Add only missing semantic results such as actual roll resolution and snare placement/trigger, plus necessary ability/movement correlation. Do not replace existing events or invent a second transport/event engine.
- **How do one-shots avoid replay after reconnect?** Initial/resync snapshot establishes stream and revision baseline without generating cues. Stable IDs survive rebroadcast and chain buffering; ingress and presentation dedupe are distinct; history at/below the baseline is consumed silently. Ordinary live snapshots do not advance the event receipt watermark.
- **How should persistent VFX work?** Render directly from current projected statuses/markers and reconcile silently on snapshots. Entry, tick, exit, impact, and death sounds/animations require fresh authorized events.
- **What comes first?** Fix array-based `logIndex`, hydrate against revision, preserve event IDs, harden recipient projection and ordered delivery. Then register a small core pack using existing SFX/VFX modules, add preloading/mute, and verify synchronization before extending major heroes.
- **What must absolutely not be done?** Do not trigger gameplay outcomes from clicks/rerenders/whole-snapshot diffs; transmit secret coordinates with a client visibility flag; replay historical events on join; infer significant paths or hidden targets; double-play AoE damage; use debug timestamps as live event sequence; or introduce a second rules/renderer/audio framework without demonstrated need.
