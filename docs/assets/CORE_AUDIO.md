# Phase 5 — Core Audio Infrastructure

Only the generic SFX foundation is integrated. Rules, server mechanics and VFX
rendering are unchanged. No audio dependency was added.

## 1. Audio architecture

`ProjectedGameEvent` with delivered `eventId` → existing `PresentationSession`
and visual-resolution/combat scheduler → `useBoardSfx` / `SfxPlaybackSession` →
`mapEventBatchToSfx` → resolved `SoundCue` → existing `SfxPlayer` facade →
`AudioManager` → native Web Audio nodes.

`SfxPlaybackSession` owns only defensive cue consumption, delayed timers and
playback reset. The existing presentation session remains transport authority.
`Board.tsx` already supplies its authorized active presentation batch to the hook;
its integration was retained.

## 2. Files created

Under `packages/web/src/features/sfx/`:

- `AudioManager.ts`: lazy native context, resume, decoded/in-flight caches,
  separate gain buses, bounded one-shots and stop handles.
- `audioPreload.ts`: prepares only the explicit core registry, split by category.
- `sfxPlaybackSession.ts`: consumes cue IDs and cancels delayed/active gameplay
  playback while leaving application-lifetime buffers intact.
- `uiSfx.ts`: shared gesture preparation and restrained local UI feedback.
- `SoundControls.tsx`: shared mute/volume controls and small local persistence.
- `audioTestUtils.ts`: injectable native-audio test doubles.
- `AudioManager.test.ts`, `sfxPlaybackSession.test.ts`, `uiSfx.test.ts`,
  `useBoardSfx.test.ts`: cache, routing, session, gesture and React regressions.

`packages/web/scripts/sfx-smoke.mjs` provides a repeatable DB-free Chromium
smoke using the existing in-memory server fixture and real authoritative WebSocket
transport. This document records the implementation and validation.

## 3. Files modified

- Registry/resolution: `assets/sfx/registry.ts`, `resolver.ts`, their existing
  resolver tests, and `README.md`.
- Asset inventory: `assets/ASSET_INDEX.md` links the integrated core slice.
- Facade/mapping: `features/sfx/sfxPlayer.ts`, `sfxEventMapper.ts`, `sfxTypes.ts`,
  `useBoardSfx.ts`, and existing facade/mapper tests. The old `new Audio` backend
  was evolved into Web Audio; existing optional hero-lookup scaffolding is retained.
- Shared timing: `game/effects/combatPlayback.ts` and `types.ts` add client-only
  `eventSfxDelaysMs` from the existing impact/death queue. Visual offsets are preserved.
- UI: `layout/AppShell.tsx`, `game/components/GameTopBar.tsx`, `store.ts`, and
  English/Ukrainian locale strings. `packages/web/package.json` adds `test:sfx:e2e`.

## 4–5. Registry and exact preload set

Paths below are relative to `packages/web/src/assets/sfx/`. Every listed file is
registered and preloaded; no other sound files are preloaded.

| Closed semantic key | Actual WAV files | Category / timing |
| --- | --- | --- |
| `common.ui.buttonClick` | `common/ui/buttonClick01.wav`, `common/ui/buttonClick02.wav`, `common/ui/buttonClick03.wav` | UI, first shell pointer/activation gesture |
| `common.ui.actionInvalid` | `common/ui/actionInvalid.wav` | UI, same gesture preparation |
| `common.combat.diceRoll` | `common/combat/diceRoll01.wav`, `common/combat/diceRoll02.wav`, `common/combat/diceRoll03.wav`, `common/combat/diceRoll04.wav` | Gameplay, board/game UI mounting |
| `common.combat.hit` | `common/combat/hit01.wav`, `common/combat/hit02.wav`, `common/combat/hit03.wav`, `common/combat/hit04.wav` | Gameplay, same match preparation |
| `common.combat.miss` | `common/combat/miss01.wav`, `common/combat/miss02.wav`, `common/combat/miss03.wav` | Gameplay, same match preparation |
| `common.combat.death` | `common/combat/death01.wav`, `common/combat/death02.wav` | Gameplay, same match preparation |

There are four UI files and thirteen gameplay files. Static `new URL(...,
import.meta.url)` references are Vite-safe. Landing-page mount loads none.
Preloading is asynchronous and never blocks room joins, placement or gameplay.
No core key points at a hero asset.

## 6. Web Audio graph

`AudioBufferSourceNode` → per-voice `GainNode` (definition gain) → category
`GainNode` (`ui` or `gameplay`) → master `GainNode` → context destination.

Muted master gain is zero. Unmuted gain is normalized master volume, clamped to
0–1. Definition gains are 0.4 (UI), 0.55 (dice), 0.6 (hit/death), 0.5 (miss).
Both categories share master controls, while keeping separate internal routes.

## 7. Variant strategy

FNV-style presentation hashing of `cueId:soundKey` selects one variant while
mapping the cue. Cue identity contains stream ID, stable event ID and semantic
key; rebroadcast revision and React rendering do not change it. UI uses an
incrementing local cue identity. Neither path draws from rules/server RNG or
`Math.random`. If the selected variant is unavailable, an already-decoded sibling
variant of the same semantic sound may be used at playback time.

## 8–9. Implemented event/UI mappings

- `rollResolved` → `common.combat.diceRoll`, once per actual delivered roll event.
- `attackResolved.hit === true` → `common.combat.hit`.
- `attackResolved.hit === false` → `common.combat.miss`.
- Final `unitDied` → `common.combat.death`, independent of unit removal from view.

Hit cues use the combat queue's HP-impact phase; deaths use the actual queued
death phase (the legacy event offset may be overwritten later in planning).
Normal and reduced-motion plans are tested. Dice use their shared event phase;
attack outcomes and shared AoE attacker-roll fields never synthesize extra dice.

Local feedback is limited to Ready/Start commands, pending-roll submit interactions,
opening shell Settings, and locally rejected `sendAction` interactions. Only UI
button/invalid cues play here; the actual dice result waits for `rollResolved`.
UI feedback is throttled to one cue per 90 ms. Sound-setting adjustments unlock
audio without adding feedback noise. Board/shell pointer and activation-key
gestures can resume audio without playing a fake sound.

## 10–11. Fallback/cache policy

Resolution is exact semantic definition → explicitly supplied approved generic
key → silence. The core mapper needs no specialized fallback. At playback,
an already-ready sibling variant is safe; otherwise the cue is skipped and
preparation only serves future cues. No load completion starts an old cue.
Missing/unknown specialized keys never map automatically to a generic UI/combat
sound. Unauthorized projected events, private snare placement and redacted
notices produce no gameplay cue, so fallback cannot expose hidden information.

URL-keyed `decodedBufferCache` stores decoded `AudioBuffer`s for the app lifetime.
`inFlightLoadCache` shares concurrent fetch/decode promises. Fetch, HTTP and decode
failures resolve silently to unavailable audio. Failed URLs are remembered, with
at most one development diagnostic per URL and at most 256 retained failure
entries. Context/resume/source failures also leave gameplay running silently.

The manager permits sixteen concurrent voices globally and per-key caps of
2 UI clicks, 1 invalid, 2 dice, 4 hits, 3 misses and 2 deaths. Oldest applicable
voices are stopped when a cap is reached; normal multi-target combat can overlap.

## 12–13. Sessions and settings

Existing transport baseline/revision/event-ID filtering remains primary dedupe.
The audio layer defensively consumes `stream:eventId:audio:key` even when muted,
zero-volume or cold. Up to 512 cue IDs/timers are retained. Local effect previews
and batches without live stream identity stay silent.

Mount/reset baselines are silent. Room, recipient/role, stream and reconnect
presentation-key changes cancel timers and stop active gameplay voices; synchronous
token cancellation also invalidates a timer before React commits. Disabled and
unmounted boards clean up. Timers more than 15 seconds overdue drop instead of
bursting after tab suspension. Buffers and UI routing survive match resets.

Mute and a 0–1 master-volume slider appear in existing shell Settings and the
in-match toolbar. English/Ukrainian labels are accessible. The tiny `fate.sfx`
localStorage entry persists `{muted, volume}`; corrupt/unavailable storage is
ignored. AudioContext and buffers are never stored in Zustand.

## 14–16. Verification

Tests cover concurrent and repeated cache loads, fetch/decode/API failures,
stable variants without RNG, master routing/volume/mute, per-key/global voices,
cold-cue skipping, bounded preload sets, authoritative dice, hit/miss, final death,
private snare projection, timing, duplicate/rerender safety, silent hydration,
room/role/stream/reconnect resets, stale timers, unmount and local UI feedback.

Validation: `test:sfx` (38 passing), `test:effects` (76 passing), `test:vfx`
(32 passing), full `test:web` (542 passing), web typecheck, root lint and root
production build. Root build includes rules/server compilation. Rules/server
test suites were not needed: no shared rules/server types or mechanics changed.
Vite reports the existing large application-chunk advisory.

Chromium smoke results and screenshot are generated under
`packages/web/test-results/sfx/` by `npm run -w web test:sfx:e2e`.
The passing smoke observed exactly seventeen fetches, seventeen native decodes
and seventeen unique URLs; running native source starts for UI clicks, six confirmed
dice phases, hits, a miss and final death; the full native gain route; master mute
and volume; persisted settings; duplicate silence and silent snapshot reconnect.
Desktop and 390px mobile screenshots passed layout checks. It is automated browser
verification; no human listening or loudness/artistic audition is claimed.

## 17. Deferred work

Full hero audio, roster-specific preload, hero signatures, movement sounds,
music/ambience, VFX, positional audio and unusual unused legacy formats remain
deferred. Movement provenance exists, but path/step grouping and sound cadence
deserve their own integration. No next-roadmap-phase work is started.
