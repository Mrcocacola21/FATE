# Phase 9 — Kaiser + Vlad AoE pack

Implemented against the current rules. No gameplay mechanics, probabilities, costs, damage calculation, or movement-slot consumption changed. The four rules-file edits only identify Vlad's resolved Stare and authorize that identity for each recipient; Undyne's shared displacement remains generic.

## 1. Kaiser Dora

- Active targeting uses the existing projected `getDoraTargetCenters` helper, including empty cells, allies that do not block, and the first enemy cell that stops the ray. The server still validates centers against `isDoraCenterOnArcherLine`.
- A hovered legal center gets a lightweight 3×3 area preview. An empty center/area needs no visible targets. Hover and target selection generate no signature sound or impact sprite.
- Confirmed `abilityUsed` can release the existing restrained caster flash before manual roll decisions. Dora's signature audio and composite area art are reserved for completed `aoeResolved`.
- Normalized `rollResolved` supplies one shared attacker roll and individual defender rolls. `attackResolved` supplies each target's hit/miss, damage and HP; `unitDied` supplies final death.
- The completed aggregate authorizes one full logical 3×3 impact, including a legal zero-target use. Zero targets generate no attacker/defender dice or target outcomes in the current Dora rules.
- Verified current rules: Action slot, charge cost 2 before transformation, no Bunker prerequisite; transformed Dora skips charge expenditure and uses the transformed Kaiser's attack stat (2 before existing modifiers). Rules remain unchanged.

## 2. Carpet Strike

- Existing charged Impulse flow determines the center through authoritative 2d9. There is no local Carpet targeting mode and no arbitrary center selection.
- Normalized center `rollResolved` now uses the existing dice presentation, with an explicit center-roll label and 2d9 display. Specialized Carpet bookkeeping events cannot produce extra dice cues.
- After the center is known, projected `pendingAoEPreview` provides a 5×5 telegraph. Waiting recipients may see this already-public geometry without access to private selection details.
- One shared Kaiser attack roll precedes individual defender rolls. Completed `aoeResolved` provides one 5×5 composite impact and signature sound before target HP phases.
- Presentation reads authoritative damage; it does not calculate bonuses. Tests include a nearby Vlad Warlord and an allied defender: failed Carpet defenses remain 1 damage each.
- Hidden affected units use the existing `stealthRevealed`/movement presentation once. The Carpet mapper never synthesizes a reveal.
- Verified current rules: charge 3, no Action/Move expenditure, allies and enemies, transformed Kaiser immunity, active-Bunker caster immunity. Even a zero-target Carpet still rolls center and shared attack under the current state machine.

## 3. Bunker

- Successful `bunkerEntered` plays the registered entry sound and existing short shield effect. Failed entry never gets the entry signature or active decoration; existing generic failure feedback remains.
- `bunkerExited` plays the exit sound and a restrained 250 ms static Bunker transition.
- A static `bunker_status.png` decoration follows projected active state alongside the existing B badge. It has no application animation, timers, or sound.
- Hydrating/reconnecting to active Bunker renders the decoration silently. One-shots still require fresh events.
- Verified rules retain 4–6 successful entry, visible Kaiser, three own-turn duration with exit at the fourth start, normal-attack exit, Dora/Carpet preservation, transformed entry prohibition, and authoritative defensive damage clamp. No inferred damage-reduction accent was added.

## 4. Field of Stakes

- Existing Phase-8 owner-projected placement continues to use `stakePlace` at the authorized cells. Phase 9 adds one Vlad placement sound, selected deterministically from three existing variants.
- Opponent/spectator `hiddenSetupCompleted` remains a safe nonpositional notice with no new placement signature. No positions, stereo information, or hidden counts are inferred.
- Restored markers remain state-driven; snapshot state cannot replay placement.
- Current rules keep battle-start placement and three-stake own-turn placement from the second own turn. At the Forest threshold the placement trigger is skipped.

## 5. Forest of the Dead

- `forestActivated` precedes center selection. It keeps restrained existing activation feedback and never creates a guessed eruption. No impact sound plays at activation.
- Owner `vladForestTarget` selection highlights board centers and previews the hovered 3×3. Accepted center geometry then comes from projected `pendingAoEPreview`.
- One shared attacker roll and individual defender rolls reuse generic combat. Only completed `aoeResolved` authorizes the 3×3 primary/accent eruption and the existing `vladForestCast.wav`, intentionally scheduled as impact audio.
- Target damage, HP, movement-disabled state and final death remain authoritative and generic. Persisting movement-disabled state cannot replay the eruption.
- Nine consumed stakes never supply eruption geometry. Tests check serialized activation payloads: neither hidden stake IDs nor consumed coordinates appear.
- Verified current rules consume exactly nine at the threshold and skip extra placement. Forest's base damage override is 2 and it sets next-turn movement disable. The current resolver can also supply an existing Warlord bonus; this pack preserves that behavior and displays the actual result rather than assuming damage is always 2.

## 6. Intimidating Stare

- The optional defense-triggered decision retains existing UI/legal destinations. Opening the prompt has no movement or final signature.
- Accepted `intimidateResolved` now carries `abilityId: vladIntimidate` only when its real source is Vlad and the recipient may know that source. It adds no source-position data. Hidden source identity is stripped; Undyne receives no Vlad signature.
- Resolved Stare adds one small gaze sprite at the authorized displaced unit's origin and one signature sound. Phase-8 forced movement alone interpolates actual `from` → `to`; there is no second displacement animation.
- Regression tests verify the attacker still has its Move slot, gets legal movement highlights, can submit a legal destination through the production click handler, and can execute that move through the real rules.

## 7. AoE presentation model

```text
local targeting preview ≠ confirmed cast ≠ aggregate impact ≠ per-target outcome

preview:         local outlines/tint; no outcome audio/sprites
confirmed cast:  abilityUsed / forestActivated; no guessed impact area
manual dice:     authoritative center/shared attack/individual defense results
impact:          completed aoeResolved authorizes one correlated area signature
target outcomes: attackResolved owns hit/miss/damage/HP; unitDied owns final death
```

When a completed batch contains preceding target attacks, the scheduler uses ability-use/chain correlation to start the aggregate before the first matching target outcome. It preserves event order and existing damage/death ownership. Unrelated heroes retain their current scheduling. Cosmetic sprites do not lock gameplay or require completion acknowledgments.

## 8. Damage and delivery dedupe

Existing Phase-7 correlation makes `attackResolved` own target damage and HP. `aoeResolved.damageByUnitId` cannot schedule those targets again. The hero mappers only add aggregate geometry/audio.

Hero signature identities include stream plus `abilityUseId`, falling back to stable event identity, plus the cue stage. They never dedupe on `abilityId` alone. Duplicate aggregate events within a batch and repeated cue delivery are suppressed; a distinct use plays again. Existing ingress/session baselines discard historical events and reset on room/role/stream change. State rendering cannot create historical signatures.

## 9. Assets registered or reused

All paths below are relative to `packages/web/src/assets/`. No new artwork or audio files were created.

| SFX key added | Asset path |
| --- | --- |
| `hero.grand-kaiser.abilities.kaiserDora` | `sfx/heroes/grand-kaiser/abilities/Dora.wav` |
| `hero.grand-kaiser.abilities.kaiserCarpetStrike.launch` | `sfx/heroes/grand-kaiser/abilities/kaiserCarpetStrikeLaunch.wav` |
| `hero.grand-kaiser.abilities.kaiserCarpetStrike.impact` | `sfx/heroes/grand-kaiser/abilities/kaiserCarpetStrikeImpact.wav` |
| `hero.grand-kaiser.statuses.bunker.enter` | `sfx/heroes/grand-kaiser/abilities/kaiserBunkerEnter.wav` |
| `hero.grand-kaiser.statuses.bunker.exit` | `sfx/heroes/grand-kaiser/abilities/kaiserBunkerExit.wav` |
| `hero.vladTepes.abilities.vladStakes.place` | `sfx/heroes/vladTepes/abilities/vladStakesPlace01.wav`, `sfx/heroes/vladTepes/abilities/vladStakesPlace02.wav`, `sfx/heroes/vladTepes/abilities/vladStakesPlace03.wav` |
| `hero.vladTepes.abilities.vladForest.impact` | `sfx/heroes/vladTepes/abilities/vladForestCast.wav` |
| `hero.vladTepes.abilities.intimidatingStare` | `sfx/heroes/vladTepes/abilities/vladIntimidateActivate.wav` |

These use existing cached/lazy Web Audio playback, deterministic variant selection and mute/volume controls. No separate Forest activation sound or speculative Dora launch key was added.

| VFX key | Asset paths | Frames / duration | Geometry |
| --- | --- | --- | --- |
| `doraImpact` (reused; now mapped live) | `vfx/heroes/grand-kaiser/dora_impact_primary.png`, `vfx/heroes/grand-kaiser/dora_impact_accent.png` | 28 each / 1150 ms | 3×3 area |
| `carpetImpact` (reused; now mapped live) | `vfx/heroes/grand-kaiser/carpet_impact_primary.png`, `vfx/heroes/grand-kaiser/carpet_impact_accent.png` | 32 each / 1600 ms | 5×5 area |
| `forestEruption` (added) | `vfx/heroes/vladTepes/forest_eruption_primary.png`, `vfx/heroes/vladTepes/forest_eruption_accent.png` | 30 each / 1250 ms | 3×3 area |
| `vladGaze` (added) | `vfx/heroes/vladTepes/gaze.png` | 12 / 500 ms | 0.6-cell signature at resolved origin |
| `stakePlace` (reused) | `vfx/heroes/vladTepes/stakes_place.png` | 10 / 400 ms registry default; existing movement scheduler supplies its burst timing | authorized owner cells, 0.65-cell playback |
| `bunkerStatus` (reused) | `vfx/heroes/grand-kaiser/bunker_status.png` | 1 static frame | persistent cell decoration; exit 250 ms |
| `shield` (existing Bunker entry) | `vfx/curated/pipoya-hex-shield/hex-shield-strip.png` | 20 / 850 ms | 1.45-cell unit effect |

Generated sprites have 128×128 source frames; the curated shield uses 192×192. Area primary and accent share one parent clock and cue. Logical width/height remain intact at edges; the canonical VFX board root clips them. P1/P2 use existing canonical geometry. Reduced motion keeps area geometry and displays static middle frames, including both layers.

## 10. Files created

- `packages/web/src/game/effects/heroPresentation.ts`
- `packages/web/src/game/effects/kaiserVladPresentation.test.ts`
- `docs/phase-9-kaiser-vlad.md`

## 11. Files modified

Rules presentation identity/projection only:

- `packages/rules/src/core/events/combatEvents/tacticalEvents.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveVladRoll/intimidate.ts`
- `packages/rules/src/view/eventPayload.ts`
- `packages/rules/src/view/events.ts`

Web presentation, targeting and constants:

- `packages/web/src/assets/sfx/registry.ts`
- `packages/web/src/components/Board.tsx`
- `packages/web/src/features/sfx/sfxEventMapper.ts`
- `packages/web/src/features/vfx/useBoardVfx.ts`
- `packages/web/src/features/vfx/vfxEventMapper.ts`
- `packages/web/src/features/vfx/vfxPreviewScenarios.ts`
- `packages/web/src/features/vfx/vfxRegistry.ts`
- `packages/web/src/features/vfx/vfxTypes.ts`
- `packages/web/src/game/effects/CombatRollFeedback.tsx`
- `packages/web/src/game/effects/combatPlayback.ts`
- `packages/web/src/game/effects/visualResolution.ts`
- `packages/web/src/game/targeting/buildAbilityPreview.ts`
- `packages/web/src/game/targeting/buildActionPreview.ts`
- `packages/web/src/game/targeting/buildPendingPreview.ts`
- `packages/web/src/game/targeting/selectBoardPreview.ts`
- `packages/web/src/i18n/locales/en.ts`
- `packages/web/src/i18n/locales/uk.ts`
- `packages/web/src/rulesHints.ts`
- `packages/web/scripts/vfx-infrastructure-smoke.mjs`
- `packages/web/scripts/movement-smoke.mjs`

The constants facade reexports the existing pure rules constants module so Vite does not import the server-owned CommonJS rules entry point at runtime.

## 12. Tests added

21 new integration/renderer tests in `kaiserVladPresentation.test.ts`, exercising actual rules and recipient projection where applicable:

- Dora center legality, empty hover/commit and absence of preview signatures.
- Empty Dora/Carpet/Forest, including their actual differing dice behavior.
- Three-target hit/miss cases for every AoE, one shared attack, three defenses, one area, semantic area-before-HP order in both motion modes.
- Carpet center 2d9 display, pending telegraph, allied targets, one reveal and fixed damage with Warlord nearby.
- Forest activation before center, skipped placement at threshold, consumed-stake payload privacy, status application and public confirmed geometry.
- Owner-only stake placement/audio; safe opponent/spectator notices.
- Bunker success/failure/exit, silent active hydration and static decoration.
- Stare prompt/resolution separation, one generic movement, source-identity redaction, normal Move highlights/click/rules execution.
- Undyne shared displacement without Vlad's identity.
- Actual live chain release without repeated rolls; early cast without premature impact.
- Event/use signature dedupe, distinct uses and reconnect baseline behavior.
- Paired full-size edge/corner geometry for all three AoEs in P1/P2 and reduced motion.
- Generic damage-before-final-death/removal.

Existing browser smoke tests were extended for Forest, all three AoEs in reduced motion, and one Stare signature alongside forced movement.

## 13. Test results

| Command | Result |
| --- | --- |
| `npm run -w web test:effects` | PASS — 147 tests |
| `npm run -w web test:sfx` | PASS — 38 tests |
| `npm run -w web test:vfx` | PASS — 50 tests |
| `npm run test:web` | PASS — 613 tests; 2 suite executions |
| `npm run -w rules test` | PASS — existing gameplay/semantic/snapshot runner |
| `npm run test:server` | PASS — 11 suite executions |
| `npm run build` | PASS — rules, server, web typecheck and production bundle |
| `npm run -w web test:vfx:infrastructure` | PASS — headless browser smoke |
| `npm run -w web test:movement:e2e` | PASS — headless browser smoke |
| `git diff --check` | PASS |

Production build retains its existing bundle-size/Browserslist warnings. No test assertions were weakened.

## 14. Manual/browser verification

No manual two-player WebSocket match was performed. In-app browser Node REPL was unavailable, so browser checks used the repository's local headless Edge/Playwright tools.

Actually verified through the production Board/preview renderer:

- 36 area cases: Dora, Carpet and Forest; center/four edges/corner; P1 and P2.
- Full logical size, board clipping, primary/accent timing and layer order.
- All three static reduced-motion area effects, resize stability, cleanup and pointer input through an active effect.
- Stare's one signature per rendered recipient plus generic forced interpolation in opposite P1/P2 directions.
- Owner-only placement sprites; opponent receives no placement sprites.
- Existing hazard arrival ordering, one damage text, reset cleanup and usable board pointer input.
- No page errors.

Screenshots/reports are generated under `packages/web/test-results/vfx-infrastructure/` and `packages/web/test-results/movement/`. Forest center/corner and dual-view Stare screenshots were inspected. Gameplay-specific preview/cast/damage/privacy checks above were automated integration tests, not claimed as manual browser play. Live human audio quality was not manually auditioned.

## 15. Deferred work

- Sans pack.
- Asgore pack.
- Boat / Tralala pack.
- Remaining hero packs.
- General persistent status VFX (only the small Bunker static decoration was included here).
- Final performance/polish, including manual audio balancing and a manual two-player match.

No subsequent roadmap phase was started.
