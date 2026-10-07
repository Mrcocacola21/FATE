# Phase 7 — Generic Combat + Dice Feedback

## 1. Final combat presentation flow

```text
ProjectedGameEvent
  -> existing PresentationSession (baseline, ordering, eventId dedupe, cancellation token)
  -> visualResolution (early authoritative rolls / deferred chain outcomes)
  -> buildCombatVisualPlaybackPlan
  -> combatCues + HP/death queue + one playbackStartedAt origin
  -> SFX / registered VFX / visual HP / CSS feedback / floating text
```

The existing planner, queue, React hooks, audio manager and sprite renderer were
extended. No competing transport, gameplay state or animation system was added.
Consumers use the same semantic offsets and playback origin. Audio timers and
visual queue expiry remain implementation details of the existing consumers.

## 2. Dice

Roll clicks retain the existing UI click and send `resolvePendingRoll`. They do
not choose dice or play result audio. Only projected `rollResolved` events create
combat dice cues. `CombatRollFeedback` displays the supplied individual dice,
total, side count, player and localized attack/defense title. The existing pending
defense panel also retains the authoritative attacker dice.

Attacker and defender rolls follow event order even when several batches reach
one React commit. Every actual one-die tie-break receives its own cue. Shared AoE
attacker dice have one event and therefore one cue; repeated `attackerRoll` fields
inside target outcomes never create dice feedback.

Combat roll purpose is classified from `rollKind`. Movement, search, initiative,
court and other noncombat rolls do not enter this combat dice slice. Both explicit
chain buffers and the legacy pending-queue buffer release rolls early without
putting them back into the completed outcome batch. Early plans preserve staged
HP/removal while the chain remains pending.

## 3. Hit / miss

| Authoritative event | Audio key | VFX ID | Other feedback |
| --- | --- | --- | --- |
| `attackResolved.hit === true` | `common.combat.hit` | `combatHit` | Brief flash; projected damage text only for positive damage |
| `attackResolved.hit === false` | `common.combat.miss` | `combatMiss` | Restrained localized MISS; no damage tween |
| final `unitDied` | `common.combat.death` | `unitDeath` | Fade/removal after the final death phase |

A successful zero-damage hit remains a hit. It is not labeled BLOCK merely from
zero damage. The current projected attack contract has no outcome classification
for dodge/block/Spearman/Knight/Berserker special defense; the web does not invent
one from dice. Existing gameplay distinctions remain authoritative in rules.

Hit, miss, death and floating positional feedback require the projected event-time
`targetCell` or `deathCell`. They never recover these anchors from current units or
cached positions. Missing anchors also suppress the attack damage flash and death
fade; persistent HP can still reconcile and final removal still follows death.
Aggregate source feedback uses only the authorized `sourceCell`.

## 4. Damage / HP

The planner starts from the queued tail's previous visual HP/units. Attack damage
uses the projected previous/next HP metadata; direct aggregate damage uses the
known projected HP baseline and authorized damage map. Each normalized damage
step creates one tween. Impact starts first, followed by a small HP lead; floating
damage starts with HP. Authoritative room state is neither mutated nor delayed.
The next queued plan starts from the preceding plan's final visual snapshot.

`HpBar.showText` remains owner-only. Spectator and enemy bars keep fill-only
presentation. Floating damage uses the already-public projected damage amount,
never previous/next/max HP. No sound variant depends on HP or gameplay RNG.

The existing snapshot reconciliation timeout remains a silent compatibility
fallback. Baseline/reconnect snapshots do not create semantic damage or heal
cues, and missing event-time anchors never trigger positional reconstruction.

## 5. Healing

Fresh `unitHealed` creates one heal cue and one increasing visual HP tween from
the previous visible HP to projected `hpAfter`. The visible token receives a
restrained green CSS glow during the HP phase. Restored HP at hydration is silent.

There is no generic heal audio key or heal sprite registered in the current core
slice. No artwork, unrelated status sprite, hero sound or sound registry entry was
added. The current heal event also lacks an event-time cell: positional heal
sprites/floating values are skipped. This is an upstream presentation metadata
gap, rather than a reason to fabricate a location in the web client.

## 6. Death

HP reaching zero does not schedule death. Only a final projected `unitDied`
creates a death cue and removal step. Death follows completed HP playback, uses
`deathCell` for both the sprite and token fade, and removes the render-only token
after its short lifetime. It cannot be triggered by absent units in a snapshot.
Damage and final death have separate responsibilities and deterministic cue IDs.

## 7. Pre-death safety

An integration regression uses the actual Sans gameplay helpers, authoritative
manual rolls, recipient projection and Last Attack target choice. It verifies
zero HP with a visible Sans and no death audio/sprite/removal before the choice.
The resulting final projected `unitDied` creates exactly one death presentation.
Sans rules and RNG were not modified.

## 8. AoE dedupe

Matching per-target `attackResolved` events own their hit/miss, damage, HP and
subsequent final death progression. `aoeResolved` retains one aggregate area cue.
Its damage map creates steps only for unmatched targets, including mixed batches
with both individual attacks and direct damage. Direct aggregate targets share
one impact phase and each get one HP tween.

Ownership uses ability-use correlation, then chain/visual-batch correlation. For
legacy uncorrelated events, only the preceding aggregate segment and source can
own the target. Distinct correlated uses on the same target are never suppressed.
Direct AoE maps lack per-target event-time cells, so no target sprite/location is
fabricated. Their normalized damage/HP steps still work.

## 9. Shared attacker rolls

Dice cues originate exclusively from actual `rollResolved`. A shared attacker
roll therefore sounds/displays once, followed by the actual defender rolls.
`attackResolved.attackerRoll` and aggregate roll maps are not replayed as dice.

## 10. Timing

```text
authoritative attacker dice
  -> readable pause / next manual decision
authoritative defender dice (and each actual tie-break)
  -> short attack lead
impact: sound + sprite + brief flash
  -> small lead
HP tween + damage text
  -> short pause, only if final unitDied exists
death: sound + sprite + token fade
  -> render-only removal
```

Healing stages its HP increase on the same planner. Reduced motion shortens the
presentation while preserving the same ordering. Sprite/text CSS use fixed signed
delays to catch up late mounts without resetting on rerenders. SFX schedules from
the plan origin rather than creating a new origin when its hook runs.

Session generation invalidates callbacks synchronously. Room, role, stream,
reconnect-baseline changes and unmount clear pending work. Audio assets stay
cached independently of match playback.

## 11. Assets used

Audio paths are relative to `packages/web/src/assets/sfx/`:

- `common.combat.diceRoll`: `common/combat/diceRoll01.wav`–`diceRoll04.wav`.
- `common.combat.hit`: `common/combat/hit01.wav`–`hit04.wav`.
- `common.combat.miss`: `common/combat/miss01.wav`–`miss03.wav`.
- `common.combat.death`: `common/combat/death01.wav`–`death02.wav`.
- Existing optional UI click: `common.ui.buttonClick`,
  `common/ui/buttonClick01.wav`–`buttonClick03.wav`.

VFX paths are relative to `packages/web/src/assets/vfx/`:

- `combatHit`: `combat/combat_hit_light.png` (7-frame strip).
- `combatMiss`: `combat/combat_miss.png` (7-frame strip).
- `unitDeath`: `combat/unit_death.png` (12-frame strip).
- Healing: existing token/CSS presentation; no new bitmap asset.

Core sound variants use the Phase-5 deterministic identity strategy. Registry
URLs and Phase-6 geometry/orientation/clipping/layers are reused unchanged.

## 12. Files created

- `packages/web/src/game/effects/CombatRollFeedback.tsx`.
- `packages/web/src/game/effects/combatPresentation.test.ts`.
- `docs/phase7-generic-combat-feedback.md` (this report).

## 13. Files modified

- `packages/web/src/game/effects/combatPlayback.ts` and its existing test.
- `packages/web/src/game/effects/visualResolution.ts`.
- `packages/web/src/game/effects/useVisualResolution.ts` and its existing test.
- `packages/web/src/game/effects/types.ts`.
- `packages/web/src/game/effects/eventToEffects.ts` and its existing test.
- `packages/web/src/game/effects/useBoardEffects.ts`.
- `packages/web/src/game/effects/BoardEffectsLayer.tsx`.
- `packages/web/src/features/sfx/sfxEventMapper.ts` and its existing test.
- `packages/web/src/features/sfx/sfxPlaybackSession.ts`.
- `packages/web/src/features/vfx/vfxEventMapper.ts`.
- `packages/web/src/features/vfx/useBoardVfx.ts`.
- `packages/web/src/components/Board.tsx`.
- `packages/web/src/styles.css`.
- `packages/web/scripts/sfx-smoke.mjs`.

No rules/server source, shared event contract, gameplay mechanic, asset registry,
audio manager, transport dedupe or dependency was changed.

## 14. Tests added

Fourteen new regressions cover: pending/click silence; actual ordered dice and
tie-break values; noncombat roll exclusion; synchronized impact/HP/death phases
in normal/reduced motion; miss and zero-damage hit semantics; heal tween and
snapshot silence; full/partial/direct AoE ownership; distinct correlated AoEs;
early shared dice in explicit/legacy buffers; missing anchors and P1/P2 geometry;
event-time token death location; duplicate/reconnect delivery; late consumer
epochs and cancelled death audio; actual Sans Last Attack; and a complete pending
HP/death plan cancelled across audio, sprites, text and HP on room/role/stream
reset. Existing tests retain their checks; combat fixtures now include explicit
event-time anchors rather than relying on current-position fallback.

The existing DB-free browser smoke additionally observes actual roll UI values,
registered generic sprites, native Web Audio source times, HP fill changes and
miss HP silence.

## 15. Test results

| Check | Result |
| --- | --- |
| `npm run -w web test:effects` | 108 passed |
| `npm run -w web test:sfx` | 38 passed |
| `npm run -w web test:vfx` | 50 passed |
| `npm run test:web` | 574 passed |
| `npm run test:rules` | Gameplay/snapshot runner and architecture boundaries passed |
| `npm run -w web test:sfx:e2e` | Expanded headless browser smoke passed |
| ESLint on changed effects/SFX/VFX code and tests | Passed |
| `git diff --check` | Passed |
| `npm run build` | Passed (rules, server, web typecheck and Vite production bundle) |

Effects/VFX/SFX counts overlap the full web suite; they are not additional unique
tests. The rules suite was also run as a pre-death regression check even though
rules/server/shared types were not modified.

## 16. Manual browser test

The DB-free local test-room smoke was executed in headless Chromium/Edge against
the real server transport and manual Roll buttons. It verifies actual attacker
and defender values/order, UI click/result separation, hit/miss/final death audio
and registered sprites, shared impact timestamp (within 100 ms), HP decreasing
after impact, unchanged HP on miss, duplicate silence, mute/volume persistence,
silent reload/reconnect, native WAV decoding and mobile overflow checks.

Screenshots were captured and inspected. The defense panel shows authoritative
attacker dice `[5, 4]` while awaiting the defender; the normal pending modal blurs
the board until collapsed/resolved. The defender screenshot shows the actual
`[1, 1]`, total `2`, and `2d6` in the board result card. The new board dice display was observed by
the smoke harness and is noninteractive. Evidence lives under
`packages/web/test-results/sfx/`, including `report.json` and roll screenshots.

No human listening or manual two-player match was performed. Healing and Sans
pre-death were verified in semantic/rules integration tests; P2 orientation was
verified with the existing geometry and unit regressions, rather than a second
live browser client. These distinctions are intentional reporting limits.

## 17. Deferred work

- Movement/hazard feedback expansion (Phase 8 and later).
- Kaiser/Vlad hero presentation.
- Sans hero presentation.
- Asgore hero presentation.
- River/Tralala presentation.
- Remaining hero effects.
- Persistent status VFX.
- Final polish/performance.
- Upstream event-time heal/direct-AoE target anchors and a registered generic heal
  sound/sprite, if desired later. Until then positional cues are skipped safely.

Existing legacy hero mappings were preserved; no new signature mapping was wired.
No next roadmap phase was started.
