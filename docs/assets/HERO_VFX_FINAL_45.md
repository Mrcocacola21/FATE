# Final targeted VFX integration: 45 physical PNGs

## 1. Initial audit

The requested inventory matches the repository: **45 previously unregistered PNGs in 18 hero folders**, out of **137 hero PNGs**. PNG headers and authored frame metadata were inspected, along with representative frames. All requested frames are 128 × 128; the animations have 10–32 frames rather than one assumed strip length. PNG bytes and filenames were preserved.

## 2. Complete physical-file coverage

The [coverage table](../../packages/web/src/assets/HERO_VFX_COVERAGE.md) accounts for every primary, accent and standalone PNG, with ability/status, registry key, placement, authoritative trigger or state, lifetime, composite group, frame metadata and integration status. Its source is [heroVfxCoverage.json](../../packages/web/src/assets/heroVfxCoverage.json); regenerate with `npm run -w web generate:vfx-coverage`.

The final registry references **136 of 137 hero PNGs**. The sole remaining file is `undyne/shift.png`. None of the 45 files is reported REGISTERED_ONLY.

## 3. Primary and accent composition

The 13 new pairs produce one semantic request each, with two ordered `VfxDefinition.layers`. The existing `VfxLayer` shares placement, clock, duration, geometry and lifecycle between them; `VfxSprite` supplies matching frame stepping. Both layers start together and leave the queue together. A line with several authorized segments remains one cue, with shared timing for every segment.

## 4. Generic replacements

| Previous signature | Dedicated signature | Decision |
|---|---|---|
| Tisona `statusSmall` cast | `elCidTisona` at aggregate resolution | Replace; retain cast audio, avoid a duplicate cast graphic |
| Kolada `statusSmall` area | `elCidKolada` 3×3 | Replace |
| Papyrus Cool Guy `statusSmall` | `papyrusLine` | Replace; Long Bone shares the actual line renderer |
| Energy Spear `statusSmall` | `undyneEnergy` | Replace |
| Silver Crescent `statusSmall` | `artemidaCrescent` | Replace |
| Divine Ray `statusSmall` | `lucheRay` | Replace; distinguish line and around-self modes |
| Burning Sun `statusSmall` | `lucheSun` | Replace aggregate source accent |
| Laser / Final Chord `statusSmall` | `mettatonLaser` / `mettatonFinalChord` | Replace |
| Madness `statusSmall` | `donMadness` | Replace |
| Windmills `statusSmall` | `donWindmills` | Replace committed activation |
| Mongol Charge `genghisDecree` | `genghisCharge` | Replace committed activation |
| Demon Duelist `shield` | `elCidDuel` | Replace valid commitment |
| Khan's Shooter `statusSmall` cast | `jebeRicochet` per actual shot | Replace cast placeholder with resolved shot signatures |
| Bunker entry `shield`, exit status fade | `bunkerEntry`, `bunkerExit` | Replace one-shots; retain persistent `bunkerStatus` |

Generic hit/miss, damage text, HP transitions and final death remain separate outcomes. Charge-readiness indicators retain their separate meaning. No aggregate damage presentation was added.

## 5. All seven Frisk files

| File | Confirmed meaning |
|---|---|
| `clean_soul.png` | Static state art while projected `friskCleanSoulShield` is true; disappears on consumption |
| `cry.png` | `attackResolved.defenseSignature = friskCry`, set only after accepted, paid Child's Cry |
| `friendship.png` | Existing `friskFriendshipWon` victory transition; visible source burst |
| `keen_eye.png` | Actual `stealthRevealed` marked `revealSignature = friskKeenEye`, at its frozen revealed target cell |
| `one_path.png` | Existing owner-only `friskOnePathUnlocked`, fresh unlock only |
| `precision.png` | Existing `attackSignature = friskPrecisionStrike`; source-to-target projectile at the same attack-start time as precision audio |
| `substitution.png` | `defenseSignature = friskSubstitution`, set only after accepted, paid substitution |

Defense accents use outcome time. Precision, Jebe and Gungnir projectile travel is fitted to the shared attack-start/outcome interval (with the existing queue's 100 ms minimum for the static reduced-motion fallback), so a normal projectile arrives with its confirmed result. Menus, cancellation, insufficient resources and mere target consideration do not emit these signatures. No survival or death mechanic was added.

## 6. Kaneki

`centipede.png` uses the existing `kanekiFormEntered` Scolopendra transition from actual RC thresholds. It shares the confirmed event and timeline with `Scolopendra.mp3`. The event freezes its source cell; an already unlocked reconnect snapshot produces no entry animation. Existing hit, kill and turn-entry producers remain authoritative.

## 7. Loki

`spin.png` uses existing owner-only `lokiSpinCommitted` after successful payment and target eligibility. Its source is frozen at commitment, and it uses the same event delay as the existing Spin audio. There is no hover or menu trigger.

## 8. Genghis and Jebe

Charge has one composite at confirmed activation. Existing reached movement, reactions and generic attack outcomes retain their own pipeline; no future path is animated.

Jebe has one paired source-to-target projectile for each actual resolved shot. A real three-shot test exposed lost ability lineage after the first shot. The existing continuation now carries `sourceAbilityId` and the existing `AbilityUseContext`, including across an Intimidate interruption. All shots retain one legitimate use identity and distinct result event IDs. Attack selection, RNG, targeting and damage rules were unchanged.

## 9. Kaiser Bunker

Only successful `bunkerEntered` plays entry art. `bunkerExited` plays the hit/exit strip once for an actual exit (timer, attack or transformation). Receiving damage alone does not invent an exit. Existing current-state Bunker art restores silently; entry and exit events carry their own frozen cells.

## 10. Sans Gaster

The existing `gaster_blaster.png` remains the single white skull/cannon artwork. The newly connected `gaster_cannon.png` is an authored sigil-like animated strip, used as `gasterCharge` during the existing charge phase. It is not instantiated as a second skull.

The sequence remains summon at 0 ms, charge at 100 ms, beam at 500 ms, with original target outcomes after fire. The new strip is fitted to the existing **400 ms** charge interval. The existing canonical board-edge, piercing beam, its composite layers and all target outcomes are preserved. Tests assert one cannon, one charge accent, one beam and charge completion exactly at beam start.

## 11. Vlad stakes

`Board.tsx` renders `vladStakeMarker.asset` only for the existing projected `view.stakeMarkers`. Hidden/revealed treatments and badges stay intact. Owner, opponent and spectator tests retain their privacy assertions. Reconnect restores current markers without a placement/trigger effect or sound.

## 12. Other heroes and actual geometry

| Hero | Mapping and bounds |
|---|---|
| Artemida | Rules-selected Crescent corridor, bounded by the selected endpoint; no extension beyond it |
| Don Quixote | Committed Windmills source accent; Madness uses the selected authoritative ray and survives source removal as frozen geometry |
| Duolingo | Static badge while visible projected `duolingoBerserkerUnlocked` is true |
| El Cid | Tisona selected orthogonal half-line to the edge; Kolada actual 3×3; Duelist confirmed valid commitment |
| Luche | Divine Ray follows actual full selected ray, or actual 3×3 around-self mode; Falling Sun is one source burst plus its legal target outcomes, without a fabricated filled 5×5 footprint |
| Mettaton | Laser follows actual full-line cells; Final Chord uses only same-use authorized resolved attack legs, with a source pulse when no authorized leg is available |
| Odin | Gungnir on a confirmed double-hit attack; Huginn is an owner-only static passive indicator, independent of hidden enemy identities |
| Papyrus | Full selected row/column/diagonal from rules, shared by Cool Guy and Long Bone |
| Undyne | Energy Spear uses the actual selected complete row/column; Direction Shift remains blocked |
| Zoro | Santoryu accent on authoritative basic/Three Sword Style attack results |

Line endpoints are optional presentation metadata derived from already selected rule cells. They never choose targets or damage. Projection withholds source-derived segments when source coordinates were not authorized at the event. The existing geometry functions handle orientation, scaling and clipping.

## 13. Modified files

- `packages/rules/src/abilities/turn.ts`
- `packages/rules/src/actions/heroes/elCid/tisona.ts`
- `packages/rules/src/actions/heroes/frisk/friendship.ts`
- `packages/rules/src/actions/heroes/frisk/postAction.ts`
- `packages/rules/src/actions/heroes/kaiser/bunker.ts`
- `packages/rules/src/actions/heroes/kaiser/transformation.ts`
- `packages/rules/src/actions/heroes/mettaton/actions.ts`
- `packages/rules/src/actions/heroes/mettaton/queue.ts`
- `packages/rules/src/actions/heroes/newBatch.ts`
- `packages/rules/src/actions/heroes/newBatchPost.ts`
- `packages/rules/src/actions/heroes/papyrus/lineAttack.ts`
- `packages/rules/src/actions/heroes/undyne.ts`
- `packages/rules/src/actions/shared.ts`
- `packages/rules/src/core/events/combatEvents/movementStealthEvents.ts`
- `packages/rules/src/core/events/combatEvents/tacticalEvents.ts`
- `packages/rules/src/model/events/core.ts`
- `packages/rules/src/model/events/heroes.ts`
- `packages/rules/src/model/roll.ts`
- `packages/rules/src/model/semantic.ts`
- `packages/rules/src/pendingRoll/resolvers/core/resolveAttackRoll/jebe.ts`
- `packages/rules/src/pendingRoll/resolvers/core/resolveAttackRoll/queue.ts`
- `packages/rules/src/pendingRoll/resolvers/core/resolveAttackRoll/resolveSpecialChoices.ts`
- `packages/rules/src/pendingRoll/resolvers/core/resolveAttackRoll/shared.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveBunkerRoll.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveElCidRoll/helpers.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveFriskRoll/genocide.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveJebeRoll/shooter.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveLokiRoll/menu.ts`
- `packages/rules/src/pendingRoll/resolvers/heroes/resolveTricksterRoll.ts`
- `packages/rules/src/pendingRoll/types.ts`
- `packages/rules/src/view/eventPayload.ts`
- `packages/rules/src/view/events.ts`
- `packages/server/src/openapi/generated/responses.json`
- `packages/web/package.json`
- `packages/web/src/assets/ASSET_INDEX.md`
- `packages/web/src/components/Board.tsx`
- `packages/web/src/components/BoardMarkers.test.tsx`
- `packages/web/src/features/vfx/UnitStatusVfx.tsx`
- `packages/web/src/features/vfx/VfxLayer.tsx`
- `packages/web/src/features/vfx/persistentStatuses.ts`
- `packages/web/src/features/vfx/vfxEventMapper.ts`
- `packages/web/src/features/vfx/vfxInfrastructure.test.tsx`
- `packages/web/src/features/vfx/vfxPreviewScenarios.test.ts`
- `packages/web/src/features/vfx/vfxPreviewScenarios.ts`
- `packages/web/src/features/vfx/vfxQueue.ts`
- `packages/web/src/features/vfx/vfxRegistry.ts`
- `packages/web/src/features/vfx/vfxTypes.ts`
- `packages/web/src/game/effects/kaiserVladPresentation.test.ts`
- `packages/web/src/game/effects/presentationPreload.ts`
- `packages/web/src/game/effects/remainingHeroPresentation.test.ts`
- `packages/web/src/game/effects/remainingHeroPresentation.ts`
- `packages/web/src/game/effects/sansPresentation.test.ts`
- `packages/web/src/i18n/locales/en.ts`
- `packages/web/src/i18n/locales/uk.ts`
- `packages/web/src/styles.css`

## 14. Created files

- `docs/assets/HERO_VFX_FINAL_45.md`
- `packages/rules/src/core/events/combatEvents/presentationGeometry.ts`
- `packages/web/scripts/generate-hero-vfx-coverage.mjs`
- `packages/web/scripts/hero-vfx-coverage-smoke.mjs`
- `packages/web/src/assets/HERO_VFX_COVERAGE.md`
- `packages/web/src/assets/heroVfxCoverage.json`
- `packages/web/src/features/vfx/heroVfxCoverage.test.tsx`

## 15. Runtime definitions added

`artemidaCrescent`, `donMadness`, `donWindmills`, `duolingoBerserker`, `elCidDuel`, `elCidKolada`, `elCidTisona`, `friskCleanSoul`, `friskCry`, `friskFriendship`, `friskKeenEye`, `friskOnePath`, `friskPrecision`, `friskSubstitution`, `genghisCharge`, `bunkerEntry`, `bunkerExit`, `jebeRicochet`, `kanekiCentipede`, `lokiSpin`, `lucheSun`, `lucheRay`, `mettatonFinalChord`, `mettatonLaser`, `odinGungnir`, `odinHuginn`, `papyrusLine`, `gasterCharge`, `undyneEnergy`, `vladStakeMarker`, `zoroSantoryu`.

There are **31 definitions for 44 connected physical PNGs**: 27 event-driven concepts and four persistent concepts. The blocked Shift file has no registry entry. Roster preload merges these definitions only for authorized roster hero IDs; registry metadata does not decode the entire library.

## 16. Event mappings and minimal enrichment

Existing `abilityUsed`, `aoeResolved`, `attackResolved`, `stealthRevealed`, Bunker, Kaneki, Frisk and Loki transitions drive rendering. Added optional fields: AoE `effectSegments`, Frisk attack `defenseSignature`, Keen Eye `revealSignature`/`targetCell`, and source cells for existing transition/Bunker events. Payload copies and public response schemas include the approved fields. AoE projection applies the existing event-time `sourceCellRecipients` policy to segments. Jebe continuation uses existing correlation metadata.

The shared presentation session continues to own freshness, duplicate delivery, hydration and room/role/stream cancellation. New VFX do not decide death from HP or attach their historical geometry to a later token position. No separate renderer, timer chain or event system was introduced.

## 17. Tests added and updated

`heroVfxCoverage.test.tsx` adds **26 focused cases**, including the 45-file inventory and final missing-file audit, all 13 composites, real six-hero line resolutions, actual Frisk reactions/reveal/Precision, transition audio alignment, current statuses, real additional hero abilities, Odin/Zoro attacks, Loki commitment, hidden-source projection, three-shot Jebe with and without Intimidate, session dedupe and reset. Renderer checks cover both orientations, 32/72 px cells and reduced motion.

Existing Bunker, Gaster, marker privacy, generic-replacement and preview tests were updated to assert the resulting behavior. The projectile infrastructure test retains its explicit asymmetric source/target rather than depending on preview defaults. No test was removed or weakened.

## 18. Test results

| Check | Result |
|---|---|
| New focused VFX coverage | PASS, 26 cases |
| `npm run -w web test:vfx` | PASS, 88 tests |
| `npm run -w web test:effects` | PASS, 245 tests |
| `npm run -w web test:sfx` | PASS, 66 tests |
| Complete `npm run test:web` | PASS, 740 tests; 2 suite executions |
| `npm run test:rules` | PASS, 3 suite executions, including golden snapshots and architecture boundaries |
| `npm run test:server` | PASS, 11 suite executions |
| `npm run test:contract` | PASS, 20 suite executions after regenerating public schemas |
| Root `npm run typecheck` | PASS; final build also compiles rules, server and web |
| Development preview browser coverage | PASS, 31 definitions in both orientations |
| `git diff --check` | PASS |

## 19. Production build and assets

Root `npm run build` passed: rules, server, web typecheck and Vite production output (509 transformed modules). The command used process-local loopback API/WS URLs for the local production test; no environment file was changed.

The post-build asset audit passed exact filename casing and sprite dimensions, with no duplicate emitted files. All 148 registered presentation images are included in the audit; 44 are the newly connected physical hero PNGs. `npm run -w web test:presentation:production` passed: **148 images and 137 audio files fetched and decoded through emitted production URLs, zero page errors**. Evidence is in `packages/web/test-results/phase15/production-assets.json`.

## 20. Browser verification

`npm run -w web test:vfx:coverage:e2e` passed in local headless Chromium/Edge on the existing VFX preview page. It rendered all **31** new definitions in **P1 and P2**, decoded their artwork, checked paired frames/delay/duration/stacking, stepped representative frames, checked corner clipping and actual mapper scenarios, and verified private versus public stake markers. Phone width **390 px** and reduced-motion Laser were checked. Screenshots were inspected for Crescent, Kolada, Gaster, persistent markers and the phone layout; HP and selection remain readable.

`npm run -w web test:vfx:coverage:production` also passed the same rendering checks. The ordinary production output retains its existing disabled preview guard. The test builds a separate local artifact under `test-results/vfx-coverage/preview-dist` with the existing `VITE_ENABLE_TEST_ROOM` switch enabled, and serves that artifact for visual QA. It does not overwrite or expose the normal production build. Production-mode observations and screenshots are in `test-results/vfx-coverage/browser-production`.

Evidence is written under `packages/web/test-results/vfx-coverage/browser/` (ignored test artifacts), including `observations.json`, representative confirmed-effect PNGs, `gaster-sequence.png`, `persistent-spectator.png` and `phone-P2-reduced-laser.png`. This was an automated local preview and rules-fixture verification, not a manually played two-account network match.

## 21. Remaining unconnected file

`packages/web/src/assets/vfx/heroes/undyne/shift.png` — **BLOCKED_UNIMPLEMENTED_ABILITY**. Canonical metadata defines `undyneSwitchDirection`, but there is no implemented activation or forced-movement resolver to confirm a shift. Implement and validate that mechanic as a separate gameplay change, then connect its recipient-safe confirmed movement event. A speculative visual trigger was deliberately not added.

## 22. Final physical-file counts

| Category | PNG files |
|---|---:|
| Original unused physical files | 45 |
| Newly connected to live gameplay events | 40 |
| Newly connected as persistent current-state visuals | 4 |
| Blocked by missing gameplay implementation | 1 |
| Intentionally unused | 0 |
| Registered only | 0 |

**40 + 4 + 1 + 0 = 45.** Each physical PNG is counted once, including both layers of every composite.
