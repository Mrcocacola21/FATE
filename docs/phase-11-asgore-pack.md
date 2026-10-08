# Phase 11 — Asgore Pack

Implemented against the current repository; no assets or gameplay mechanics were created or changed.

## 1. Current kit audit

Canonical definitions: `packages/rules/src/abilities/specs/part3.ts`; ownership: `abilities/viewIds.ts`; execution: `actions/heroes/asgore/` and `pendingRoll/resolvers/heroes/resolveAsgoreRoll/`.

| Ability ID | Taxonomy | Required / cap | Slot cost | Targeting and combat | Semantic events | Integration |
| --- | --- | --- | --- | --- | --- | --- |
| `asgoreFireball` | Active | 2 / 2 | Action; no Move; pending combat consumes no additional slots | Legal enemy in existing Archer targeting; manual attacker and defender rolls, normal attack damage | `abilityUsed`, `rollResolved`, `attackResolved`, eventual `unitDied` | Confirmed cast, travel, hit or miss termination, signature hit audio, generic HP/death |
| `asgoreFireParade` | Active | 5 / 5 | Action; no Move | Chebyshev radius 2 around caster, every other unit including allies; reveals hidden targets; one shared attacker roll, individual defenses | `abilityUsed`, `rollResolved`, per-target `attackResolved`, aggregate `aoeResolved`, eventual `unitDied` | Cast audio, one generated primary/accent area signature, generic target outcomes |
| `asgoreSoulParade` | Impulse | 3 / 3 | Automatic own-turn trigger; no Action/Move slot; cost commits when the selected outcome resolves | 1d6 selects Patience, Bravery, Integrity, Perseverance, Kindness or Justice; subsequent legal choices use existing projected options | `asgoreSoulParadeResolved`, `abilityUsed` on cost commitment; branch-specific generic combat, `unitMoved`, `unitHealed` | Generated result reveal and audio once; existing branch presentation reused |

No Asgore Phantasm or additional named passive ability IDs exist. Innate mechanics remain unchanged: base HP 9 (+3 over Knight), Spearman attack reach and defense-double dodge. Their generic combat presentation remains active.

## 2. Fireball correlation

`commitAbilityCost` allocates one deterministic `ability-use-N`. The existing authoritative chain is:

```text
abilityUsed(asgoreFireball, U)
  -> attack_attackerRoll pending context(asgoreFireball, U)
  -> attacker rollResolved(asgoreFireball, U)
  -> attack_defenderRoll pending context(asgoreFireball, U)
  -> defender rollResolved(asgoreFireball, U)
  -> attackResolved(asgoreFireball, U, hit, sourceCell, targetCell)
```

Recovery serializes this pending context and retains U. Existing generic correlation already worked and was preserved. Fireball classification requires both the authoritative ability ID and a nonempty use ID. It never reads React selection, click history, targeting mode, elapsed time, or a unit's last ability. Generic damage attribution now copies the event's `abilityId` directly instead of inferring it from an earlier ability use in the batch.

## 3. Fireball presentation

Existing targeting previews consume rules-projected `AbilityView.targeting`; no Archer calculation was added to React. Preview selection produces no cast/travel/impact cues.

Committed `abilityUsed` plays cast once, at its projected event-time source. The shared scheduler preserves manual attacker/defender dice. Only completed `attackResolved` schedules travel, using the event's source and target. Travel lasts 400ms in normal and reduced-motion schedules, followed by either signature impact or generic miss termination. Signature hit replaces the generic hit sprite and hit sound. Damage number, HP tween, pre-death choices and final death retain generic ownership. The plan reserves the signature's lifetime so another presentation cannot truncate it.

IDs are deterministic children of U and the stream namespace: `cast`, `travel`, `impact`/`miss`, with corresponding audio children. Repeated legitimate uses have different U values.

## 4. Miss safety and verified frame ranges

Inspected the actual 2176×128 PNG and its manifest. It contains 17 frames of 128×128. The manifest describes cast/travel/hit/miss but supplies no phase boundaries; the later artwork does not establish an unambiguous dedicated miss slice.

The conservative runtime ranges are zero-based and inclusive:

- Cast: **0–1**, transparent entrance and compact early ember.
- Travel: **1–1**, hold the compact ember while shared projectile geometry moves it.
- Hit: **0–16**, the combined flame strip is permitted only for `attackResolved.hit === true` with Fireball correlation.
- Miss termination: existing **`combatMiss`**, with no later Fireball frames at the target.

There is no claim that undocumented later frames have been precisely classified. All of them are excluded from the miss path. Tests inspect resolved registry ranges and `spritePlayback`, assert zero hit sprites/impact audio/damage tweens/death on miss, and verify one miss termination.

## 5. Fireball assets

All SFX paths below are relative to `packages/web/src/assets/`; all are registered lazily as gameplay sounds.

| SFX key | Existing file(s) | Trigger |
| --- | --- | --- |
| `hero.asgore.abilities.asgoreFireball.cast` | `sfx/heroes/asgore/abilities/asgoreFireballCast.wav` | Correlated committed use |
| `hero.asgore.abilities.asgoreFireball.travel` | `sfx/heroes/asgore/abilities/asgoreFireballTravel.wav` | Authorized source/target travel |
| `hero.asgore.abilities.asgoreFireball.impact` | `sfx/heroes/asgore/abilities/asgoreFireballImpact01.wav`, `asgoreFireballImpact02.wav` in the same folder | Confirmed hit only; two explicit variants |

Variant selection uses the existing presentation-local resolver and never consumes gameplay RNG. The finite travel sound is bounded with Web Audio's duration argument. Late scheduling clips the remaining lifetime or drops an expired travel cue; reset stops gameplay voices.

VFX path: `vfx/heroes/asgore/fireball.png`. Runtime definitions: `fireballCast` (2 selected frames / 125ms = 16fps, 0.65-cell box), `fireball` (one held frame / 400ms travel, 0.65-cell box), `fireballImpact` (17 frames / 700ms = 24.29fps, 0.85-cell box). Shared projectile geometry handles legal directions, P1/P2 orientation and cell-size changes. Source PNGs remain untouched.

## 6. Fire Parade

Actual mechanics: radius-two Chebyshev area, caster excluded, allies included, hidden units revealed, shared attack roll plus per-target defense. Cost: 5 charges and Action, exactly once.

`abilityUsed(asgoreFireParade, U)` plays `hero.asgore.abilities.asgoreFireParade.cast`, sourced from `sfx/heroes/asgore/abilities/asgoreFireParadeCast.wav`. The completed correlated `aoeResolved` authorizes one 5×5 event-centered signature before the first target outcome; the board root clips edge overflow. No impact WAV exists in this pack, so no new one was invented.

Artwork: `vfx/heroes/asgore/fire_parade_primary.png` and `fire_parade_accent.png`, each 3712×128, 29 frames, shared 1200ms lifetime (24.17fps), ground layer. Individual `attackResolved` events own HP/damage; the aggregate cannot apply them again. Only final `unitDied` drives death. Cast stays live while manual decisions are pending; area art waits for authoritative completion.

## 7. Soul Parade and current statuses

`asgoreSoulParadeResolved` plays one event-ID-based reveal even when a later choice has not yet spent charges. The trigger reflects the actual resolved soul, never the button click. Artwork: `vfx/heroes/asgore/soul_parade.png`, 2816×128, 22 frames, 900ms (24.44fps), 1.2-cell source box, status layer. Audio: `hero.asgore.abilities.asgoreSoulParade.reveal` → `sfx/heroes/asgore/abilities/asgoreSoulParadeReveal.wav`.

Existing branch behaviors remain authoritative:

- Patience: Assassin-range attack if available and temporary stealth eligibility; generic combat/stealth cues.
- Bravery: one-use automatic defense readiness; existing projected flag and generic miss/defense result.
- Integrity: choose any legal empty cell, free teleport; Phase-8 event-time movement presentation.
- Perseverance: choose an enemy in Trickster range, existing failure check can disable its next movement; current projected status/UI.
- Kindness: +2 HP capped at maximum; generic heal HP tween.
- Justice: choose an Archer-line target; generic attack, never identified as Fireball.

No dedicated generated branch-status assets exist in the Asgore folder. The Soul Parade reveal uses the available seal artwork without inventing branch-specific frames or persistent effects. Current projected flags restore silently; full persistent status VFX remains deferred.

## 8. Charge metadata and gating

`AbilitySpec.chargesPerUse ?? chargeCost ?? 0` is the canonical cost (`getAbilityChargeCost`). Counters live in `UnitState.charges`; finite caps come from `maxCharges`, with `chargeUnlimited` handled by generic helpers. All three Asgore counters are finite.

Rules `canUseAbility`, `canCommitAbilityCost` and action rejection already use the full configured requirement. `getAbilityAvailability` exposes `canUse`, `requiredCharges`, `currentCharges` and structured disabled reasons. `PlayerView` sends `AbilityView.currentCharges`, `chargeRequired`, `maxCharges`, `chargeUnlimited`, `isAvailable`, `disabledReason` and `disabledReasonCode`; existing buttons consume that authoritative availability. Automatic impulses do not become manual commands.

No React charge costs or `charges > 0` readiness gates were added. Below-cost activations leave the entire state unchanged, allocate no use ID, spend no slots/counters, emit no events and create no pending work. Own-turn regeneration already increments and caps correctly; tests confirm accumulation and restart after spending.

## 9. Charge-ready feedback

For Fireball and Fire Parade, one restrained `statusSmall` source glow fires on a fresh `chargesUpdated` whose positive delta proves `previous < chargeRequired <= now`. The requirement comes from the projected ability metadata. It is anchored only to the recipient's currently visible unit, with no position-cache fallback. This readiness indicator uses no combat art or readiness sound.

Rendering a ready view cannot trigger it. Event ingress and VFX cue dedupe prevent duplicate delivery from replaying it. Initial/reconnect snapshots restore existing READY/counter UI silently. Soul Parade is automatic and gets its result reveal rather than a manual readiness pulse.

## 10. Rules fixes and semantic enrichment

No charge-gating, regeneration, Fireball-correlation or gameplay-mechanics fix was needed.

Tiny presentation changes:

- Asgore cost commitments expose a cloned optional `abilityUsed.sourceCell` with event-time recipient authorization. Other hero commitments retain their existing payloads.
- Soul result events expose a cloned authorized `sourceCell`.
- Payload copying and projection preserve authorized cells and remove unauthorized ones. Generated OpenAPI schemas include the two optional fields.
- Fixed an existing projection bug: `unitHealed.sourceAbilityId` was passed to a generic unit-ID visibility filter, which dropped ability-sourced healing. Healing now checks the healed unit, preserves visible HP semantics and separately redacts an unauthorized ability cause. Tests cover visible healing, private cause and hidden healed units.

## 11. Reconnect and duplicates

Existing `PresentationSession` owns event ingress, baseline silence and duplicate IDs. Existing visual resolution owns deferred chains and early manual rolls. Asgore cues reuse those systems, VFX processed identities and `SfxPlaybackSession` defensive dedupe. Room/role/stream reset invalidates old tokens, clears pending cues and stops gameplay audio. No historical cast/readiness/reveal is reconstructed from snapshots.

## 12. Privacy

Mappers consume only projected events and authorized `PlayerView`. Fireball travel requires both event-time cells; cast/impact/reveal require their respective authorized cell. Missing cells are never reconstructed from current tokens, raw state or `lastKnownPositions`. Missing/private Fireball correlation falls back to generic combat. Spectator tests use spectator-projected events and spectator views; event-time private source cells stay redacted even if the unit later becomes public.

## 13. Files created

- `docs/phase-11-asgore-pack.md`
- `packages/web/src/game/effects/asgorePresentation.ts`
- `packages/web/src/game/effects/asgorePresentation.test.ts`
- `packages/web/scripts/asgore-smoke.mjs`

Ignored local logs, fixtures, observations and screenshots are under `packages/web/test-results/asgore/`.

## 14. Files modified

Rules:

- `packages/rules/src/actions/abilityCosts.ts`
- `packages/rules/src/core/events/combatEvents/unitEvents.ts`
- `packages/rules/src/model/events/core.ts`
- `packages/rules/src/model/events/heroes.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveAsgoreRoll/roll.ts`
- `packages/rules/src/tests/core/presentationSemantics.test.ts`
- `packages/rules/src/view/eventPayload.ts`
- `packages/rules/src/view/events.ts`

Server: `packages/server/src/openapi/generated/responses.json` (generated contract only).

Web:

- `packages/web/package.json`
- `packages/web/src/assets/sfx/registry.ts`
- `packages/web/src/features/sfx/AudioManager.ts`
- `packages/web/src/features/sfx/audioPreload.ts`
- `packages/web/src/features/sfx/audioTestUtils.ts`
- `packages/web/src/features/sfx/sfxEventMapper.ts`
- `packages/web/src/features/sfx/sfxPlaybackSession.ts`
- `packages/web/src/features/sfx/sfxPlayer.ts`
- `packages/web/src/features/sfx/sfxTypes.ts`
- `packages/web/src/features/sfx/useBoardSfx.ts`
- `packages/web/src/features/vfx/README.md`
- `packages/web/src/features/vfx/vfxEventMapper.ts`
- `packages/web/src/features/vfx/vfxPreviewScenarios.ts`
- `packages/web/src/features/vfx/vfxRegistry.test.ts`
- `packages/web/src/features/vfx/vfxRegistry.ts`
- `packages/web/src/features/vfx/vfxTypes.ts`
- `packages/web/src/game/components/RightPanel/actionSummaries.test.tsx`
- `packages/web/src/game/effects/combatPlayback.ts`
- `packages/web/src/game/effects/eventToEffects.ts`
- `packages/web/src/game/effects/heroPresentation.ts`
- `packages/web/src/game/effects/visualResolution.ts`

## 15. Tests added

Ten focused Asgore integration tests cover authoritative correlation/recovery and normal-attack isolation; hit/miss ownership; actual safe runtime slices; UI selection independence; event-time geometry and P1/P2/resizing; silent reconnect and duplicates; privacy; Fire Parade allies/aggregate/HP/death; canonical costs and fresh readiness; all six Soul reveals with generic healing; Sans pre-death; and finite travel audio/preload/mute/reset.

Rules tests add source-cell and healing projection/privacy regression coverage. Existing button tests now exercise `required - 1` and exact requirement from metadata. Runtime preview coverage includes the new slices and an event-time Soul source. No tests were weakened to permit incorrect mechanics or a miss bloom.

## 16. Verification results

| Command | Result |
| --- | --- |
| `npm run -w rules test` | Pass; 450 reported checks |
| `npm run -w web test:effects` | Pass; 167 tests |
| `npm run -w web test:sfx` | Pass; 38 tests |
| `npm run -w web test:vfx` | Pass; 50 tests |
| `npm run test:web` | Pass; 633 tests |
| `npm run test:server` | Pass; 11 suite executions |
| `npm run test:contract` | Pass; 20 suite executions, including generated-schema consistency |
| `npm run -w web test:asgore:e2e` | Pass; local Chromium smoke harness |
| `npm run build` | Pass; rules, server, web typecheck and production bundle |
| `git diff --check` | Pass |

The build still reports its existing bundle-size warning. No database-backed server restart or real multiplayer match was exercised; pending recovery is covered by rules-state JSON round trips, existing server suites and the browser reconnect baseline scenario.

## 17. Browser verification actually performed

Automated local Chromium harness using production Board and ability buttons, with separate P1/P2 recipient projections and real rules-generated manual decision steps. Verified below/exact-cost buttons, committed cast, attacker and defender decision steps, no unresolved impact, changed UI selection, projectile/outcome cues, no hit bloom/impact audio on miss, Fire Parade signature, duplicates, silent defender-pending reconnect, reduced-motion safe miss and mute. Web Audio decoded the selected Asgore subset and played committed sounds in the harness. Screenshots of travel/outcome were visually inspected; no page errors occurred.

This was not a human-played server match or a subjective listening test. Lethal Sans pre-death, Soul branch semantics, charge-ready transitions, resize geometry, zero volume and travel voice cancellation were verified by focused automated tests rather than claimed as manual browser checks.

## 18. Deferred roadmap work

- River Person / Boat / Tralala Pack.
- Remaining heroes.
- Persistent status VFX.
- Final preload/performance/polish, including roster-aware VFX warming. The five used Asgore sound keys are roster-warmed; VFX remains lazy.

Stop after Phase 11; no subsequent hero pack was started.
