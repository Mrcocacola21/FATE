# Previous specification comparison

Every requested concept is classified below using current implementation and available files. FOUND concerns availability, not runtime integration. Prior MISSING/UPGRADE labels are historical. A procedural/UI requirement is not a request to generate a bitmap.

## SFX

| Requested concept | Classification | Canonical files / reason |
| --- | --- | --- |
| SFX_UI_CLICK | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/ui/buttonClick01.wav`<br>`packages/web/src/assets/sfx/common/ui/buttonClick02.wav`<br>`packages/web/src/assets/sfx/common/ui/buttonClick03.wav` |
| SFX_UI_SELECT | FOUND | `packages/web/src/assets/sfx/common/ui/actionSelect.wav` |
| SFX_UI_INVALID | FOUND | `packages/web/src/assets/sfx/common/ui/actionInvalid.wav` |
| SFX_UI_PENDING | FOUND | `packages/web/src/assets/sfx/common/ui/decisionReady.wav` |
| SFX_UI_TARGET | FOUND | `packages/web/src/assets/sfx/common/ui/targetConfirm.wav` |
| SFX_UI_MODAL | FOUND | `packages/web/src/assets/sfx/common/ui/modalOpen.wav` |
| SFX_DICE_ROLL | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/combat/diceRoll01.wav`<br>`packages/web/src/assets/sfx/common/combat/diceRoll02.wav`<br>`packages/web/src/assets/sfx/common/combat/diceRoll03.wav`<br>`packages/web/src/assets/sfx/common/combat/diceRoll04.wav` |
| SFX_ATTACK | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/combat/attack01.wav`<br>`packages/web/src/assets/sfx/common/combat/attack02.wav`<br>`packages/web/src/assets/sfx/common/combat/attack03.wav` |
| SFX_HIT | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/combat/hit01.wav`<br>`packages/web/src/assets/sfx/common/combat/hit02.wav`<br>`packages/web/src/assets/sfx/common/combat/hit03.wav`<br>`packages/web/src/assets/sfx/common/combat/hit04.wav` |
| SFX_MISS | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/combat/miss01.wav`<br>`packages/web/src/assets/sfx/common/combat/miss02.wav`<br>`packages/web/src/assets/sfx/common/combat/miss03.wav` |
| SFX_DEATH | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/combat/death01.wav`<br>`packages/web/src/assets/sfx/common/combat/death02.wav` |
| SFX_HEAL | FOUND | `packages/web/src/assets/sfx/common/status/heal.wav` |
| SFX_AUTO_DEFENSE | FOUND | `packages/web/src/assets/sfx/common/combat/autoDefense.wav` |
| SFX_SPECIAL_ROLL | FOUND | `packages/web/src/assets/sfx/common/combat/specialRoll.wav` |
| SFX_MOVE | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/movement/move01.wav`<br>`packages/web/src/assets/sfx/common/movement/move02.wav`<br>`packages/web/src/assets/sfx/common/movement/move03.wav`<br>`packages/web/src/assets/sfx/common/movement/move04.wav` |
| SFX_RIDER_MOVE | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/movement/riderMove01.wav`<br>`packages/web/src/assets/sfx/common/movement/riderMove02.wav`<br>`packages/web/src/assets/sfx/common/movement/riderMove03.wav` |
| SFX_HEAVY_MOVE | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/movement/heavyMove01.wav`<br>`packages/web/src/assets/sfx/common/movement/heavyMove02.wav`<br>`packages/web/src/assets/sfx/common/movement/heavyMove03.wav` |
| SFX_TELEPORT | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/movement/teleport01.wav`<br>`packages/web/src/assets/sfx/common/movement/teleport02.wav` |
| SFX_FORCED_MOVE | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/movement/forcedMove01.wav`<br>`packages/web/src/assets/sfx/common/movement/forcedMove02.wav` |
| SFX_STEALTH_ENTER | FOUND | `packages/web/src/assets/sfx/common/status/stealthEnter.wav` |
| SFX_STEALTH_REVEAL | FOUND | `packages/web/src/assets/sfx/common/status/stealthReveal.wav` |
| SFX_SEARCH | FOUND | `packages/web/src/assets/sfx/common/status/search.wav` |
| SFX_STATUS_APPLIED | FOUND | `packages/web/src/assets/sfx/common/status/applied.wav` |
| SFX_STATUS_TICK | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/status/damageTick01.wav`<br>`packages/web/src/assets/sfx/common/status/damageTick02.wav` |
| SFX_STATUS_END | FOUND | `packages/web/src/assets/sfx/common/status/expired.wav` |
| SFX_CHARGE_READY | FOUND | `packages/web/src/assets/sfx/common/ui/chargeReady.wav` |
| SFX_TURN | FOUND | `packages/web/src/assets/sfx/common/ui/yourTurn.wav` |
| SFX_ROUND | FOUND | `packages/web/src/assets/sfx/common/ui/newRound.wav` |
| SFX_PLACEMENT | FOUND | `packages/web/src/assets/sfx/common/ui/placement.wav` |
| SFX_BATTLE | FOUND | `packages/web/src/assets/sfx/common/ui/battleStart.wav` |
| SFX_VICTORY | FOUND | `packages/web/src/assets/sfx/common/ui/victory.wav` |
| SFX_DEFEAT | FOUND | `packages/web/src/assets/sfx/common/ui/defeat.wav` |
| SFX_DRAW | FOUND | `packages/web/src/assets/sfx/common/ui/draw.wav` |
| SFX_ROOM_READY | FOUND | `packages/web/src/assets/sfx/common/ui/roomReady.wav` |
| SFX_DISCONNECT | FOUND | `packages/web/src/assets/sfx/common/ui/connectionLost.wav` |
| SFX_RECONNECT | FOUND | `packages/web/src/assets/sfx/common/ui/connectionRestored.wav` |
| SFX_REACTION | FOUND | `packages/web/src/assets/sfx/common/combat/reactionAttack.wav` |
| SFX_GENERIC_ABILITY | FOUND | `packages/web/src/assets/sfx/common/combat/ability.wav` |
| SFX_TRICKSTER_AOE | FOUND | `packages/web/src/assets/sfx/common/combat/tricksterAoE.wav` |
| SFX_RULE_EFFECT | FOUND | `packages/web/src/assets/sfx/common/combat/ruleEffect.wav` |
| SFX_MOON_METEOR | FOUND | `packages/web/src/assets/sfx/common/combat/moonMeteor.wav` |
| SFX_KAISER_BUNKER_ENTER | FOUND | `packages/web/src/assets/sfx/heroes/grand-kaiser/abilities/kaiserBunkerEnter.wav` |
| SFX_KAISER_BUNKER_EXIT | FOUND | `packages/web/src/assets/sfx/heroes/grand-kaiser/abilities/kaiserBunkerExit.wav` |
| SFX_KAISER_CARPET_LAUNCH | FOUND | `packages/web/src/assets/sfx/heroes/grand-kaiser/abilities/kaiserCarpetStrikeLaunch.wav` |
| SFX_KAISER_CARPET_IMPACT | FOUND | `packages/web/src/assets/sfx/heroes/grand-kaiser/abilities/kaiserCarpetStrikeImpact.wav` |
| SFX_VLAD_STARE | FOUND | `packages/web/src/assets/sfx/heroes/vladTepes/abilities/vladIntimidateActivate.wav` |
| SFX_VLAD_STAKE_PLACE | FOUND AS VARIANT | `packages/web/src/assets/sfx/heroes/vladTepes/abilities/vladStakesPlace01.wav`<br>`packages/web/src/assets/sfx/heroes/vladTepes/abilities/vladStakesPlace02.wav`<br>`packages/web/src/assets/sfx/heroes/vladTepes/abilities/vladStakesPlace03.wav` |
| SFX_VLAD_STAKE_TRIGGER | FOUND AS VARIANT | `packages/web/src/assets/sfx/heroes/vladTepes/abilities/vladStakesTrigger01.wav`<br>`packages/web/src/assets/sfx/heroes/vladTepes/abilities/vladStakesTrigger02.wav`<br>`packages/web/src/assets/sfx/heroes/vladTepes/abilities/vladStakesTrigger03.wav` |
| SFX_VLAD_FOREST | FOUND | `packages/web/src/assets/sfx/heroes/vladTepes/abilities/vladForestCast.wav` |
| SFX_SANS_BLASTER_CHARGE | FOUND | `packages/web/src/assets/sfx/heroes/sans/abilities/sansGasterBlasterCharge.wav` |
| SFX_SANS_BLASTER_FIRE | FOUND | `packages/web/src/assets/sfx/heroes/sans/abilities/sansGasterBlasterFire.wav` |
| SFX_SANS_JOKE | FOUND | `packages/web/src/assets/sfx/heroes/sans/abilities/sansBadassJokeCast.wav` |
| SFX_SANS_BONE_FIELD | FOUND | `packages/web/src/assets/sfx/heroes/sans/abilities/sansBoneFieldActivate.wav` |
| SFX_SANS_CURSE_APPLY | FOUND | `packages/web/src/assets/sfx/heroes/sans/abilities/sansLastAttackApply.wav` |
| SFX_SANS_CURSE_TICK | FOUND AS VARIANT | `packages/web/src/assets/sfx/heroes/sans/abilities/sansLastAttackTick01.wav`<br>`packages/web/src/assets/sfx/heroes/sans/abilities/sansLastAttackTick02.wav` |
| SFX_SANS_CURSE_END | FOUND | `packages/web/src/assets/sfx/heroes/sans/abilities/sansLastAttackExpire.wav` |
| SFX_ASGORE_FIREBALL_CAST | FOUND | `packages/web/src/assets/sfx/heroes/asgore/abilities/asgoreFireballCast.wav` |
| SFX_ASGORE_FIREBALL_IMPACT | FOUND AS VARIANT | `packages/web/src/assets/sfx/heroes/asgore/abilities/asgoreFireballImpact01.wav`<br>`packages/web/src/assets/sfx/heroes/asgore/abilities/asgoreFireballImpact02.wav` |
| SFX_ASGORE_FIREBALL_TRAVEL | FOUND | `packages/web/src/assets/sfx/heroes/asgore/abilities/asgoreFireballTravel.wav` |
| SFX_ASGORE_FIRE_PARADE | FOUND | `packages/web/src/assets/sfx/heroes/asgore/abilities/asgoreFireParadeCast.wav` |
| SFX_ASGORE_SOUL_PARADE | FOUND | `packages/web/src/assets/sfx/heroes/asgore/abilities/asgoreSoulParadeReveal.wav` |
| SFX_JACK_SNARE_PLACE | FOUND AS VARIANT | `packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresPlace01.wav`<br>`packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresPlace02.wav`<br>`packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresPlace03.wav` |
| SFX_JACK_SNARE_TRIGGER | FOUND AS VARIANT | `packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresTrigger01.wav`<br>`packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresTrigger02.wav`<br>`packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperSnaresTrigger03.wav` |
| SFX_JACK_SNARE_EXPLODE | FOUND AS VARIANT | `packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperCoveringTracksExplode01.wav`<br>`packages/web/src/assets/sfx/heroes/jackRipper/abilities/jackRipperCoveringTracksExplode02.wav` |
| SFX_HASSAN_ORDER | FOUND | `packages/web/src/assets/sfx/heroes/hassan/phantasms/hassanAssasinOrderGrant.wav` |
| SFX_GENGHIS_DECREE | FOUND | `packages/web/src/assets/sfx/heroes/genghisKhan/abilities/genghisKhanKhansDecreeActivate.wav` |
| SFX_GENGHIS_CHARGE | FOUND | `packages/web/src/assets/sfx/heroes/genghisKhan/phantasms/genghisKhanMongolChargeActivate.wav` |
| SFX_GUTS_CROSSBOW | FOUND | `packages/web/src/assets/sfx/heroes/guts/abilities/gutsArbaletFire.wav` |
| SFX_GUTS_CANNON | FOUND | `packages/web/src/assets/sfx/heroes/guts/abilities/gutsCannonFire.wav` |
| SFX_GUTS_BERSERK | FOUND | `packages/web/src/assets/sfx/heroes/guts/phantasms/gutsBerserkModeActivate.wav` |
| SFX_GUTS_BERSERK_EXIT | FOUND | `packages/web/src/assets/sfx/heroes/guts/abilities/gutsExitBerserkRelease.wav` |
| SFX_GUTS_SWEEP | FOUND | `packages/web/src/assets/sfx/heroes/guts/phantasms/gutsBerserkModeSweep.wav` |
| SFX_GRIFFITH_REBIRTH | FOUND | `packages/web/src/assets/sfx/heroes/griffith/transformations/griffithFemtoRebirthTransform.wav` |
| SFX_ODIN_SLEIPNIR | FOUND | `packages/web/src/assets/sfx/heroes/odin/abilities/odinSleipnirTeleport.wav` |
| SFX_LOKI_ENTANGLE | FOUND | `packages/web/src/assets/sfx/heroes/loki/phantasms/lokiLaughtEntangle.wav` |
| SFX_LOKI_CHICKEN | FOUND | `packages/web/src/assets/sfx/heroes/loki/phantasms/lokiLaughtChicken.wav` |
| SFX_LOKI_SPIN | FOUND | `packages/web/src/assets/sfx/heroes/loki/phantasms/lokiLaughtSpin.wav` |
| SFX_JEBE_HAIL | FOUND | `packages/web/src/assets/sfx/heroes/jebe/abilities/jebeHailOfArrowsFire.wav` |
| SFX_JEBE_RICOCHET | FOUND AS VARIANT | `packages/web/src/assets/sfx/heroes/jebe/phantasms/jebeKhansShooterFire01.wav`<br>`packages/web/src/assets/sfx/heroes/jebe/phantasms/jebeKhansShooterFire02.wav` |
| SFX_KALADIN_FIFTH | FOUND | `packages/web/src/assets/sfx/heroes/kaladin/phantasms/kaladinFifthCast.wav` |
| SFX_ELCID_TISONA | FOUND | `packages/web/src/assets/sfx/heroes/elCidCompeador/abilities/elCidCompeadorTisonaSweep.wav` |
| SFX_ELCID_KOLADA | FOUND | `packages/web/src/assets/sfx/heroes/elCidCompeador/abilities/elCidCompeadorKoladaSweep.wav` |
| SFX_ELCID_DUELIST | FOUND | `packages/web/src/assets/sfx/heroes/elCidCompeador/phantasms/elCidCompeadorDemonDuelistActivate.wav` |
| SFX_GROZNY_INVADE | FOUND | `packages/web/src/assets/sfx/heroes/grozny/abilities/groznyInvadeTimeTeleport.wav` |
| SFX_GROZNY_TYRANT | FOUND | `packages/web/src/assets/sfx/heroes/grozny/abilities/groznyTyrantActivate.wav` |
| SFX_FRISK_HUGS | FOUND | `packages/web/src/assets/sfx/heroes/frisk/phantasms/friskPacifismHugs.wav` |
| SFX_FRISK_PRECISION | FOUND | `packages/web/src/assets/sfx/heroes/frisk/phantasms/friskGenocidePrecisionStrike.wav` |
| SFX_SUBSTITUTION | FOUND | `packages/web/src/assets/sfx/common/status/substitution.wav` |
| SFX_FRISK_ONE_PATH | FOUND | `packages/web/src/assets/sfx/heroes/frisk/phantasms/friskOnePathUnlock.wav` |
| SFX_PAPYRUS_BLUE | FOUND | `packages/web/src/assets/sfx/heroes/papyrus/abilities/papyrusBlueBoneApply.wav` |
| SFX_PAPYRUS_ORANGE | FOUND | `packages/web/src/assets/sfx/heroes/papyrus/abilities/papyrusOrangeBoneApply.wav` |
| SFX_BONE_PUNISH | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/status/bonePunish01.wav`<br>`packages/web/src/assets/sfx/common/status/bonePunish02.wav` |
| SFX_AWAKEN | FOUND | `packages/web/src/assets/sfx/common/status/awaken.wav` |
| SFX_PAPYRUS_LINE | FOUND | `packages/web/src/assets/sfx/heroes/papyrus/abilities/papyrusCoolGuyFire.wav` |
| SFX_METTATON_POPPINS | FOUND | `packages/web/src/assets/sfx/heroes/mettaton/abilities/mettatonPoppinsFire.wav` |
| SFX_METTATON_LASER | FOUND | `packages/web/src/assets/sfx/heroes/mettaton/abilities/mettatonLaserFire.wav` |
| SFX_METTATON_EX | FOUND | `packages/web/src/assets/sfx/heroes/mettaton/transformations/mettatonExTransform.wav` |
| SFX_METTATON_NEO | FOUND | `packages/web/src/assets/sfx/heroes/mettaton/transformations/mettatonNeoTransform.wav` |
| SFX_METTATON_FINAL | FOUND | `packages/web/src/assets/sfx/heroes/mettaton/phantasms/mettatonFinalChordFire.wav` |
| SFX_UNDYNE_REVIVE | FOUND | `packages/web/src/assets/sfx/heroes/undyne/abilities/undyneUndyingRevive.wav` |
| SFX_RIVER_BOAT_LAUNCH | FOUND | `packages/web/src/assets/sfx/heroes/riverPerson/abilities/riverBoatLaunch.wav` |
| SFX_RIVER_BOAT_PICKUP | FOUND | `packages/web/src/assets/sfx/heroes/riverPerson/abilities/riverBoatPickup.wav` |
| SFX_RIVER_BOAT_MOVE | FOUND AS VARIANT | `packages/web/src/assets/sfx/heroes/riverPerson/abilities/riverBoatMove01.wav`<br>`packages/web/src/assets/sfx/heroes/riverPerson/abilities/riverBoatMove02.wav`<br>`packages/web/src/assets/sfx/heroes/riverPerson/abilities/riverBoatMove03.wav` |
| SFX_RIVER_BOAT_DROP | FOUND | `packages/web/src/assets/sfx/heroes/riverPerson/abilities/riverBoatDisembark.wav` |
| SFX_RIVER_BOAT_STOP | FOUND | `packages/web/src/assets/sfx/heroes/riverPerson/abilities/riverBoatInterrupted.wav` |
| SFX_RIVER_TRALALA | FOUND | `packages/web/src/assets/sfx/heroes/riverPerson/phantasms/riverTraLaLaActivate.wav` |
| SFX_RIVER_BOATMAN | FOUND | `packages/web/src/assets/sfx/heroes/riverPerson/abilities/riverBoatmanGrant.wav` |
| SFX_DUOLINGO_PUSH | FOUND | `packages/web/src/assets/sfx/heroes/duolingo/abilities/duolingoPushNotificationTeleport.wav` |
| SFX_LUCHE_RAY | FOUND | `packages/web/src/assets/sfx/heroes/luche/abilities/lucheDivineRayFire.wav` |
| SFX_LUCHE_SUN | FOUND | `packages/web/src/assets/sfx/heroes/luche/phantasms/lucheBurningSunCast.wav` |
| SFX_ZORO_ONI | FOUND | `packages/web/src/assets/sfx/heroes/zoro/abilities/zoroOniGiriDash.wav` |
| SFX_ZORO_ASURA | FOUND | `packages/web/src/assets/sfx/heroes/zoro/phantasms/zoroAsuraCast.wav` |
| SFX_DON_WINDMILLS | FOUND | `packages/web/src/assets/sfx/heroes/donKihote/abilities/donKihoteWindmillsDash.wav` |
| SFX_DON_MADNESS | FOUND | `packages/web/src/assets/sfx/heroes/donKihote/phantasms/donKihoteMadnessFinalAttack.wav` |
| SFX_ARTEMIS_REVEAL | FOUND | `packages/web/src/assets/sfx/heroes/artemida/abilities/artemidaMoonlightShotScan.wav` |
| SFX_ARTEMIS_CRESCENT | FOUND | `packages/web/src/assets/sfx/heroes/artemida/phantasms/artemidaSilverCrescentFire.wav` |
| SFX_PONG_BOUNCE | FOUND AS VARIANT | `packages/web/src/assets/sfx/common/combat/pongBounce01.wav`<br>`packages/web/src/assets/sfx/common/combat/pongBounce02.wav` |

## VFX

| Requested concept | Classification | Canonical files / reason |
| --- | --- | --- |
| VFX_TARGETING_SHARED | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_COMBAT_PREPARE | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_COMBAT_LAUNCH | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/combat/combat_launch.png` |
| VFX_COMBAT_HIT_LIGHT | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/combat/combat_hit_light.png` |
| VFX_COMBAT_HIT_HEAVY | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/combat/combat_hit_heavy.png` |
| VFX_COMBAT_MISS | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/combat/combat_miss.png` |
| VFX_COMBAT_DODGE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/combat/combat_dodge.png` |
| VFX_SPEARMAN_DOUBLE_DODGE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/combat/spearman_double_dodge.png` |
| VFX_BERSERKER_AUTO_DODGE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/combat/berserker_auto_dodge.png` |
| VFX_COMBAT_BLOCK | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/combat/combat_block.png` |
| VFX_DAMAGE_FEEDBACK | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_UNIT_DEATH | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/combat/unit_death.png` |
| VFX_UNIT_HEAL | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/combat/unit_heal.png` |
| VFX_MOVEMENT_NORMAL | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_MOVEMENT_RIDER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/movement/movement_rider.png` |
| VFX_MOVEMENT_BERSERKER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/movement/movement_berserker.png` |
| VFX_MOVEMENT_ASSASSIN | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/movement/movement_assassin.png` |
| VFX_MOVEMENT_TRICKSTER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/movement/movement_trickster.png` |
| VFX_MOVEMENT_FORCED | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_MOVEMENT_INTERRUPTED | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/movement/movement_interrupted.png` |
| VFX_STEALTH_ENTER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/status/stealth_enter.png` |
| VFX_STEALTH_REVEAL | REPLACED BY BETTER SHARED ASSET | `packages/web/src/assets/vfx/status/stealth_enter.png` |
| VFX_SEARCH_CAST | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/status/search_cast.png` |
| VFX_LAST_KNOWN | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_REACTION_OPPORTUNITY | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_REACTION_ATTACK | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_DICE_ROLL | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_DICE_RESULT | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_STATUS_SMALL | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/status/status_small.png` |
| VFX_TURN_ACTIVE | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_GAME_FLOW | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_ABILITY_READY | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_RULE_DECLARATION | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_KAISER_BUNKER_ENTRY | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/grand-kaiser/bunker_entry.png` |
| VFX_KAISER_BUNKER_STATUS | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/grand-kaiser/bunker_status.png` |
| VFX_KAISER_BUNKER_HIT_EXIT | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/grand-kaiser/bunker_hit_exit.png` |
| VFX_KAISER_DORA_PREVIEW | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_KAISER_DORA_IMPACT | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/grand-kaiser/dora_impact_primary.png`<br>`packages/web/src/assets/vfx/heroes/grand-kaiser/dora_impact_accent.png` |
| VFX_KAISER_CARPET_PREVIEW | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_KAISER_CARPET_IMPACT | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/grand-kaiser/carpet_impact_primary.png`<br>`packages/web/src/assets/vfx/heroes/grand-kaiser/carpet_impact_accent.png` |
| VFX_KAISER_ENGINEERING | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/grand-kaiser/engineering_primary.png`<br>`packages/web/src/assets/vfx/heroes/grand-kaiser/engineering_accent.png` |
| VFX_GRIFFITH_REBIRTH | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/griffith/rebirth_primary.png`<br>`packages/web/src/assets/vfx/heroes/griffith/rebirth_accent.png` |
| VFX_FEMTO_DIVINE_MOVE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/femto/divine_move.png` |
| VFX_GUTS_CROSSBOW | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/guts/crossbow.png` |
| VFX_GUTS_CANNON | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/guts/cannon_primary.png`<br>`packages/web/src/assets/vfx/heroes/guts/cannon_accent.png` |
| VFX_GUTS_BERSERK | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/guts/berserk_primary.png`<br>`packages/web/src/assets/vfx/heroes/guts/berserk_accent.png` |
| VFX_GUTS_BERSERK_EXIT_DRAIN | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/guts/berserk_exit_drain.png` |
| VFX_ODIN_GUNGNIR | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/odin/gungnir.png` |
| VFX_ODIN_HUGINN | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/odin/huginn.png` |
| VFX_ODIN_MUNINN | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/odin/muninn.png` |
| VFX_ODIN_SLEIPNIR | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/odin/sleipnir.png` |
| VFX_LOKI_ENTANGLE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/loki/entangle.png` |
| VFX_LOKI_CHICKEN | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/loki/chicken.png` |
| VFX_LOKI_CONTROL | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/loki/control.png` |
| VFX_LOKI_SPIN | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/loki/spin.png` |
| VFX_JEBE_HAIL_PREVIEW | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_JEBE_HAIL | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/jebe/hail_primary.png`<br>`packages/web/src/assets/vfx/heroes/jebe/hail_accent.png` |
| VFX_JEBE_RICOCHET | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/jebe/ricochet_primary.png`<br>`packages/web/src/assets/vfx/heroes/jebe/ricochet_accent.png` |
| VFX_HASSAN_ORDER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/hassan/order.png` |
| VFX_HASSAN_TRUE_ENEMY | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/hassan/true_enemy.png` |
| VFX_KALADIN_FIRST | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/kaladin/first.png` |
| VFX_KALADIN_FIFTH_PREVIEW | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_KALADIN_FIFTH | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/kaladin/fifth_primary.png`<br>`packages/web/src/assets/vfx/heroes/kaladin/fifth_accent.png` |
| VFX_LUCHE_RADIANCE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/luche/radiance.png` |
| VFX_LUCHE_RAY | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/luche/ray_primary.png`<br>`packages/web/src/assets/vfx/heroes/luche/ray_accent.png` |
| VFX_LUCHE_FALLING_SUN | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/luche/falling_sun_primary.png`<br>`packages/web/src/assets/vfx/heroes/luche/falling_sun_accent.png` |
| VFX_KANEKI_REGEN | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/kaneki/regen.png` |
| VFX_KANEKI_CENTIPEDE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/kaneki/centipede.png` |
| VFX_ZORO_SANTORYU | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/zoro/santoryu.png` |
| VFX_ZORO_ONI_GIRI | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/zoro/oni_giri.png` |
| VFX_ZORO_ASURA | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/zoro/asura_primary.png`<br>`packages/web/src/assets/vfx/heroes/zoro/asura_accent.png` |
| VFX_DON_SORROW_MOVE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/donKihote/sorrow_move.png` |
| VFX_DON_WINDMILLS | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/donKihote/windmills_primary.png`<br>`packages/web/src/assets/vfx/heroes/donKihote/windmills_accent.png` |
| VFX_DON_MADNESS | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/donKihote/madness_primary.png`<br>`packages/web/src/assets/vfx/heroes/donKihote/madness_accent.png` |
| VFX_JACK_SNARE_PLACE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/jackRipper/snare_place.png` |
| VFX_JACK_SNARE_REVEAL_TRIGGER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/jackRipper/snare_reveal_trigger.png` |
| VFX_JACK_SNARE_STATUS | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_JACK_COVER_TRACKS | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/jackRipper/cover_tracks_primary.png`<br>`packages/web/src/assets/vfx/heroes/jackRipper/cover_tracks_accent.png` |
| VFX_JACK_SLAUGHTER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/jackRipper/slaughter_primary.png`<br>`packages/web/src/assets/vfx/heroes/jackRipper/slaughter_accent.png` |
| VFX_JACK_SURGERY | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_ARTEMIS_MOON_PREVIEW | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_ARTEMIS_MOON_REVEAL | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/artemida/moon_reveal.png` |
| VFX_ARTEMIS_CRESCENT | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/artemida/crescent_primary.png`<br>`packages/web/src/assets/vfx/heroes/artemida/crescent_accent.png` |
| VFX_FRISK_HUGS | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/frisk/hugs.png` |
| VFX_FRISK_WARM_WORDS | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/frisk/warm_words.png` |
| VFX_FRISK_CRY | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/frisk/cry.png` |
| VFX_FRISK_FRIENDSHIP | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/frisk/friendship.png` |
| VFX_FRISK_SUBSTITUTION | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/frisk/substitution.png` |
| VFX_FRISK_KEEN_EYE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/frisk/keen_eye.png` |
| VFX_FRISK_PRECISION | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/frisk/precision.png` |
| VFX_FRISK_ONE_PATH | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/frisk/one_path.png` |
| VFX_FRISK_CLEAN_SOUL | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/frisk/clean_soul.png` |
| VFX_SANS_GASTER_PREVIEW | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_SANS_GASTER_CANNON | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/sans/gaster_cannon.png` |
| VFX_SANS_GASTER_BEAM | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/sans/gaster_beam_primary.png`<br>`packages/web/src/assets/vfx/heroes/sans/gaster_beam_accent.png` |
| VFX_SANS_JOKE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/sans/joke.png` |
| VFX_SANS_UNBELIEVER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/sans/unbeliever.png` |
| VFX_SANS_BONE_FIELD | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/sans/bone_field.png` |
| VFX_SANS_SLEEP | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/sans/sleep.png` |
| VFX_SANS_LAST_PREDEATH | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_SANS_CURSE_APPLY | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/sans/curse_apply.png` |
| VFX_SANS_CURSE_STATUS | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/sans/curse_status.png` |
| VFX_SANS_CURSE_TICK_END | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/sans/curse_tick_end.png` |
| VFX_ASGORE_FIREBALL | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/asgore/fireball.png` |
| VFX_ASGORE_FIRE_PARADE_PREVIEW | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_ASGORE_FIRE_PARADE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/asgore/fire_parade_primary.png`<br>`packages/web/src/assets/vfx/heroes/asgore/fire_parade_accent.png` |
| VFX_ASGORE_SOUL_PARADE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/asgore/soul_parade.png` |
| VFX_UNDYNE_THROW | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/undyne/throw.png` |
| VFX_UNDYNE_ENERGY_PREVIEW | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_UNDYNE_ENERGY | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/undyne/energy_primary.png`<br>`packages/web/src/assets/vfx/heroes/undyne/energy_accent.png` |
| VFX_UNDYNE_SHIFT | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/undyne/shift.png` |
| VFX_UNDYNE_UNDYING | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/undyne/undying_primary.png`<br>`packages/web/src/assets/vfx/heroes/undyne/undying_accent.png` |
| VFX_PAPYRUS_BONES | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/papyrus/bones.png` |
| VFX_PAPYRUS_SPAGHETTI | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/papyrus/spaghetti.png` |
| VFX_PAPYRUS_UNBELIEVER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/papyrus/unbeliever.png` |
| VFX_PAPYRUS_LINE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/papyrus/line_primary.png`<br>`packages/web/src/assets/vfx/heroes/papyrus/line_accent.png` |
| VFX_METTATON_EX | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/mettaton/ex.png` |
| VFX_METTATON_NEO | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/mettaton/neo_primary.png`<br>`packages/web/src/assets/vfx/heroes/mettaton/neo_accent.png` |
| VFX_METTATON_POPPINS | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/mettaton/poppins_primary.png`<br>`packages/web/src/assets/vfx/heroes/mettaton/poppins_accent.png` |
| VFX_METTATON_LASER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/mettaton/laser_primary.png`<br>`packages/web/src/assets/vfx/heroes/mettaton/laser_accent.png` |
| VFX_METTATON_FINAL_CHORD | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/mettaton/final_chord_primary.png`<br>`packages/web/src/assets/vfx/heroes/mettaton/final_chord_accent.png` |
| VFX_METTATON_RATING | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_RIVER_BOAT_START_PICKUP | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/riverPerson/boat_start_pickup.png` |
| VFX_RIVER_BOAT_TRAVEL | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/riverPerson/boat_travel.png` |
| VFX_RIVER_BOAT_DROP | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/riverPerson/boat_drop.png` |
| VFX_RIVER_STAKE_STOP | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_RIVER_PASSENGER_STAKE | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_RIVER_BOATMAN | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_RIVER_TRALALA | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/riverPerson/tralala_primary.png`<br>`packages/web/src/assets/vfx/heroes/riverPerson/tralala_accent.png` |
| VFX_DUOLINGO_PUSH | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/duolingo/push.png` |
| VFX_DUOLINGO_BERSERKER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/duolingo/berserker.png` |
| VFX_CHIKATILO_FALSE_TRAIL | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/chikatilo/false_trail.png` |
| VFX_CHIKATILO_MARK | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/chikatilo/mark.png` |
| VFX_CHIKATILO_DECOY | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/chikatilo/decoy.png` |
| VFX_FALSE_TRAIL_EXPLOSION | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/chikatilo/false_trail_explosion_primary.png`<br>`packages/web/src/assets/vfx/heroes/chikatilo/false_trail_explosion_accent.png` |
| VFX_GROZNY_INVADE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/grozny/invade.png` |
| VFX_GROZNY_TYRANT | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/grozny/tyrant_primary.png`<br>`packages/web/src/assets/vfx/heroes/grozny/tyrant_accent.png` |
| VFX_ELCID_TISONA | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/elCidCompeador/tisona_primary.png`<br>`packages/web/src/assets/vfx/heroes/elCidCompeador/tisona_accent.png` |
| VFX_ELCID_KOLADA | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/elCidCompeador/kolada.png` |
| VFX_ELCID_DUEL | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/elCidCompeador/duel_primary.png`<br>`packages/web/src/assets/vfx/heroes/elCidCompeador/duel_accent.png` |
| VFX_LECHY_GUIDE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/lechy/guide.png` |
| VFX_LECHY_FOREST | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/lechy/forest.png` |
| VFX_LECHY_STORM | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/lechy/storm_primary.png`<br>`packages/web/src/assets/vfx/heroes/lechy/storm_accent.png` |
| VFX_VLAD_STAKES_PLACE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/vladTepes/stakes_place.png` |
| VFX_VLAD_STAKE_TRIGGER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/vladTepes/stake_trigger.png` |
| VFX_VLAD_STAKE_MARKER | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/vladTepes/stake_marker.png` |
| VFX_VLAD_FOREST_PREVIEW | REPLACED BY BETTER SHARED ASSET | No raster delivery requested. Retain authorized CSS/DOM/UI or combine shared assets; see HERO_COVERAGE.md. Future presentation hooks are outside asset generation. |
| VFX_VLAD_FOREST_ERUPTION | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/vladTepes/forest_eruption_primary.png`<br>`packages/web/src/assets/vfx/heroes/vladTepes/forest_eruption_accent.png` |
| VFX_VLAD_GAZE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/vladTepes/gaze.png` |
| VFX_GENGHIS_DECREE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/genghisKhan/decree.png` |
| VFX_GENGHIS_CHARGE | FOUND WITH DIFFERENT NAME | `packages/web/src/assets/vfx/heroes/genghisKhan/charge_primary.png`<br>`packages/web/src/assets/vfx/heroes/genghisKhan/charge_accent.png` |
