# Phase 10 — Sans Pack

Completed on 2026-10-08. This change adds Gaster and Last Attack presentation to
the existing event-delivery, projection, manual combat and playback systems.
Previous phases and other hero packs were preserved.

1. **Gaster targeting.** The existing `packages/rules/src/sans.ts`
   `isSansCenterOnAttackLine` and `collectSansLineTargetIds` use Mettaton's full-ray
   helpers, rather than normal Archer targeting. Normal Archer still stops at the
   first enemy. Gaster remains an Impulse costing Charge(2). Following the user's
   friendly-fire update, its collector includes living allies and enemies, and
   its queue explicitly allows friendly targets. The web full-line preview
   highlights every visible target on the selected ray and emits no audio/VFX.

2. **Gaster geometry.** The completed, projected `aoeResolved.sourceCell` is the
   frozen ability-use origin; `center` is the selected direction point. The VFX
   mapper validates a nonzero orthogonal/diagonal line, then sends a `ray` request
   with `rayToEdge: true`. The Phase-6 `rayToBoardEdge` calculates the literal
   board boundary, beyond the final cell center. For example, C3 pointing east
   reaches the outside edge of I3 on a 9×9 board. Target distance never sets beam
   length. Canonical rendering transforms handle P1/P2 orientation and cannon
   facing. Tests include asymmetric diagonals in both orientations.

3. **Affected targets.** Rules collect all living allies and enemies on the
   selected full ray, excluding the caster. Each enters the authoritative combat
   queue with one shared attacker roll and an individual defender roll owned by
   the target's player. Friendly hits, damage and deaths use normal combat
   resolution. Units never block the ray; artwork never selects targets or derives
   damage from overlap. Visual beam thickness does not widen the rules' cell ray.

4. **Timeline.** One completed use is released through the existing chain
   scheduler: summon at 0ms → charge sound at 100ms → paired beam/fire sound at
   500ms → individual target outcomes from 650ms onward. Beam lifetime is 850ms.
   The entire signature starts before the first correlated target outcome.
   Manual dice remain live while the shared scheduler buffers outcomes; the
   signature intentionally waits for authoritative chain completion. Nothing
   waits for cosmetic completion on the server. Empty rays also fire once.

5. **Assets.** No artwork or sounds were generated. All paths are existing files
   relative to `packages/web/src/assets/`.

   | Runtime key | Exact path | Metadata |
   | --- | --- | --- |
   | `gasterCannon` | `vfx/heroes/sans/gaster_blaster.png` | User-provided static 2000×2000 PNG; 1350ms; 1.05 cells; mouth attachment at 50% / 80% with slight beam overlap, closer to the cell center; clipped dark backing fills transparent face openings; dark silhouette outline and shadow with a subtle cyan glow for portrait/background contrast; authored downward facing rotated −90° relative to the ray; projectile layer |
   | `gasterBeam` primary | `vfx/heroes/sans/gaster_beam_primary.png` | 20 × 128×128 frames; 850ms; board-edge ray; 1.125-cell thickness; projectile layer |
   | `gasterBeam` accent | `vfx/heroes/sans/gaster_beam_accent.png` | Same frame/timing/geometry as primary; shared wrapper; crop `{left:12, top:48, width:104, height:32}` on both layers |
   | `sansCurseApply` | `vfx/heroes/sans/curse_apply.png` | 14 × 128×128 frames; 600ms; 0.75 cells; status layer |
   | `sansCurseTick` | `vfx/heroes/sans/curse_tick_end.png` | 10 × 128×128 frames; 400ms; 0.6 cells; opacity 0.65 |
   | `sansCurseRemove` | `vfx/heroes/sans/curse_tick_end.png` | Final frames 5–9; 240ms; 0.45 cells; opacity 0.4 |
   | `hero.sans.abilities.sansGasterBlaster.charge` | `sfx/heroes/sans/abilities/sansGasterBlasterCharge.wav` | gain 0.5; one voice |
   | `hero.sans.abilities.sansGasterBlaster.fire` | `sfx/heroes/sans/abilities/sansGasterBlasterFire.wav` | gain 0.6; one voice |
   | `hero.sans.abilities.sansLastAttack.apply` | `sfx/heroes/sans/abilities/sansLastAttackApply.wav` | gain 0.5; one voice |
   | `hero.sans.abilities.sansLastAttack.tick` | `sfx/heroes/sans/abilities/sansLastAttackTick01.wav`, `sansLastAttackTick02.wav` in the same directory | deterministic event-key variant; gain 0.35; one voice |
   | `hero.sans.abilities.sansLastAttack.remove` | `sfx/heroes/sans/abilities/sansLastAttackExpire.wav` | gain 0.3; one voice |

   All five sounds remain lazy and are selectively warmed when projected Sans or
   curse state is present. Decoding never blocks gameplay or causes late replay.
   Reduced motion samples static strip frames while retaining ray geometry and
   the same signature offsets. Apply, tick and removal remain distinct.

6. **Shared combat.** One manual `tricksterAoE_attackerRoll` is followed by one
   manual defender roll per target. `abilityUseId`/chain correlation identifies
   the single signature. Generic combat owns hit/miss, damage, HP and final
   deaths. Existing aggregate/per-target dedupe is preserved. Gaster's aggregate
   does not add an AoE box, short generic beam or duplicate damage. Curse ticks
   have one generic HP tween/number with their small Sans VFX/SFX, without an
   additional generic impact sound or sprite.

7. **Last Attack death pipeline.** Existing rules perform lethal damage →
   `sansPendingDeath` at zero HP while still alive/positioned → owner-only
   `selectLastAttackTarget` → accepted `sansLastAttackTarget` command →
   `sansLastAttackApplied` → final `unitDied`. This phase did not rewrite that
   pipeline. **Current-rule difference from an unconditional passive:** Last
   Attack requires `sansUnbelieverUnlocked`; locked Sans dies normally.

8. **Last Attack targets.** Every living enemy with HP above zero is legal,
   including distant/off-ray enemies and hidden enemies represented by permitted
   candidate identities. Hidden candidate positions are not disclosed. A missing,
   allied or unauthorized choice is rejected. No living enemy means no decision:
   death completes normally. Pending authority blocks unrelated actions and
   advancement; suspended manual combat resumes after the choice.

9. **Curse.** Current state uses `sansLastAttackCurseSourceId`, with
   `sansLastAttackLastTickTurnNumber` protecting activation continuations.
   Authoritative apply/tick/remove events drive one-shot feedback. Exactly one
   damage occurs at the cursed unit's own accepted turn start, clamped to 1 HP.
   Reaching 1 clears the curse with `reason: hpOne`; an already-one target clears
   without a tick. Target death clears it with `targetDead`. These mechanics
   already existed and remain unchanged. This phase adds event-time target cells
   plus captured authorization. The existing current-state Cursed pill remains;
   a new persistent board aura is deferred.

10. **Death presentation.** Generic death sprites/sounds and token removal are
    scheduled only by final projected `unitDied`, never HP zero or the Sans
    mapper. Accepted curse application leads final death by at least 220ms.
    Pre-death Sans therefore remains visible until the mandatory choice resolves,
    and the final death cue runs once.

11. **Reconnect/recovery.** `PresentationSession` snapshots establish silent
    baselines. A pending Last Attack snapshot restores the existing selection UI
    without old lethal/death cues. Active curse snapshots restore current status
    silently; future ticks/removals present normally. Completed Gaster never
    replays on reconnect. Stable transport IDs and defensive cue IDs suppress
    duplicate delivery. Existing snapshot validation and server recovery retain
    pending death, suspended roll continuation and the tick guard. No persistence
    format or recovery algorithm changed.

12. **Privacy.** Opponent/spectator views retain only their existing safe waiting
    presentation; no target list or interactive selection is exposed. Curse
    event payloads explicitly copy `targetCell` only when its event-time
    authorization permits that recipient. Existing reference authorization still
    applies. Missing Gaster source anchors suppress both cannon and beam;
    missing curse anchors suppress positional status art. Mappers do not recover
    those anchors from current tokens, raw state, DOM or last-known positions.
    Public semantic sounds follow the projected event contract.

13. **Files created.**
    - `packages/web/src/game/effects/sansPresentation.ts`
    - `packages/web/src/game/effects/sansPresentation.test.ts`
    - `packages/web/scripts/sans-smoke.mjs`
    - `docs/sans-pack.md`

14. **Files modified.**
    - `packages/rules/src/actions/heroes/sans/curses.ts`
    - `packages/rules/src/model/events/heroes.ts`
    - `packages/rules/src/view/eventPayload.ts`
    - `packages/rules/src/view/events.ts`
    - `packages/server/src/openapi/generated/responses.json`
    - `packages/web/package.json`
    - `packages/web/src/assets/sfx/registry.ts`
    - `packages/web/src/features/sfx/audioPreload.ts`
    - `packages/web/src/features/sfx/sfxEventMapper.ts`
    - `packages/web/src/features/sfx/useBoardSfx.ts`
    - `packages/web/src/features/vfx/VfxLayer.tsx`
    - `packages/web/src/features/vfx/vfxEventMapper.ts`
    - `packages/web/src/features/vfx/vfxInfrastructure.test.tsx`
    - `packages/web/src/features/vfx/vfxPreviewScenarios.ts`
    - `packages/web/src/features/vfx/vfxRegistry.ts`
    - `packages/web/src/features/vfx/vfxTypes.ts`
    - `packages/web/src/game/effects/combatPlayback.ts`
    - `packages/web/src/game/effects/eventToEffects.ts`
    - `packages/web/src/rulesHints.ts`

15. **Tests added.** Ten Sans tests cover selective sound warming; real multi-target
    manual chain delivery and mixed outcomes; empty/lethal rays; piercing preview;
    horizontal, vertical and asymmetric diagonal geometry in both orientations;
    frozen/missing origins and reduced motion; pending Last Attack authority,
    privacy, reconnection and final death order; one curse tick/HP number/removal;
    event-time anchor privacy; silent history and duplicate transport. Runtime
    preview assertions now verify registered start/end frame slices and frame
    counts, including curse removal. A repeatable browser script runs through
    `npm run -w web test:sans:e2e`. Existing rules tests already cover normal Archer,
    Gaster piercing/allies, no-target death, any-enemy selection, own-turn ticking,
    HP floor, pending blocking and resumed rolls. Existing server Sans tests cover
    authenticated choice and snapshot restoration.

16. **Results.** All passed:
    - `npm run -w rules test`
    - `npm run -w web test:effects` — 157 tests
    - `npm run -w web test:sfx` — 38 tests
    - `npm run -w web test:vfx` — 50 tests
    - `npm run test:web` — 623 tests
    - `npm run test:server` — 11 suite executions
    - dedicated server Sans tests — 2 tests
    - `npm run test:contract` — 20 suite executions
    - `npm run -w web test:sans:e2e`
    - `npm run build`, web typecheck, and `git diff --check`

    Production build retains its existing large-chunk/Browserslist/Vite warnings.
    Logs are under root `test-results/sans-*.log`; runner summaries are under
    `test-results/testing/`.

17. **Browser checks actually performed.** Headless local Edge rendered real
    rules-generated fixtures through the production Board, Last Attack owner
    notice, opponent waiting component, sprite renderer and audio scheduler.
    Checked one cannon/charge/fire per recipient, paired animated diagonal ray,
    opposite P1/P2 rotations, board clipping, manual decision submission while
    playback is active, silent Gaster reconnect, pre-death token retention,
    owner-only choice, opponent waiting, pending-choice reconnect, curse-before-
    final-death, one final death, silent active-curse reconnect, and subsequent
    2→1 tick/removal without death. Audio assets were decoded and Web Audio
    playback started; there was no subjective listening. CSS beam frames were
    sampled at the same offset for orientation screenshot comparison. No page
    errors occurred. **No live two-player server match or human manual match was
    performed.** Browser reports/screenshots are generated under
    `packages/web/test-results/sans/`.

18. **Deferred roadmap work only.** Asgore Pack; River Person / Boat / Tralala
    Pack; remaining heroes; persistent status VFX; preload/performance/final polish.
    No later phase was started.
