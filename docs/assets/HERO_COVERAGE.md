# Implemented hero and ability coverage

Authority: `packages/rules/src/heroes.ts`, current `heroMeta` registry and `abilities/specs`, plus current rule handlers and recipient projection. 28 selectable heroes and implemented Griffith transformation Femto = 29 forms. False Trail Token is a Chikatilo mechanic, not a new hero.

All rows describe available source feedback, not connected playback. Pure stat/resource/passive modifiers do not require isolated sounds or raster effects; retain existing stats/status UI and normal combat feedback. Never play constant passive loops.

Shared IDs resolve through SPEC_COMPARISON.md to exact canonical files. Legacy paths below are relative to `packages/web/src/assets/sfx/` and have been decoded. A source is a reuse candidate; listening/art approval is separate.

## Grand Kaiser (`grand-kaiser`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Bunker (`kaiserBunker`), passive | SFX_KAISER_BUNKER_ENTER, SFX_KAISER_BUNKER_EXIT | VFX_KAISER_BUNKER_ENTRY, VFX_KAISER_BUNKER_STATUS, VFX_KAISER_BUNKER_HIT_EXIT |
| Dora (`kaiserDora`), active | `heroes/grand-kaiser/abilities/Dora.wav` | VFX_KAISER_DORA_PREVIEW, VFX_KAISER_DORA_IMPACT |
| Carpet Strike (`kaiserCarpetStrike`), impulse | SFX_KAISER_CARPET_LAUNCH, SFX_KAISER_CARPET_IMPACT | VFX_KAISER_CARPET_PREVIEW, VFX_KAISER_CARPET_IMPACT |
| Engineering Miracle (`kaiserEngineeringMiracle`), impulse | `heroes/grand-kaiser/transformations/EngineeringMiracle.mp3` | VFX_KAISER_ENGINEERING |

## Griffith (`griffith`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Wretched Man (`griffithWretchedMan`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Commander (`vladPolkovodets`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Femto Rebirth (`griffithFemtoRebirth`), passive | SFX_GRIFFITH_REBIRTH | VFX_GRIFFITH_REBIRTH |

## Femto (`femto`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| God (`femtoGodHp`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Multiclass Berserker + Spearman (`femtoMultiBerserkSpear`), passive | SFX_AUTO_DEFENSE, SFX_ATTACK | VFX_BERSERKER_AUTO_DODGE, VFX_SPEARMAN_DOUBLE_DODGE |
| Divine Movement (`femtoDivineMove`), active | SFX_TELEPORT | VFX_FEMTO_DIVINE_MOVE |
| Berserker Auto Defense (`berserkAutoDefense`), passive | SFX_AUTO_DEFENSE | VFX_BERSERKER_AUTO_DODGE |

## Guts (`guts`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Hand Crossbow (`gutsArbalet`), active | SFX_GUTS_CROSSBOW | VFX_GUTS_CROSSBOW |
| Hand Cannon (`gutsCannon`), active | SFX_GUTS_CANNON | VFX_GUTS_CANNON |
| Berserk Mode (`gutsBerserkMode`), phantasm | SFX_GUTS_BERSERK, SFX_GUTS_SWEEP | VFX_GUTS_BERSERK |

## Odin (`odin`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Gungnir (`odinGungnir`), passive | SFX_HIT | VFX_ODIN_GUNGNIR |
| Raven Huginn (`odinHuginn`), passive | SFX_SEARCH | VFX_ODIN_HUGINN |
| Raven Muninn (`odinMuninn`), passive | SFX_AUTO_DEFENSE | VFX_ODIN_MUNINN |
| Sleipnir (`odinSleipnir`), impulse | SFX_ODIN_SLEIPNIR | VFX_ODIN_SLEIPNIR |

## Loki (`loki`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Natural Stealth (`lokiNaturalStealth`), passive | SFX_STEALTH_ENTER | VFX_STEALTH_ENTER |
| Illusory Double (`lokiIllusoryDouble`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Loki's Laugh (`lokiLaught`), phantasm | SFX_LOKI_ENTANGLE, SFX_LOKI_CHICKEN, SFX_LOKI_SPIN | VFX_LOKI_ENTANGLE, VFX_LOKI_CHICKEN, VFX_LOKI_CONTROL, VFX_LOKI_SPIN |

## Jebe (`jebe`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Durable (`jebeDurable`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Khan's Shooter (`jebeKhansShooter`), phantasm | SFX_JEBE_RICOCHET | VFX_JEBE_RICOCHET |
| Hail of Arrows (`jebeHailOfArrows`), active | SFX_JEBE_HAIL | VFX_JEBE_HAIL_PREVIEW, VFX_JEBE_HAIL |
| Legend of the Steppes (`genghisKhanLegendOfTheSteppes`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Commander (`vladPolkovodets`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |

## Hassan-i Sabbah (`hassan`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| One With Sand (`hassanOneWithSand`), passive | SFX_STEALTH_ENTER | VFX_STEALTH_ENTER |
| True Enemy (`hassanTrueEnemy`), active | `heroes/hassan/abilities/TrueEnemy.mp3` | VFX_HASSAN_TRUE_ENEMY |
| Assassin Order (`hassanAssasinOrder`), phantasm | SFX_HASSAN_ORDER | VFX_HASSAN_ORDER |
| Commander (`vladPolkovodets`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |

## Kaladin Stormblessed (`kaladin`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| First Oath - The First Ideal (`kaladinFirst`), active | SFX_HEAL | VFX_KALADIN_FIRST |
| Second Oath - Oath of Protection (`kaladinSecond`), passive | SFX_TELEPORT, SFX_TRICKSTER_AOE | VFX_MOVEMENT_TRICKSTER, VFX_COMBAT_HIT_LIGHT |
| Third Oath - Oath of Acceptance (`kaladinThird`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Fourth Oath - Oath of Restriction (`kaladinFourth`), passive | SFX_AUTO_DEFENSE | VFX_BERSERKER_AUTO_DODGE |
| Fifth Oath - Oath of Liberation (`kaladinFifth`), phantasm | SFX_KALADIN_FIFTH | VFX_KALADIN_FIFTH_PREVIEW, VFX_KALADIN_FIFTH |

## Luche (`luche`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Long-lived (`lucheLongLived`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Radiance (`lucheShine`), passive | SFX_STATUS_APPLIED | VFX_LUCHE_RADIANCE |
| Falling Sun (`lucheBurningSun`), phantasm | SFX_LUCHE_SUN | VFX_LUCHE_FALLING_SUN |
| Light Ray (`lucheDivineRay`), impulse | SFX_LUCHE_RAY | VFX_LUCHE_RAY |
| Glory of the Sun (`lucheSunGlory`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |

## Kaneki (`kaneki`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Ghoul (`kanekiGhoul`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| RC Cells (`kanekiRcCells`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Rinkaku Kagune (`kanekiRinkakuKagune`), passive | SFX_MOVE | VFX_MOVEMENT_ASSASSIN |
| Regeneration (`kanekiRegeneration`), active | SFX_HEAL | VFX_KANEKI_REGEN |
| Centipede (`kanekiScolopendra`), phantasm | `heroes/kaneki/transformations/Scolopendra.mp3` | VFX_KANEKI_CENTIPEDE |

## Zoro (`zoro`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Cheated Death (`zoroCheatedDeath`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Santoryu (`zoro3SwordStyle`), passive | SFX_ATTACK, SFX_HIT, SFX_MISS | VFX_ZORO_SANTORYU |
| Oni Giri (`zoroOniGiri`), active | SFX_ZORO_ONI | VFX_ZORO_ONI_GIRI |
| Asura: Nine-Sword Style (`zoroAsura`), phantasm | SFX_ZORO_ASURA | VFX_ZORO_ASURA |
| Determination (`zoroDetermination`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |

## Don Quixote (`donKihote`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Hardy (`donKihoteHardy`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Knight of the Sorrowful Image (`donKihoteSorrowfulCountenance`), passive | SFX_FORCED_MOVE | VFX_DON_SORROW_MOVE |
| Attack on Windmills (`donKihoteWindmills`), active | SFX_DON_WINDMILLS | VFX_DON_WINDMILLS |
| Madness of the Knight (`donKihoteMadness`), phantasm | SFX_DON_MADNESS | VFX_DON_MADNESS |
| Commander (`vladPolkovodets`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |

## Jack the Ripper (`jackRipper`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Resilient (`jackRipperResilient`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Holy Mother of Slaughter (`jackRipperDismemberment`), phantasm | `heroes/jackRipper/phantasms/HolyMotherOfSlaughter.mp3` | VFX_JACK_SLAUGHTER |
| Covering Tracks (`jackRipperCoveringTracks`), passive | SFX_JACK_SNARE_EXPLODE | VFX_JACK_COVER_TRACKS |
| Maniac Traps (`jackRipperSnares`), impulse | SFX_JACK_SNARE_PLACE, SFX_JACK_SNARE_TRIGGER | VFX_JACK_SNARE_PLACE, VFX_JACK_SNARE_REVEAL_TRIGGER, VFX_JACK_SNARE_STATUS |
| Surgeon (`jackRipperSurgery`), passive | SFX_UI_PENDING | VFX_JACK_SURGERY |

## Artemis (`artemida`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| God (`artemidaGod`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Precise Arrow (`artemidaAccurateArrow`), passive | SFX_HIT | VFX_COMBAT_HIT_LIGHT |
| Moon Insight (`artemidaMoonlightShot`), impulse | SFX_ARTEMIS_REVEAL | VFX_ARTEMIS_MOON_PREVIEW, VFX_ARTEMIS_MOON_REVEAL |
| Silver Moon Sickle (`artemidaSilverCrescent`), phantasm | SFX_ARTEMIS_CRESCENT | VFX_ARTEMIS_CRESCENT |
| Natural Movement (`artemidaNatureMovement`), passive | SFX_TELEPORT | VFX_MOVEMENT_TRICKSTER |
| Stealth (`artemidaStealth`), passive | SFX_STEALTH_ENTER | VFX_STEALTH_ENTER |

## Frisk (`frisk`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Genocide (`friskGenocide`), phantasm | SFX_FRISK_PRECISION | VFX_FRISK_SUBSTITUTION, VFX_FRISK_KEEN_EYE, VFX_FRISK_PRECISION |
| One Path (`friskOnePath`), phantasm | SFX_FRISK_ONE_PATH | VFX_FRISK_ONE_PATH |
| Pacifism (`friskPacifism`), phantasm | SFX_FRISK_HUGS; friendship sub-option: `heroes/frisk/abilities/PowerOfFriendship.mp3` | VFX_FRISK_HUGS, VFX_FRISK_WARM_WORDS, VFX_FRISK_CRY, VFX_FRISK_FRIENDSHIP |
| Clean Soul (`friskCleanSoul`), passive | SFX_STEALTH_REVEAL, SFX_MISS | VFX_FRISK_CLEAN_SOUL |

## Sans (`sans`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Long-liver (`sansLongLiver`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Gaster Blaster (`sansGasterBlaster`), impulse | SFX_SANS_BLASTER_CHARGE, SFX_SANS_BLASTER_FIRE | VFX_SANS_GASTER_PREVIEW, VFX_SANS_GASTER_CANNON, VFX_SANS_GASTER_BEAM |
| Badass Joke (`sansBadassJoke`), active | SFX_SANS_JOKE | VFX_SANS_JOKE |
| Spearman Feature (`sansSpearmanFeature`), passive | SFX_AUTO_DEFENSE | VFX_SPEARMAN_DOUBLE_DODGE |
| Unbeliever Sans (`sansUnbeliever`), passive | SFX_AWAKEN | VFX_SANS_UNBELIEVER |
| Bone Field (`sansBoneField`), impulse | SFX_SANS_BONE_FIELD | VFX_SANS_BONE_FIELD |
| Sleep (`sansSleep`), active | SFX_HEAL | VFX_SANS_SLEEP |
| Last Attack (`sansLastAttack`), passive | SFX_SANS_CURSE_APPLY, SFX_SANS_CURSE_TICK, SFX_SANS_CURSE_END | VFX_SANS_LAST_PREDEATH, VFX_SANS_CURSE_APPLY, VFX_SANS_CURSE_STATUS, VFX_SANS_CURSE_TICK_END |

## Asgore Dreemurr (`asgore`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Fireball (`asgoreFireball`), active | SFX_ASGORE_FIREBALL_CAST, SFX_ASGORE_FIREBALL_IMPACT, SFX_ASGORE_FIREBALL_TRAVEL | VFX_ASGORE_FIREBALL |
| Fire Parade (`asgoreFireParade`), active | SFX_ASGORE_FIRE_PARADE | VFX_ASGORE_FIRE_PARADE_PREVIEW, VFX_ASGORE_FIRE_PARADE |
| Soul Parade (`asgoreSoulParade`), impulse | SFX_ASGORE_SOUL_PARADE | VFX_ASGORE_SOUL_PARADE |

## Undyne (`undyne`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Tough (`undyneTough`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Spearman Multiclass (`undyneSpearmanMulticlass`), passive | SFX_AUTO_DEFENSE | VFX_SPEARMAN_DOUBLE_DODGE |
| Throw Spear (`undyneSpearThrow`), active | `heroes/undyne/abilities/throw_spear.wav` | VFX_UNDYNE_THROW |
| Energy Spear (`undyneEnergySpear`), impulse | `heroes/undyne/abilities/energy_spear.wav` | VFX_UNDYNE_ENERGY_PREVIEW, VFX_UNDYNE_ENERGY |
| Direction Shift (`undyneSwitchDirection`), passive | SFX_FORCED_MOVE | VFX_UNDYNE_SHIFT |
| Immortal Undyne (`undyneUndying`), passive | SFX_UNDYNE_REVIVE | VFX_UNDYNE_UNDYING |

## Papyrus (`papyrus`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Blue Bone (`papyrusBlueBone`), passive | SFX_PAPYRUS_BLUE | VFX_PAPYRUS_BONES |
| Tasty Spaghetti (`papyrusSpaghetti`), active | SFX_HEAL | VFX_PAPYRUS_SPAGHETTI |
| Cool Guy (`papyrusCoolGuy`), impulse | SFX_PAPYRUS_LINE | VFX_PAPYRUS_LINE |
| Unbeliever Papyrus (`papyrusUnbeliever`), passive | SFX_AWAKEN | VFX_PAPYRUS_UNBELIEVER |
| Orange Bone (`papyrusOrangeBone`), passive | SFX_PAPYRUS_ORANGE | VFX_PAPYRUS_BONES |
| Long Bone (`papyrusLongBone`), passive | SFX_PAPYRUS_LINE | VFX_PAPYRUS_LINE |
| Ossified (`papyrusOssified`), passive | SFX_AUTO_DEFENSE | VFX_BERSERKER_AUTO_DODGE |

## Mettaton (`mettaton`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Long-liver (`mettatonLongLiver`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Rating (`mettatonRating`), passive | SFX_CHARGE_READY | VFX_METTATON_RATING |
| Laser (`mettatonLaser`), active | SFX_METTATON_LASER | VFX_METTATON_LASER |
| Mettaton Poppins (`mettatonPoppins`), active | SFX_METTATON_POPPINS | VFX_METTATON_POPPINS |
| Work on Camera (`mettatonWorkOnCamera`), passive | SFX_RIDER_MOVE | VFX_MOVEMENT_RIDER |
| Mettaton EX (`mettatonEx`), impulse | SFX_METTATON_EX | VFX_METTATON_EX |
| Stage Phenomenon (`mettatonStagePhenomenon`), passive | SFX_CHARGE_READY | VFX_METTATON_RATING |
| Mettaton NEO (`mettatonNeo`), impulse | SFX_METTATON_NEO | VFX_METTATON_NEO |
| Rider Feature (`mettatonRiderFeature`), passive | SFX_RIDER_MOVE, SFX_REACTION | VFX_MOVEMENT_RIDER, VFX_REACTION_ATTACK |
| Berserker Multiclass (`mettatonBerserkerMulticlass`), passive | SFX_AUTO_DEFENSE | VFX_BERSERKER_AUTO_DODGE |
| Grace (`mettatonGrace`), passive | SFX_CHARGE_READY | VFX_METTATON_RATING |
| Final Chord (`mettatonFinalChord`), phantasm | SFX_METTATON_FINAL | VFX_METTATON_FINAL_CHORD |

## River Person (`riverPerson`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Boat (`riverBoat`), active | SFX_RIVER_BOAT_LAUNCH, SFX_RIVER_BOAT_PICKUP, SFX_RIVER_BOAT_MOVE, SFX_RIVER_BOAT_DROP, SFX_RIVER_BOAT_STOP | VFX_RIVER_BOAT_START_PICKUP, VFX_RIVER_BOAT_TRAVEL, VFX_RIVER_BOAT_DROP, VFX_RIVER_STAKE_STOP, VFX_RIVER_PASSENGER_STAKE |
| Boatman (`riverBoatman`), active | SFX_RIVER_BOATMAN | VFX_RIVER_BOATMAN |
| Guide of Souls (`riverGuideOfSouls`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Tra-la-la (`riverTraLaLa`), phantasm | SFX_RIVER_TRALALA | VFX_RIVER_TRALALA |

## Duolingo (`duolingo`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Long-lived (`duolingoLongLived`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| I Reminded You!!! (`duolingoBerserker`), impulse | SFX_AWAKEN | VFX_DUOLINGO_BERSERKER |
| Push Notification (`duolingoPushNotification`), active | SFX_DUOLINGO_PUSH | VFX_DUOLINGO_PUSH |
| Missed Lessons (`duolingoSkipClasses`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Daily Streak (`duolingoStrick`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |

## Andrei Chikatilo (`chikatilo`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Tough (`chikatiloTough`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| False Trail (`chikatiloFalseTrail`), passive | `heroes/chikatilo/phantasms/FalseTrailExplosion.mp3` | VFX_CHIKATILO_FALSE_TRAIL |
| Killer's Mark (`chikatiloAssassinMark`), active | `heroes/chikatilo/abilities/KillerMark.mp3` | VFX_CHIKATILO_MARK |
| Decoy Stealth (`chikatiloDecoy`), active | `heroes/chikatilo/abilities/decoy.mp3` | VFX_CHIKATILO_DECOY |

## Ivan Grozny (`grozny`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Invade Time (`groznyInvadeTime`), active | SFX_GROZNY_INVADE | VFX_GROZNY_INVADE |
| Commander (`vladPolkovodets`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Tyrant (`groznyTyrant`), impulse | SFX_GROZNY_TYRANT | VFX_GROZNY_TYRANT |

## El Cid Compeador (`elCidCompeador`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Tisona (`elCidCompeadorTisona`), active | SFX_ELCID_TISONA | VFX_ELCID_TISONA |
| Commander (`vladPolkovodets`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Kolada (`elCidCompeadorKolada`), impulse | SFX_ELCID_KOLADA | VFX_ELCID_KOLADA |
| Demon Duelist (`elCidCompeadorDemonDuelist`), phantasm | SFX_ELCID_DUELIST | VFX_ELCID_DUEL |

## Lechy (`lechy`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Giant (`lechyGiant`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Natural Stealth (`lechyNaturalStealth`), passive | SFX_STEALTH_ENTER | VFX_STEALTH_ENTER |
| Guide Traveler (`lechyGuideTraveler`), active | `heroes/lechy/abilities/GuideTraveler.mp3.mpeg` | VFX_LECHY_GUIDE |
| Confuse Terrain (`lechyConfuseTerrain`), impulse | `heroes/lechy/abilities/ConfuseTerrain.mp3.mpeg` | VFX_LECHY_FOREST |
| Storm (`lechyStorm`), phantasm | `heroes/lechy/phantasms/StormSound1.mp3`, `heroes/lechy/phantasms/StormSound2.mp3` | VFX_LECHY_STORM |

## Vlad III Tepes (`vladTepes`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Commander (`vladPolkovodets`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Intimidating Stare (`vladIntimidate`), passive | SFX_VLAD_STARE | VFX_VLAD_GAZE |
| Field of Stakes (`vladStakes`), impulse | SFX_VLAD_STAKE_PLACE, SFX_VLAD_STAKE_TRIGGER | VFX_VLAD_STAKES_PLACE, VFX_VLAD_STAKE_TRIGGER, VFX_VLAD_STAKE_MARKER |
| Forest of the Dead (`vladForest`), impulse | SFX_VLAD_FOREST | VFX_VLAD_FOREST_PREVIEW, VFX_VLAD_FOREST_ERUPTION |

## Genghis Khan (`genghisKhan`)

| Ability / type | Sound available | VFX available |
| --- | --- | --- |
| Khan's Decree (`genghisKhanKhansDecree`), active | SFX_GENGHIS_DECREE | VFX_GENGHIS_DECREE |
| Mongol Charge (`genghisKhanMongolCharge`), phantasm | SFX_GENGHIS_CHARGE | VFX_GENGHIS_CHARGE |
| Commander (`vladPolkovodets`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |
| Legend of the Steppes (`genghisKhanLegendOfTheSteppes`), passive | No separate source needed: stat/resource/passive modifier; shared combat/UI feedback. | No separate bitmap needed: existing stats/resources/status UI and shared combat presentation. |

## Legacy-only sound concepts counted in coverage

The 14 source concepts are Dora, Engineering Miracle, True Enemy, Dismemberment, Scolopendra, Guide Traveler, Confuse Terrain, Storm onset (two candidates for one concept), Spear Throw, Energy Spear, Killer's Mark, Decoy, False Trail detonation, and Frisk's Friendship sub-option. Full original paths are in ASSET_INDEX.md. These remain reuse candidates pending listening; no replacements are commissioned solely for old sample format or filename spelling.

## Important phase and information checks

- Kaiser: Bunker entry/exit sources, Dora existing firing + shared confirmed hit, 3x3 Dora impact pair, 5x5 Carpet launch/impact and pair, Engineering legacy transformation + paired strip. Targeting stays owner/local CSS; Kaiser is public in Bunker. No separate warning bitmap is missing.
- Vlad: hidden stake placement/marker OWNER ONLY; actual stake trigger PUBLIC AFTER REVEAL, stop/damage follows committed results. Forest consumes nine oldest stakes then resolves clipped 3x3, with two 30-frame strips. Both layers are complete; transparent endpoints are fades. Stare uses unique audio/strip and shared forced movement.
- Sans: Last Attack pre-death choice is owner UI; apply, persistent curse, tick and expiration sources exist. Cannon charge strip plus two 20-frame beam layers exist. Beam geometry is entire authorized ray to board edge; allies do not stop it. Death waits until target selection resolves.
- Asgore: Fireball cast/travel/impact variants plus strip; Fire Parade cast and two 29-frame strips, clipped 5x5 around source, excluding caster as target. Confirmed impacts can reuse Fireball impacts/shared hit without commissioning an extra near-identical sound. Soul Parade uses its own reveal and strip with existing per-outcome status/heal UI.
- Jack: private placement and existing owner snare marker; public trigger and entangle status; Covering Tracks impact sound variants and paired strips; Dismemberment legacy source and paired Slaughter strips. Surgery reports HP privately; existing owner text/UI and a shared local alert are sufficient.
- Hassan: stealth uses shared private enter/reveal. Assassin Order selection/grant stays OWNER ONLY. True Enemy uses existing sound and dedicated strip; only actual authorized forced attack gets public combat feedback.
- Genghis: Decree and Mongol Charge activation sources and strips exist; reached path uses rider movement, actual reaction uses shared attack/hit. Pause for ATTACK/PASS and resume after resolution. Commander/Legend modifiers need no continuous aura or loop.
- River Person: Boat launch/pickup/movement variants/drop/interruption and Boatman grant audio exist; start/pickup, reached travel and drop strips exist. Interrupted movement uses shared stop strip and revealed hazard, not an unvisited destination. Tralala has dedicated audio/pair. Reaction opportunity uses existing owner ATTACK/PASS UI and shared local decision alert; no redundant bitmap.

## Generic feedback

| Feedback | Available source(s) |
| --- | --- |
| Hit / damage / death | SFX_HIT, SFX_DEATH; light/heavy contact strips, UNIT_DEATH; existing HP/death DOM/CSS |
| Miss / dodge / defense | SFX_MISS / AUTO_DEFENSE; miss/dodge/block/spearman/berserker strips; no extra dodge sound required |
| Attack and defense rolls | Shared SFX_DICE_ROLL variants; existing roll UI |
| Movement / teleport | Shared move/rider/heavy/forced/teleport sounds; class movement strips and existing token motion |
| Stealth enter / exit / reveal / Search | Shared private enter and authorized reveal/Search sounds; shared enter/reveal strip and Search cast |
| Trap and hazard trigger | Signature Vlad/Jack sounds/strips; use these for real game hazards, no unused generic trap source required |
| Invalid action / click / ready / reaction | Existing pack UI sounds; existing local UI, charge counters and reaction prompt |
| Battle start / victory / defeat / draw | Existing pack result sounds and current result DOM/UI; no extra screen effect bitmap required |

## Non-raster requests from the previous VFX specification

These 30 concepts requested NONE for raster delivery. Some suggested presentation hooks remain future work; that is an implementation gap, not a missing generated asset.

- `VFX_TARGETING_SHARED` — Thin cell-edge strokes and distinct center/source/danger markings remain lower intensity than resolution. Reuse current Board.tsx previewKinds and previewLines for attack targeting, all AoE signatures, movement and transport selections.…
- `VFX_COMBAT_PREPARE` — A 0.12-second inward readiness notch followed by the existing 275ms token lunge. No particles while merely hovering or waiting for dice.
- `VFX_DAMAGE_FEEDBACK` — Existing 260ms unit damage shake/flash plus 150ms bar-width transition and one floating value. Coalesce repeated representations of the same hit; never print private HP or hidden target losses.
- `VFX_MOVEMENT_NORMAL` — Reuse low-opacity existing movementTrail dots and brief destination pulse. Knight/spearman/archer one-step moves remain calm; ordinary movement has no blast.
- `VFX_MOVEMENT_FORCED` — Restrained push streak with destination contact ring; board cell remains explicit. No invented attack or extra damage.
- `VFX_LAST_KNOWN` — Keep current question marker; thin interrupted outline expresses uncertainty. No link, directional animation or tracking from remembered cell to secret current position.
- `VFX_REACTION_OPPORTUNITY` — Small neutral ring breathes around currently deciding ally. Keep ATTACK/PASS readable. No projectile, attack lunge or damage before ATTACK. Opponent sees only waiting presentation.
- `VFX_REACTION_ATTACK` — ATTACK reuses COMBAT_PREPARE/LAUNCH plus hit/miss. PASS only fades pending ring; reactionMovementResumed permits trail continuation after entire attack/defense/pre-death chain.
- `VFX_DICE_ROLL` — Optional two compact rotating die outlines beside dice label until response. No fabricated result and no 3D screen takeover; do not show another player's private roll.
- `VFX_DICE_RESULT` — A brief paired rim glint for isDouble; auto-hit only with confirmed class/ability rule (Warrior/Odin/Artemis), auto-dodge only with confirmed defense. Dice alone never override hit result.
- `VFX_TURN_ACTIVE` — Keep thin amber bar and fate-turn breathing highlight. One 0.25s start pulse. autoEndTurn is not an event type: observe actual activeUnitId change.
- `VFX_GAME_FLOW` — Thin gold sweep on initiative winner; one calm battle-start underline. Victory: few gold flecks inside result panel; defeat: dim burgundy seal; draw: neutral split seal. Never hide board.
- `VFX_ABILITY_READY` — Single sharp corner glint on newly ready ability, quiet after 0.25s. No threshold explosion; counter increase is not proof ability was cast.
- `VFX_RULE_DECLARATION` — Reuse area telegraph, relocation, small buff/lock and damage primitives for active Court/Moon/Chess effects. Use existing UI for global restrictions; public zone can pulse but never secretly affected units.
- `VFX_KAISER_DORA_PREVIEW` — Keep nine cell outlines and restrained artillery crosshair, clear center, low amber/graphite pulse. Valid centers can be orthogonal/diagonal; enemy blocker rules remain legal-target driven.
- `VFX_KAISER_CARPET_PREVIEW` — Five narrow amber comb rows show bombardment order while all affected cell edges stay visible. No preview on a hovered hypothetical center for this automatic random-center impulse.
- `VFX_JEBE_HAIL_PREVIEW` — Thin bronze bracket corners and arrowhead direction ticks. Low-intensity preparation distinct from falling arrow impact.
- `VFX_KALADIN_FIFTH_PREVIEW` — Fine teal segmented lattice highlights all affected cell edges; no ambiguous circle drawn over square mechanics.
- `VFX_JACK_SNARE_STATUS` — Keep current SVG rope/metal SnaredOverlay and trap marker; low intermittent edge glint, no new wire blast every update.
- `VFX_JACK_SURGERY` — A small silver scalpel-shaped underline glints under newly learned remaining HP; use existing numeric UI. No world label revealing HP to opponent.
- `VFX_ARTEMIS_MOON_PREVIEW` — Thin silver crescent corners show reveal area; no hidden unit outlines before actual reveal.
- `VFX_SANS_GASTER_PREVIEW` — Thin cold-cyan rail with segmented cell ticks, no opaque beam. Allies do not terminate geometry; attack targets are enemy-only.
- `VFX_SANS_LAST_PREDEATH` — One dim broken spectral orbit hangs around pending-death source; owner selects living enemy. No curse beam fired at hover target; no death fade before choice.
- `VFX_ASGORE_FIRE_PARADE_PREVIEW` — Thin royal-gold flame-rib corner strokes on affected cell borders; center stays open. This is source-centered, not a chosen distant Fireball center.
- `VFX_UNDYNE_ENERGY_PREVIEW` — Keep distinct cell-edge arrowheads along full9-cell line, not just source-to-clicked point. No diagonal geometry.
- `VFX_METTATON_RATING` — Small magenta-white corner sparkle on rating counter; existing floating delta can stay once per cause. Threshold sparkle does not itself transform before turn-start unlock.
- `VFX_RIVER_STAKE_STOP` — Wake cuts at hazard, small wave cap tips upward, shared VLAD_STAKE_TRIGGER erupts. Stop first, resolve actual damage, then softly mark legal new adjacent drop options for owner.
- `VFX_RIVER_PASSENGER_STAKE` — Small disembark ring completes; stake then erupts with real1 damage; reveal passenger only if actual stealthRevealed. Landing is not a second path halt, no damage-before-landing.
- `VFX_RIVER_BOATMAN` — A small twin-wave glyph glints beside carrier and move counter; grants one extra movement, not a new summon or autonomous move.
- `VFX_VLAD_FOREST_PREVIEW` — Low black-red cell-edge pulse with hairline ground cracks; target border remains unambiguous. Automatic trigger at turn start with 9 stakes; do not light up their former hidden positions for enemy.
