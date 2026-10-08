# Phase 13 implementation report

Phase 13 integrates the remaining reliable hero one-shots through the existing presentation stack. The canonical audit covers **29 implemented catalog entries** (28 selectable heroes plus Femto), the runtime False Trail token, and **154 ability rows**, including transformed/unlocked variants and shared class abilities. Authoritative gameplay, costs, targeting, dice and turn economy are unchanged. Rules changes add frozen presentation anchors, privacy/correlation metadata and the existing Poppins square radius; they do not change damage or legal targets.

## 1. Full actual roster

- Already integrated, preserved: `grand-kaiser`, `vladTepes`, `sans`, `asgore`, `riverPerson`. Genuine missing Kaiser/Sans one-shots are also filled.
- Newly integrated with intended signature/shared/silent coverage: `griffith`, `femto`, `guts`, `odin`, `loki`, `jebe`, `hassan`, `kaladin`, `zoro`, `jackRipper`, `chikatilo`, `grozny`, `elCidCompeador`, `lechy`, `genghisKhan`.
- Newly integrated but explicitly partial for the prerequisites in section 18: `luche`, `kaneki`, `donKihote`, `artemida`, `frisk`, `undyne`, `papyrus`, `mettaton`, `duolingo`.
- No whole catalog hero is an unimplemented stub. `femto` is an implemented, non-selectable transformed form. `falseTrailToken` is a runtime token, not a selectable catalog hero. Undyne's `undyneSwitchDirection` is metadata only and remains `NOT_IMPLEMENTED`.

Source authority is `packages/rules/src/heroes.ts`, `heroMeta/entries`, `abilities/specs`, `abilities/viewIds.ts`, `viewIdsExtras.ts`, hero action/post-action handlers, combat/movement/pending resolvers and recipient projections. `packages/web/src/catalog/figures.ts` supplies figure sets; its base-class figures are not additional heroes. Asset folders did not determine implementation scope.

## 2. Full ability coverage matrix

[HERO_PRESENTATION_COVERAGE.md](./HERO_PRESENTATION_COVERAGE.md) contains all **154 rows**: hero/ability ID, display name/taxonomy, charge spending/capacity/trigger/reset, slot cost, canonical targeting/decision description, projected trigger events, reused templates, exact SFX keys/VFX IDs, initial and final coverage, privacy and limitations. It also records layer paths/frame slices. Regenerate with:

```powershell
npx tsx packages/web/scripts/generate-hero-presentation-coverage.ts
```

`heroAbilityCoverage.ts` makes classifications explicit. Roster-derived tests fail when a future canonical ability is unclassified. COMPLETE means the intended one-shot and shared outcomes are wired; it does not claim a persistent loop or a bespoke effect for every passive. GENERIC_ONLY, INTENTIONALLY_SILENT, BLOCKED_BY_EVENT_DATA and NOT_IMPLEMENTED are reported without hiding partial work. No essential asset is missing for the safe fallback, so no row is falsely labelled MISSING_ASSET merely because artwork is deliberately unused.

## 3. Jack the Ripper

Resilient and Surgery are silent traits. Snares reuse existing hazard placement and reached-movement trigger VFX, with separate placement/trigger WAVs. Placement, trap IDs and remaining trap locations are owner-only. A reached trigger immobilizes; it does not create damage. Dismemberment gets a committed source accent and one brief confirmed slaughter hit accent, while shared combat owns each attack/HP result.

Covering Tracks is the actual sixth-snare, confirmed 3?3 explosion. Independent direct-damage results come from `aoeResolved.damageByUnitId`; no fake attacker/defender rolls are created. The aggregate signature plays once. Each positive damage result updates HP once. Rules may emit `unitDied` before the aggregate; authorized use correlation lets the shared scheduler present damage before final death while preserving original event IDs/indices. Only `unitDied` removes the visual unit. No remaining snares are disclosed.

## 4. Hassan

Assassin Order selects exactly two distinct allied units at battle start, without charges/action cost. Invalid, duplicate, incomplete and candidate selections produce no final cue. Valid commitment gets one owner source cue. True Enemy keeps candidates/choices private, pays the actual cost at commitment and uses ordinary controlled manual combat for the confirmed attack. One With Sand reuses successful stealth/reveal feedback; failed stealth is silent.

`abilityUsed` for Assassin Order/True Enemy is suppressed for P2 and spectator even when the caster is visible. Frozen source/use metadata is owner-authorized. Neither candidate positions, selection count, repeated per-target audio nor target-dependent variants/durations enter the public signature. Existing safe waiting notices remain. Confirmed public combat retains its ordinary recipient projection.

## 5. Genghis Khan

Khans Decree and Mongol Charge get distinct committed WAVs; Charge reuses compact decree artwork. Existing pending reaction UI processes each eligible ally independently. Attack requests manual attacker/defender rolls, defenses and shared results; Pass consumes no RNG or combat. Three independent reactors are regression-tested with Attack/Pass/Attack, preserving their normal slots.

Rider feedback uses actual reached path segments, including interruption; it does not reconstruct travel from the final position or add duplicate movement audio. Charge movement artwork is not guessed from a pending flag without use lineage. Registered source assets are `khans_decree.png`, `khans_decree.wav` and `mongol_charge.wav` at the exact paths in section 9.

## 6. Chikatilo

Tough stays silent. Assassin Mark uses one private target apply cue and owner WAV, with no redundant source cast; P2/spectator receive no mark status, target cue or correlation. False Trail setup anchors the public token separately from the real assassin's private placement; no connecting trace is synthesized. Its actual explosion uses the confirmed square and shared outcomes. Decoy uses commitment plus existing authoritative defense, stealth and forced movement. No client-side counters or hidden-position tracking are introduced.

## 7. Every other remaining hero

The matrix supplies every individual ability, including passive/unlocked/shared traits. Their new semantic presentation is summarized here:

| Hero                | Implemented presentation and safe shared behavior                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `griffith`, `femto` | Actual Femto rebirth transformation; committed Divine Movement plus confirmed teleport. Passive HP/multiclass/commander behavior stays in UI/shared combat.                                      |
| `guts`              | Crossbow/cannon source cues, brief confirmed hit accents; actual Berserk entry/exit. Shared defenses/self-damage/HP own outcomes.                                                                |
| `odin`              | Sleipnir commitment and confirmed teleport; actual Muninn defensive commitment. Gungnir/Huginn remain shared combat/detection state.                                                             |
| `loki`              | Actual Laugh area, Chicken apply/group and controlled attack results; one group signature and per-target art, shared combat/stealth. No guessed private variant.                                 |
| `jebe`              | Hail confirmed square; Shooter commitment and ordinary ricochet/manual attacks. Passive bonuses remain shared outcomes.                                                                          |
| `kaladin`           | First Ideal heal commitment/shared heal; Fifth Ideal confirmed square. Other ideals are silent traits or actual damage bonuses.                                                                  |
| `luche`             | Actual Shine commitment; Ray/Burning Sun use compact source signatures and actual target combat because exact geometry is absent.                                                                |
| `kaneki`            | Actual regeneration commitment/shared heal; passive RC/traits silent. Scolopendra unlock signature is blocked by missing semantic event.                                                         |
| `zoro`              | Oni commitment/brief confirmed impact; Asura confirmed square. Death/stat/bonus traits remain authoritative shared outcomes.                                                                     |
| `donKihote`         | Actual Windmills commitment, Sorrow activation; Madness compact aggregate origin and shared results instead of fabricated sparse area.                                                           |
| `artemida`          | Moonlight Shot confirmed square/reveal outcomes; Crescent compact signature/shared outcomes. Nature/accuracy/stealth traits remain shared/silent.                                                |
| `frisk`             | Explicit Hugs apply and Warm Words heal; actual reveals/defense/combat/end UI for other options. Missing option/unlock discrimination is documented.                                             |
| `undyne`            | Spear Throw commitment/brief confirmed impact; actual automatic Undying trigger. Energy Spear compact origin/shared line outcomes; Direction Shift unimplemented.                                |
| `papyrus`           | Actual blue/orange bone type apply, actual punishment/HP; Spaghetti heal commitment, explicit Unbeliever activation. Cool Guy/Long Bone keep reliable shared outcomes without invented geometry. |
| `mettaton`          | Poppins confirmed 3?3 radius; actual EX/NEO transformation. NEO does not synthesize EX. Laser/Final Chord compact origin/shared results. Rating/traits silent.                                   |
| `duolingo`          | Push commitment/actual forced move; streak combat bonuses remain shared. Permanent Berserker unlock lacks a distinct trigger.                                                                    |
| `grozny`            | Actual Invade Time/Tyrant commitment; confirmed teleport endpoints/shared combat. Removed unsafe preceding-event trace inference.                                                                |
| `elCidCompeador`    | Tisona commitment, Kolada square aggregate, Demon Duelist defensive commitment; signature WAVs and existing compact/shield art/shared combat.                                                    |
| `lechy`             | Guide/Confuse Terrain commitment, actual Storm start/ticks; existing arena/current state reconciles silently. Giant/stealth shared or silent.                                                    |

Kaiser Engineering Miracle and Sans Badass Joke/Sleep/Unbeliever/Bone Field activation omissions are filled without replacing their earlier packs. Asgore, Vlad and River Person sequences are preserved.

## 8. Generic template reuse

CAST consumes authoritative `abilityUsed` + `abilityUseId` + authorized frozen source. AREA consumes confirmed geometry, or uses a compact origin when a sparse mask/ray is unavailable. PROJECTILE retains existing supported travel; unproven travel is represented by cast/confirmed-impact accents. MOVEMENT uses confirmed provenance/reached steps and existing teleport endpoints. TRAP reuses snare/hazard scheduling. REACTION uses existing independent pending choices/manual rolls. STEALTH uses actual success/reveal. STATUS uses explicit apply/tick/transformation one-shots and existing simple indicators. COMBAT remains the sole shared owner of damage/HP/death. No presentation engine, pending-choice framework or persistent-status manager is added.

## 9. Exact new registrations

New registrations: **59 SFX keys**, **50 VFX IDs**. All paths below already existed. No binary asset is added/edited. Hero sounds remain lazy; the ready/heal/stealth common sounds join the small gameplay core.

| New SFX key                                                  | Exact source path(s)                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common.status.bonePunish`                                   | `packages/web/src/assets/sfx/common/status/bonePunish01.wav`<br>`packages/web/src/assets/sfx/common/status/bonePunish02.wav`                                                                                                                                                  |
| `common.status.heal`                                         | `packages/web/src/assets/sfx/common/status/heal.wav`                                                                                                                                                                                                                          |
| `common.status.ready`                                        | `packages/web/src/assets/sfx/common/ui/chargeReady.wav`                                                                                                                                                                                                                       |
| `common.status.stealthEnter`                                 | `packages/web/src/assets/sfx/common/status/stealthEnter.wav`                                                                                                                                                                                                                  |
| `hero.artemida.abilities.artemidaMoonlightShot`              | `packages/web/src/assets/sfx/heroes/artemida/abilities/artemidaMoonlightShotScan.wav`                                                                                                                                                                                         |
| `hero.artemida.phantasms.artemidaSilverCrescent`             | `packages/web/src/assets/sfx/heroes/artemida/phantasms/artemidaSilverCrescentFire.wav`                                                                                                                                                                                        |
| `hero.chikatilo.abilities.chikatiloAssassinMark`             | `packages/web/src/assets/sfx/heroes/chikatilo/abilities/KillerMark.mp3`                                                                                                                                                                                                       |
| `hero.chikatilo.abilities.chikatiloDecoy`                    | `packages/web/src/assets/sfx/heroes/chikatilo/abilities/decoy.mp3`                                                                                                                                                                                                            |
| `hero.chikatilo.phantasms.falseTrailExplosion`               | `packages/web/src/assets/sfx/heroes/chikatilo/phantasms/FalseTrailExplosion.mp3`                                                                                                                                                                                              |
| `hero.donKihote.abilities.donKihoteWindmills`                | `packages/web/src/assets/sfx/heroes/donKihote/abilities/donKihoteWindmillsDash.wav`                                                                                                                                                                                           |
| `hero.donKihote.phantasms.donKihoteMadness`                  | `packages/web/src/assets/sfx/heroes/donKihote/phantasms/donKihoteMadnessFinalAttack.wav`                                                                                                                                                                                      |
| `hero.duolingo.abilities.duolingoPushNotification`           | `packages/web/src/assets/sfx/heroes/duolingo/abilities/duolingoPushNotificationTeleport.wav`                                                                                                                                                                                  |
| `hero.elCidCompeador.abilities.elCidCompeadorKolada`         | `packages/web/src/assets/sfx/heroes/elCidCompeador/abilities/elCidCompeadorKoladaSweep.wav`                                                                                                                                                                                   |
| `hero.elCidCompeador.abilities.elCidCompeadorTisona`         | `packages/web/src/assets/sfx/heroes/elCidCompeador/abilities/elCidCompeadorTisonaSweep.wav`                                                                                                                                                                                   |
| `hero.elCidCompeador.phantasms.elCidCompeadorDemonDuelist`   | `packages/web/src/assets/sfx/heroes/elCidCompeador/phantasms/elCidCompeadorDemonDuelistActivate.wav`                                                                                                                                                                          |
| `hero.frisk.phantasms.friskHugs`                             | `packages/web/src/assets/sfx/heroes/frisk/phantasms/friskPacifismHugs.wav`                                                                                                                                                                                                    |
| `hero.genghisKhan.abilities.genghisKhanKhansDecree`          | `packages/web/src/assets/sfx/heroes/genghisKhan/abilities/genghisKhanKhansDecreeActivate.wav`                                                                                                                                                                                 |
| `hero.genghisKhan.phantasms.genghisKhanMongolCharge`         | `packages/web/src/assets/sfx/heroes/genghisKhan/phantasms/genghisKhanMongolChargeActivate.wav`                                                                                                                                                                                |
| `hero.grand-kaiser.transformations.kaiserEngineeringMiracle` | `packages/web/src/assets/sfx/heroes/grand-kaiser/transformations/EngineeringMiracle.mp3`                                                                                                                                                                                      |
| `hero.griffith.transformations.griffithFemtoRebirth`         | `packages/web/src/assets/sfx/heroes/griffith/transformations/griffithFemtoRebirthTransform.wav`                                                                                                                                                                               |
| `hero.grozny.abilities.groznyInvadeTime`                     | `packages/web/src/assets/sfx/heroes/grozny/abilities/groznyInvadeTimeTeleport.wav`                                                                                                                                                                                            |
| `hero.grozny.abilities.groznyTyrant`                         | `packages/web/src/assets/sfx/heroes/grozny/abilities/groznyTyrantActivate.wav`                                                                                                                                                                                                |
| `hero.guts.abilities.gutsArbalet`                            | `packages/web/src/assets/sfx/heroes/guts/abilities/gutsArbaletFire.wav`                                                                                                                                                                                                       |
| `hero.guts.abilities.gutsCannon`                             | `packages/web/src/assets/sfx/heroes/guts/abilities/gutsCannonFire.wav`                                                                                                                                                                                                        |
| `hero.guts.abilities.gutsExitBerserk`                        | `packages/web/src/assets/sfx/heroes/guts/abilities/gutsExitBerserkRelease.wav`                                                                                                                                                                                                |
| `hero.guts.phantasms.gutsBerserkMode`                        | `packages/web/src/assets/sfx/heroes/guts/phantasms/gutsBerserkModeActivate.wav`                                                                                                                                                                                               |
| `hero.hassan.abilities.hassanTrueEnemy`                      | `packages/web/src/assets/sfx/heroes/hassan/abilities/TrueEnemy.mp3`                                                                                                                                                                                                           |
| `hero.hassan.phantasms.hassanAssasinOrder`                   | `packages/web/src/assets/sfx/heroes/hassan/phantasms/hassanAssasinOrderGrant.wav`                                                                                                                                                                                             |
| `hero.jackRipper.abilities.jackRipperCoveringTracks`         | `packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperCoveringTracksExplode01.wav`<br>`packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperCoveringTracksExplode02.wav`                                                                            |
| `hero.jackRipper.abilities.jackRipperSnares.place`           | `packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresPlace01.wav`<br>`packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresPlace02.wav`<br>`packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresPlace03.wav`       |
| `hero.jackRipper.abilities.jackRipperSnares.trigger`         | `packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresTrigger01.wav`<br>`packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresTrigger02.wav`<br>`packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresTrigger03.wav` |
| `hero.jackRipper.phantasms.jackRipperDismemberment`          | `packages/web/src/assets/sfx/heroes/jackRipper/phantasms/HolyMotherOfSlaughter.mp3`                                                                                                                                                                                           |
| `hero.jebe.abilities.jebeHailOfArrows`                       | `packages/web/src/assets/sfx/heroes/jebe/abilities/jebeHailOfArrowsFire.wav`                                                                                                                                                                                                  |
| `hero.jebe.phantasms.jebeKhansShooter`                       | `packages/web/src/assets/sfx/heroes/jebe/phantasms/jebeKhansShooterFire01.wav`                                                                                                                                                                                                |
| `hero.kaladin.phantasms.kaladinFifth`                        | `packages/web/src/assets/sfx/heroes/kaladin/phantasms/kaladinFifthCast.wav`                                                                                                                                                                                                   |
| `hero.lechy.abilities.lechyConfuseTerrain`                   | `packages/web/src/assets/sfx/heroes/lechy/abilities/ConfuseTerrain.mp3.mpeg`                                                                                                                                                                                                  |
| `hero.lechy.abilities.lechyGuideTraveler`                    | `packages/web/src/assets/sfx/heroes/lechy/abilities/GuideTraveler.mp3.mpeg`                                                                                                                                                                                                   |
| `hero.lechy.phantasms.lechyStorm`                            | `packages/web/src/assets/sfx/heroes/lechy/phantasms/StormSound1.mp3`                                                                                                                                                                                                          |
| `hero.loki.abilities.lokiControl`                            | `packages/web/src/assets/sfx/heroes/loki/abilities/mindcontrol.mp3`                                                                                                                                                                                                           |
| `hero.loki.phantasms.lokiChicken`                            | `packages/web/src/assets/sfx/heroes/loki/phantasms/lokiLaughtChicken.wav`                                                                                                                                                                                                     |
| `hero.loki.phantasms.lokiEntangle`                           | `packages/web/src/assets/sfx/heroes/loki/phantasms/lokiLaughtEntangle.wav`                                                                                                                                                                                                    |
| `hero.luche.abilities.lucheDivineRay`                        | `packages/web/src/assets/sfx/heroes/luche/abilities/lucheDivineRayFire.wav`                                                                                                                                                                                                   |
| `hero.luche.phantasms.lucheBurningSun`                       | `packages/web/src/assets/sfx/heroes/luche/phantasms/lucheBurningSunCast.wav`                                                                                                                                                                                                  |
| `hero.mettaton.abilities.mettatonLaser`                      | `packages/web/src/assets/sfx/heroes/mettaton/abilities/mettatonLaserFire.wav`                                                                                                                                                                                                 |
| `hero.mettaton.abilities.mettatonPoppins`                    | `packages/web/src/assets/sfx/heroes/mettaton/abilities/mettatonPoppinsFire.wav`                                                                                                                                                                                               |
| `hero.mettaton.phantasms.mettatonFinalChord`                 | `packages/web/src/assets/sfx/heroes/mettaton/phantasms/mettatonFinalChordFire.wav`                                                                                                                                                                                            |
| `hero.mettaton.transformations.mettatonEx`                   | `packages/web/src/assets/sfx/heroes/mettaton/transformations/mettatonExTransform.wav`                                                                                                                                                                                         |
| `hero.mettaton.transformations.mettatonNeo`                  | `packages/web/src/assets/sfx/heroes/mettaton/transformations/mettatonNeoTransform.wav`                                                                                                                                                                                        |
| `hero.odin.abilities.odinSleipnir`                           | `packages/web/src/assets/sfx/heroes/odin/abilities/odinSleipnirTeleport.wav`                                                                                                                                                                                                  |
| `hero.papyrus.abilities.papyrusBlueBone`                     | `packages/web/src/assets/sfx/heroes/papyrus/abilities/papyrusBlueBoneApply.wav`                                                                                                                                                                                               |
| `hero.papyrus.abilities.papyrusCoolGuy`                      | `packages/web/src/assets/sfx/heroes/papyrus/abilities/papyrusCoolGuyFire.wav`                                                                                                                                                                                                 |
| `hero.papyrus.abilities.papyrusOrangeBone`                   | `packages/web/src/assets/sfx/heroes/papyrus/abilities/papyrusOrangeBoneApply.wav`                                                                                                                                                                                             |
| `hero.sans.abilities.sansBadassJoke`                         | `packages/web/src/assets/sfx/heroes/sans/abilities/sansBadassJokeCast.wav`                                                                                                                                                                                                    |
| `hero.sans.abilities.sansBoneField`                          | `packages/web/src/assets/sfx/heroes/sans/abilities/sansBoneFieldActivate.wav`                                                                                                                                                                                                 |
| `hero.undyne.abilities.undyneEnergySpear`                    | `packages/web/src/assets/sfx/heroes/undyne/abilities/energy_spear.wav`                                                                                                                                                                                                        |
| `hero.undyne.abilities.undyneSpearThrow`                     | `packages/web/src/assets/sfx/heroes/undyne/abilities/throw_spear.wav`                                                                                                                                                                                                         |
| `hero.undyne.abilities.undyneUndying`                        | `packages/web/src/assets/sfx/heroes/undyne/abilities/undyneUndyingRevive.wav`                                                                                                                                                                                                 |
| `hero.zoro.abilities.zoroOniGiri`                            | `packages/web/src/assets/sfx/heroes/zoro/abilities/zoroOniGiriDash.wav`                                                                                                                                                                                                       |
| `hero.zoro.phantasms.zoroAsura`                              | `packages/web/src/assets/sfx/heroes/zoro/phantasms/zoroAsuraCast.wav`                                                                                                                                                                                                         |

| New VFX ID          | Exact layer path(s)                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `artemidaReveal`    | `packages/web/src/assets/vfx/heroes/artemida/moon_reveal.png`                                                                                                       |
| `chikatiloDecoy`    | `packages/web/src/assets/vfx/heroes/chikatilo/decoy.png`                                                                                                            |
| `chikatiloMark`     | `packages/web/src/assets/vfx/heroes/chikatilo/mark.png`                                                                                                             |
| `donSorrow`         | `packages/web/src/assets/vfx/heroes/donKihote/sorrow_move.png`                                                                                                      |
| `duolingoPush`      | `packages/web/src/assets/vfx/heroes/duolingo/push.png`                                                                                                              |
| `falseTrailBlast`   | `packages/web/src/assets/vfx/heroes/chikatilo/false_trail_explosion_primary.png`<br>`packages/web/src/assets/vfx/heroes/chikatilo/false_trail_explosion_accent.png` |
| `falseTrailSetup`   | `packages/web/src/assets/vfx/heroes/chikatilo/false_trail.png`                                                                                                      |
| `femtoMove`         | `packages/web/src/assets/vfx/heroes/femto/divine_move.png`                                                                                                          |
| `friskHeal`         | `packages/web/src/assets/vfx/heroes/frisk/warm_words.png`                                                                                                           |
| `friskHugs`         | `packages/web/src/assets/vfx/heroes/frisk/hugs.png`                                                                                                                 |
| `genghisDecree`     | `packages/web/src/assets/vfx/heroes/genghisKhan/decree.png`                                                                                                         |
| `griffithRebirth`   | `packages/web/src/assets/vfx/heroes/griffith/rebirth_primary.png`<br>`packages/web/src/assets/vfx/heroes/griffith/rebirth_accent.png`                               |
| `groznyInvade`      | `packages/web/src/assets/vfx/heroes/grozny/invade.png`                                                                                                              |
| `groznyTyrant`      | `packages/web/src/assets/vfx/heroes/grozny/tyrant_primary.png`<br>`packages/web/src/assets/vfx/heroes/grozny/tyrant_accent.png`                                     |
| `gutsBerserk`       | `packages/web/src/assets/vfx/heroes/guts/berserk_primary.png`<br>`packages/web/src/assets/vfx/heroes/guts/berserk_accent.png`                                       |
| `gutsCannon`        | `packages/web/src/assets/vfx/heroes/guts/cannon_primary.png`<br>`packages/web/src/assets/vfx/heroes/guts/cannon_accent.png`                                         |
| `gutsCrossbow`      | `packages/web/src/assets/vfx/heroes/guts/crossbow.png`                                                                                                              |
| `gutsExit`          | `packages/web/src/assets/vfx/heroes/guts/berserk_exit_drain.png`                                                                                                    |
| `hassanControl`     | `packages/web/src/assets/vfx/heroes/hassan/true_enemy.png`                                                                                                          |
| `hassanOrder`       | `packages/web/src/assets/vfx/heroes/hassan/order.png`                                                                                                               |
| `jackCoverTracks`   | `packages/web/src/assets/vfx/heroes/jackRipper/cover_tracks_primary.png`<br>`packages/web/src/assets/vfx/heroes/jackRipper/cover_tracks_accent.png`                 |
| `jackSlaughter`     | `packages/web/src/assets/vfx/heroes/jackRipper/slaughter_primary.png`<br>`packages/web/src/assets/vfx/heroes/jackRipper/slaughter_accent.png`                       |
| `jebeHail`          | `packages/web/src/assets/vfx/heroes/jebe/hail_primary.png`<br>`packages/web/src/assets/vfx/heroes/jebe/hail_accent.png`                                             |
| `kaiserEngineering` | `packages/web/src/assets/vfx/heroes/grand-kaiser/engineering_primary.png`<br>`packages/web/src/assets/vfx/heroes/grand-kaiser/engineering_accent.png`               |
| `kaladinFifth`      | `packages/web/src/assets/vfx/heroes/kaladin/fifth_primary.png`<br>`packages/web/src/assets/vfx/heroes/kaladin/fifth_accent.png`                                     |
| `kaladinHeal`       | `packages/web/src/assets/vfx/heroes/kaladin/first.png`                                                                                                              |
| `kanekiRegen`       | `packages/web/src/assets/vfx/heroes/kaneki/regen.png`                                                                                                               |
| `lechyForest`       | `packages/web/src/assets/vfx/heroes/lechy/forest.png`                                                                                                               |
| `lechyGuide`        | `packages/web/src/assets/vfx/heroes/lechy/guide.png`                                                                                                                |
| `lechyStorm`        | `packages/web/src/assets/vfx/heroes/lechy/storm_primary.png`<br>`packages/web/src/assets/vfx/heroes/lechy/storm_accent.png`                                         |
| `lokiChicken`       | `packages/web/src/assets/vfx/heroes/loki/chicken.png`                                                                                                               |
| `lokiControl`       | `packages/web/src/assets/vfx/heroes/loki/control.png`                                                                                                               |
| `lokiEntangle`      | `packages/web/src/assets/vfx/heroes/loki/entangle.png`                                                                                                              |
| `lucheRadiance`     | `packages/web/src/assets/vfx/heroes/luche/radiance.png`                                                                                                             |
| `mettatonEx`        | `packages/web/src/assets/vfx/heroes/mettaton/ex.png`                                                                                                                |
| `mettatonNeo`       | `packages/web/src/assets/vfx/heroes/mettaton/neo_primary.png`<br>`packages/web/src/assets/vfx/heroes/mettaton/neo_accent.png`                                       |
| `mettatonPoppins`   | `packages/web/src/assets/vfx/heroes/mettaton/poppins_primary.png`<br>`packages/web/src/assets/vfx/heroes/mettaton/poppins_accent.png`                               |
| `odinMuninn`        | `packages/web/src/assets/vfx/heroes/odin/muninn.png`                                                                                                                |
| `odinSleipnir`      | `packages/web/src/assets/vfx/heroes/odin/sleipnir.png`                                                                                                              |
| `papyrusBones`      | `packages/web/src/assets/vfx/heroes/papyrus/bones.png`                                                                                                              |
| `papyrusSpaghetti`  | `packages/web/src/assets/vfx/heroes/papyrus/spaghetti.png`                                                                                                          |
| `papyrusUnbeliever` | `packages/web/src/assets/vfx/heroes/papyrus/unbeliever.png`                                                                                                         |
| `sansField`         | `packages/web/src/assets/vfx/heroes/sans/bone_field.png`                                                                                                            |
| `sansJoke`          | `packages/web/src/assets/vfx/heroes/sans/joke.png`                                                                                                                  |
| `sansSleep`         | `packages/web/src/assets/vfx/heroes/sans/sleep.png`                                                                                                                 |
| `sansUnbeliever`    | `packages/web/src/assets/vfx/heroes/sans/unbeliever.png`                                                                                                            |
| `undyneThrow`       | `packages/web/src/assets/vfx/heroes/undyne/throw.png`                                                                                                               |
| `undyneUndying`     | `packages/web/src/assets/vfx/heroes/undyne/undying_primary.png`<br>`packages/web/src/assets/vfx/heroes/undyne/undying_accent.png`                                   |
| `zoroAsura`         | `packages/web/src/assets/vfx/heroes/zoro/asura_primary.png`<br>`packages/web/src/assets/vfx/heroes/zoro/asura_accent.png`                                           |
| `zoroOni`           | `packages/web/src/assets/vfx/heroes/zoro/oni_giri.png`                                                                                                              |

## 10. Audio/VFX dedupe and outcome ordering

PresentationSession remains the stream/revision/eventId ingress authority. Signature cue IDs use stream + abilityUseId + stage/key, once for a cast/aggregate/first confirmed accent. Separate uses remain distinct. Actual recurring status events use eventId. Group signatures play once while authorized target art stays independent.

Aggregate normalization excludes damage already owned by attacks. Direct aggregates retain one HP transition per actual damaged unit and generic impact audio; final death follows damage even when emitted early. Original event indices remain stable. No hero module applies HP, rolls dice or removes a unit independently. Mappers never reconstruct identity from adjacent unrelated events.

## 11. Privacy and session behavior

The client receives PlayerView/projected events only. New private commits are owner-only for both P1 and P2, and absent for spectators. Event-time visibility authorizes frozen historical cells; last-known positions do not supply current anchors. Unit-attached VFX and delayed new status audio stop if current projection loses the unit/position. Explicit authorized historical-cell effects can complete independently. Room/role/stream resets invalidate pending tokens; silent hydration/reconnect does not replay old one-shots. Existing board transforms handle P1/P2 and clipping.

Mapped hero sounds warm only for the actual projected match roster; no whole-library lobby preload. Cache failure, mute and volume retain established fail-safe behavior, without late replay.

## 12. Coverage document and genuine gaps

Created `packages/web/src/assets/HERO_PRESENTATION_COVERAGE.md`; generator and classification metadata make it maintainable. Three unlocks lack semantic events, several line/sparse abilities lack precise projected footprints, and Frisk commitments lack option discrimination. Undyne Direction Shift lacks runtime implementation. Essential existing asset paths are verified; no binaries are fabricated. Compact/shared presentation remains usable while those prerequisites are unresolved.

## 13. Files created

- `packages/web/scripts/generate-hero-presentation-coverage.ts`
- `packages/web/scripts/hero-presentation-inventory.ts`
- `packages/web/scripts/phase13-fixtures.ts`
- `packages/web/scripts/phase13-smoke.mjs`
- `packages/web/src/assets/HERO_PRESENTATION_COVERAGE.md`
- `packages/web/src/assets/PHASE13_REPORT.md`
- `packages/web/src/game/effects/heroAbilityCoverage.test.ts`
- `packages/web/src/game/effects/heroAbilityCoverage.ts`
- `packages/web/src/game/effects/remainingHeroPresentation.test.ts`
- `packages/web/src/game/effects/remainingHeroPresentation.ts`

## 14. Files modified

- `packages/rules/src/actions/abilityCosts.ts`
- `packages/rules/src/actions/heroes/mettaton/actions.ts`
- `packages/rules/src/actions/heroes/mettaton/queue.ts`
- `packages/rules/src/core/abilityUse.ts`
- `packages/rules/src/tests/core/snapshots.test.ts`
- `packages/rules/src/view/eventPayload.ts`
- `packages/rules/src/view/events.ts`
- `packages/web/package.json`
- `packages/web/src/assets/sfx/registry.ts`
- `packages/web/src/features/sfx/audioPreload.ts`
- `packages/web/src/features/sfx/sfxEventMapper.test.ts`
- `packages/web/src/features/sfx/sfxEventMapper.ts`
- `packages/web/src/features/sfx/sfxPlaybackSession.ts`
- `packages/web/src/features/sfx/sfxPlayer.test.ts`
- `packages/web/src/features/sfx/sfxTypes.ts`
- `packages/web/src/features/sfx/useBoardSfx.ts`
- `packages/web/src/features/vfx/VfxLayer.tsx`
- `packages/web/src/features/vfx/vfxEventMapper.test.ts`
- `packages/web/src/features/vfx/vfxEventMapper.ts`
- `packages/web/src/features/vfx/vfxPreviewScenarios.test.ts`
- `packages/web/src/features/vfx/vfxPreviewScenarios.ts`
- `packages/web/src/features/vfx/vfxRegistry.ts`
- `packages/web/src/features/vfx/vfxTypes.ts`
- `packages/web/src/game/effects/combatPlayback.ts`
- `packages/web/src/game/effects/sansPresentation.test.ts`
- `packages/web/src/game/effects/sansPresentation.ts`

## 15. Tests added

`remainingHeroPresentation.test.ts` adds 11 focused integration/regression cases: every committed source anchor; all square/sparse areas/use dedupe; real private Hassan selection and rejected choices; real sixth-snare direct damage/death ordering; actual reached snare/private remaining traps; actual private Chikatilo mark; Papyrus/Lechy/transform semantic results; synchronized confirmed-hit accents/misses; three independent Genghis manual reactors/reached Rider path/slot preservation; charge threshold readiness/successful stealth; delayed authorization loss, reset, duplicate ingress, hydration and P1/P2 geometry.

`heroAbilityCoverage.test.ts` adds 3 cases for all canonical forms/unlocks/token coverage, valid registry/existing asset files/actual PNG strip dimensions, and the maintained matrix. Existing tests keep meaningful assertions and adopt intentional new assets, exact private sound counts, corrected transform semantics, new core-cache bounds and frozen-source golden metadata.

`phase13-fixtures.ts` and `phase13-smoke.mjs` add a reproducible local browser smoke using actual rules projections, Board, reaction UI, Web Audio, DOM effects and screenshots. Run `npm run -w web test:phase13:e2e` with an installed Chromium browser; optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

## 16. Test and build results

| Command                              | Result                                                              |
| ------------------------------------ | ------------------------------------------------------------------- |
| `npm run -w web test:effects`        | PASS ? 204 tests, including 14 newly added tests                    |
| `npm run -w web test:sfx`            | PASS ? 38 tests                                                     |
| `npm run -w web test:vfx`            | PASS ? 50 tests (also included in effects)                          |
| `npm run test:web`                   | PASS ? 670 tests; translation CLI checks also pass                  |
| `npm run -w rules test`              | PASS ? full rules runner, including golden snapshots                |
| `npm run test:server`                | PASS ? 11 suite executions                                          |
| `npm run test:contract`              | PASS ? 20 suite executions                                          |
| `npm run build`                      | PASS ? rules/server builds, web typecheck and production Vite build |
| ESLint on all changed/new TypeScript | PASS ? zero warnings                                                |
| `node packages/web/scripts/phase13-smoke.mjs`    | PASS ? six actual Board scenarios; no browser errors                |
| `git diff --check`                   | PASS                                                                |

Vite reports its existing large-chunk advisory; no build/type errors. Counts across overlapping focused/full commands are not additive.

## 17. Actual browser verification; manual scope

No manually played two-account/WebSocket match was performed. The in-app browser's required Node REPL tool was unavailable, so local headless Chromium ran the documented fallback smoke. It renders real P1, P2 and spectator Boards from authoritative recipient-projected fixtures. Browser assets decode and play through the real SfxPlayer. It exercises Jack private placement/reached trigger/Covering Tracks; Hassan private pending selection/owner-only commitment; Chikatilo private mark; Genghis three separate reaction panels (Attack/Pass/Attack) and four manual roll commands; Lechy Storm activation. It checks duplicate silence, reconnect baseline, mute/zero volume, reduced motion and absence of runtime page errors. Unit tests additionally assert no duplicated HP or premature final death and slot preservation.

Captured images were visually inspected for mirrored P2 area geometry, the damage-before-final-death frame and the owner-only reduced-motion Hassan cue. Screenshot/observation artifacts are generated under ignored `packages/web/test-results/phase13/browser/`, including `observations.json`. The harness uses real-time React settling alongside virtual gameplay timers so duplicate checks observe committed batches. It does not exercise a live WebSocket transport, every hero artwork, all supported browsers or a full manually played match; existing server/contract tests cover transport/projection regressions.

## 18. Remaining prerequisites and recommended next steps

| Hero / ability                    | Missing prerequisite  | Safe behavior now / recommended next step                                                                                                                                                |
| --------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `luche/lucheBurningSun`           | GENERIC_ONLY          | Compact origin cue and signature audio; exact sparse/line geometry absent. Shared actual outcomes/HP; never fill its bounding square.                                                    |
| `luche/lucheDivineRay`            | GENERIC_ONLY          | Compact origin cue and signature audio; exact sparse/line geometry absent. Shared actual outcomes/HP; never fill its bounding square.                                                    |
| `kaneki/kanekiScolopendra`        | BLOCKED_BY_EVENT_DATA | Centipede unlock has no distinct event. Extra move/actual reached movement works generically; add an unlock event before transformation art/audio.                                       |
| `donKihote/donKihoteMadness`      | GENERIC_ONLY          | Compact origin cue and signature audio; exact sparse/line geometry absent. Shared actual outcomes/HP; never fill its bounding square.                                                    |
| `artemida/artemidaSilverCrescent` | GENERIC_ONLY          | Compact origin cue and signature audio; exact sparse/line geometry absent. Shared actual outcomes/HP; never fill its bounding square.                                                    |
| `frisk/friskGenocide`             | GENERIC_ONLY          | Keen Eye, Substitution and Precision use real reveal/combat. Commitment lacks option discriminator; do not guess a signature from resource spend.                                        |
| `frisk/friskOnePath`              | BLOCKED_BY_EVENT_DATA | One Path state changes without a dedicated unlock event. Add a recipient-safe semantic trigger before using one_path.png or unlock audio.                                                |
| `frisk/friskPacifism`             | GENERIC_ONLY          | Hugs and Warm Words signatures wired. Child's Cry/Power of Friendship have no distinct result discriminator; generic defense/end UI.                                                     |
| `undyne/undyneEnergySpear`        | GENERIC_ONLY          | Compact origin cue and signature audio; exact sparse/line geometry absent. Shared actual outcomes/HP; never fill its bounding square.                                                    |
| `undyne/undyneSwitchDirection`    | NOT_IMPLEMENTED       | Direction Shift is listed in canonical metadata, but no runtime force-move resolver/trigger exists. Implement rules separately before adding presentation; do not invent a displacement. |
| `papyrus/papyrusCoolGuy`          | GENERIC_ONLY          | Compact origin cue and signature audio; exact sparse/line geometry absent. Shared actual outcomes/HP; never fill its bounding square.                                                    |
| `papyrus/papyrusLongBone`         | GENERIC_ONLY          | Full chosen line geometry/axis absent from aggregate; retain actual per-target outcomes.                                                                                                 |
| `mettaton/mettatonLaser`          | GENERIC_ONLY          | Compact origin cue and signature audio; exact sparse/line geometry absent. Shared actual outcomes/HP; never fill its bounding square.                                                    |
| `mettaton/mettatonFinalChord`     | GENERIC_ONLY          | Compact origin cue and signature audio; exact sparse/line geometry absent. Shared actual outcomes/HP; never fill its bounding square.                                                    |
| `duolingo/duolingoBerserker`      | BLOCKED_BY_EVENT_DATA | Permanent unlock has no distinct semantic event. Current multiclass state restores silently; add an unlock event for berserker.png.                                                      |

Assets may exist but remain deliberately unused until they have an authorized trigger/geometry. Full ray/mask effects need recipient-safe shape metadata, not reconstructed target lists or hover choices. Source heal/readiness cues use common audio where no distinct mapped hero sound is needed. Mute/volume and cache failures use the established player fail-safe behavior. Match-only warmup loads mapped sounds for the current projected roster; no whole-library lobby preload or late-cue replay.

## 19. Deferred roadmap work

- **PHASE 14 ? Persistent Status VFX:** long-lived apply/tick/remove lifecycle, ownership reconciliation, loops/overlays and full status rendering.
- **PHASE 15 ? Polish, Preloading & Final Stress Test:** broader artwork timing/visual review, cache/loading polish and stress tests.

Neither phase is started. Phase 13 stops at reliable one-shot integration, generic fallbacks and this explicit coverage report.
