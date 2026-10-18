# Simultaneous AoE outcome presentation

## 1. Root cause

Rules already correlate combat with `abilityUseId`, `chainId`/`visualBatchId`, defer outcomes, and emit `combatVisualBatchReady`. `visualResolution.ts` correctly releases the completed outcomes together and lets manual dice through early. The remaining cascade came from `buildCombatVisualPlaybackPlan` in `combatPlayback.ts`: each `attackResolved` advanced `cursorMs` through its attack lead, outcome, HP tween and between-hit pause before scheduling the next defender. Buffering alone therefore retained serial presentation offsets.

## 2. Files

- `packages/web/src/game/effects/combatPlayback.ts`
- `packages/web/src/features/vfx/vfxEventMapper.ts`
- `packages/web/src/game/effects/aoePresentation.test.ts` (new)
- `packages/web/src/game/effects/kaiserVladPresentation.test.ts`
- `packages/web/scripts/sans-smoke.mjs`
- `docs/aoe-simultaneous-presentation.md` (this report)

## 3. Shared timeline

The existing scheduler identifies one authoritative `aoeResolved` and its correlated target outcomes, filtered by source, ability and actual target IDs. It uses the existing correlation helper, never arrival proximity, ability ID alone or WebSocket message boundaries. Each area gets one start at the current playback cursor and one impact. Generic area outcomes start at that start; existing Gaster buildup places impact at +650 ms, and Fire Parade at +300 ms. Existing signature timings remain the reference for artwork and audio.

For full preview/replay batches, correlated outcomes are scheduled after their last actual presented roll. Live batches continue using the existing completion release. Event identities and dice ordering remain intact. The playback cursor advances for the shared area phase, rather than once per defender. No additional scheduler or server animation acknowledgment was introduced.

## 4. HP animation

All damaged targets use the existing `damageHpTween`, starting exactly at the shared impact. They share the longest configured HP duration required by the area's authoritative damage values, including reduced motion. HP snapshots, damage amounts and final reconciliation still come from the existing gameplay/presentation data.

## 5. Defense and misses

Hit/miss cues, floating numbers, flashes and outcome SFX use the same impact. `attackResolved.hit` determines hit versus miss; zero damage does not manufacture a block. Only a confirmed Berserker `choice: "auto"` can produce its shield. Its correlated miss cue supplies both the timestamp and frozen authorized cell. Missing/redacted outcome anchors produce no positional shield, including when a later view or position cache contains the target. Choosing Roll remains silent until actual resolution.

## 6. Dice flow

Rules, RNG, manual decisions, roll labels, individual dice, totals and card durations are unchanged. Early rolls remain individually playable while outcomes defer. Shared attacker rolls are not duplicated per defender. The browser smoke now reads the current dice-card duration instead of assuming 750 ms, and expects the existing Sans-specific death sound.

## 7. Hero coverage

| Ability | Verification |
| --- | --- |
| Kaiser `kaiserDora`, `kaiserCarpetStrike`; Vlad `vladForest` | Real rules fixtures, shared attacker/defender rolls, hit/miss cases, normal/reduced motion, allies, empty areas, deaths and recipient projection |
| Sans `sansGasterBlaster` | Scheduler tests and real-rules production Board browser harness: one cannon/charge/beam, four synchronized outcomes/HP transitions including ally, both orientations |
| Asgore `asgoreFireParade` | Shared mixed-outcome fixture; existing Asgore presentation regression suite |
| Jebe `jebeHailOfArrows`, Mettaton `mettatonPoppins` | Shared mixed-outcome fixtures with ally and one area signature |
| Jack `jackRipperCoveringTracks` | Direct aggregate synchronization/anchor tests and existing real sixth-snare direct-damage/death fixture |

## 8. Ordered exceptions

Ordinary attacks and chains without an area aggregate retain their existing sequential cursor. Repeated strikes on the same defender and multiple aggregates/pulses sharing an identity are conservatively left ordered. Tests cover independent area uses, an ordered `jebeKhansShooter` chain and repeated strikes. Mettaton Final Chord's current rules collect area targets; no speculative ricochet exception was added.

## 9. Deduplication and reconnect

Per-target `attackResolved` continues to own its damage; the aggregate cannot duplicate that HP transition. Unmatched direct aggregate damage still produces one transition/cue per target. An unchanged reconnect baseline already containing a previous defender's damage suppresses that historical aggregate fallback. Separate legitimate uses and later healing retain their presentation. Stream/revision/event dedupe and completion-marker handling remain in the existing ingress and visual-resolution layers.

## 10. Death and pre-death

Actual correlated `unitDied` events share a final phase after the common HP/outcome interval. Each death/removal and death VFX/SFX occurs once. HP zero never synthesizes death. A real lethal Dora scenario verifies that Sans stays present with a valid Last Attack choice and only the accepted final `unitDied` removes him. Frisk decisions, survival/rebirth mechanics and authoritative final snapshots were not changed; the rules regression suite includes existing Frisk coverage.

## 11. Tests added

Twenty scheduler/mapper tests cover four mixed targets, five damaged targets, all defended, both motion settings, seven hero signatures, direct damage, empty areas, confirmed automatic defense versus Roll, frozen/private anchors, shared final deaths, pending Sans, separate areas, ordered strikes/pulses, manual roll buffering, dedupe and mid-AoE reconnect. Three additional real Dora integration tests cover Berserker Roll/auto and lethal Sans. Existing Kaiser/Vlad tests now require shared timing after all dice cards and one shared final death phase with exact VFX/SFX counts.

## 12. Test results

- `npm run -w web test:effects`: 291 passed.
- `npm run -w web test:sfx`: 66 passed.
- `npm run test:web`: 788 passed.
- `npm run test:rules`: gameplay runner and architecture boundaries passed (3 suite executions including preparation).
- `npm run lint`: passed.
- `npm run -w web typecheck`: passed; also checked by the production build.
- `git diff --check`: passed.

Initial mixed/all-hit/all-miss timing regressions failed against the original serial scheduler. The mid-AoE reconnect test also reproduced historical aggregate damage before the baseline guard was added. Existing independent-use and direct-damage regressions remain intact.

## 13. Production build

`npm run build` passed for rules, server and web, including web typecheck. Existing Vite chunk-size/Browserslist notices are unrelated to outcome timing.

## 14. Browser verification scope

Automated headless Edge used real rules fixtures with the production Board and pending-decision components. Gaster verified one signature per recipient, four identical outcome timestamps and four simultaneous taking-damage states, ally HP ending at its authoritative value, board-edge beam geometry and P1/P2 rotation. Last Attack verified owner choice/opponent waiting, pending and completed reconnect silence, accepted curse before final death, and the next real curse tick/removal. Audio checks inspected scheduled keys, decoded assets and successful Web Audio starts.

`npm run -w web test:dice:e2e` passed five viewport/theme/motion combinations, special dice, ordered hold, duplicate delivery and stale delivery. Screenshots/reports are generated under `packages/web/test-results/sans/` and `packages/web/test-results/dice-result/` (ignored artifacts). The Gaster screenshot was inspected. No manual two-player game, live WebSocket reconnect or subjective audio listening was performed. Background handling was verified through existing stale/session regression tests; tab lifecycle and reconnect policies were preserved.
