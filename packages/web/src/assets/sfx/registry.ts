import type * as Rules from "rules";

export type SoundCategory = "ui" | "gameplay";
export interface SoundDefinition {
  sources: readonly string[];
  category: SoundCategory;
  gain: number;
  preload: "core" | "lazy";
  maxVoices: number;
}

/** Static URLs keep Vite's asset graph explicit; only this core slice is bundled. */
export const SOUND_REGISTRY = {
  "common.status.ready": {
    sources: [new URL("./common/ui/chargeReady.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.2,
    preload: "core",
    maxVoices: 1,
  },
  "common.status.heal": {
    sources: [new URL("./common/status/heal.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.3,
    preload: "core",
    maxVoices: 1,
  },
  "common.status.bonePunish": {
    sources: [
      new URL("./common/status/bonePunish01.wav", import.meta.url).href,
      new URL("./common/status/bonePunish02.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.3,
    preload: "lazy",
    maxVoices: 1,
  },
  "common.status.stealthEnter": {
    sources: [new URL("./common/status/stealthEnter.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.3,
    preload: "core",
    maxVoices: 1,
  },
  "hero.jackRipper.abilities.jackRipperSnares.place": {
    sources: [
      new URL("./heroes/jackRipper/abilities/jackRipperSnaresPlace01.wav", import.meta.url).href,
      new URL("./heroes/jackRipper/abilities/jackRipperSnaresPlace02.wav", import.meta.url).href,
      new URL("./heroes/jackRipper/abilities/jackRipperSnaresPlace03.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.jackRipper.abilities.jackRipperSnares.trigger": {
    sources: [
      new URL("./heroes/jackRipper/abilities/jackRipperSnaresTrigger01.wav", import.meta.url).href,
      new URL("./heroes/jackRipper/abilities/jackRipperSnaresTrigger02.wav", import.meta.url).href,
      new URL("./heroes/jackRipper/abilities/jackRipperSnaresTrigger03.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.jackRipper.abilities.jackRipperCoveringTracks": {
    sources: [
      new URL(
        "./heroes/jackRipper/abilities/jackRipperCoveringTracksExplode01.wav",
        import.meta.url,
      ).href,
      new URL(
        "./heroes/jackRipper/abilities/jackRipperCoveringTracksExplode02.wav",
        import.meta.url,
      ).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.jackRipper.phantasms.jackRipperDismemberment": {
    sources: [
      new URL("./heroes/jackRipper/phantasms/HolyMotherOfSlaughter.mp3", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.hassan.phantasms.hassanAssasinOrder": {
    sources: [
      new URL("./heroes/hassan/phantasms/hassanAssasinOrderGrant.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.hassan.abilities.hassanTrueEnemy": {
    sources: [new URL("./heroes/hassan/abilities/TrueEnemy.mp3", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.genghisKhan.abilities.genghisKhanKhansDecree": {
    sources: [
      new URL("./heroes/genghisKhan/abilities/genghisKhanKhansDecreeActivate.wav", import.meta.url)
        .href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.genghisKhan.phantasms.genghisKhanMongolCharge": {
    sources: [
      new URL("./heroes/genghisKhan/phantasms/genghisKhanMongolChargeActivate.wav", import.meta.url)
        .href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.chikatilo.abilities.chikatiloAssassinMark": {
    sources: [new URL("./heroes/chikatilo/abilities/KillerMark.mp3", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.chikatilo.abilities.chikatiloDecoy": {
    sources: [new URL("./heroes/chikatilo/abilities/decoy.mp3", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.chikatilo.phantasms.falseTrailExplosion": {
    sources: [
      new URL("./heroes/chikatilo/phantasms/FalseTrailExplosion.mp3", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.papyrus.abilities.papyrusBlueBone": {
    sources: [new URL("./heroes/papyrus/abilities/papyrusBlueBoneApply.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.papyrus.abilities.papyrusOrangeBone": {
    sources: [
      new URL("./heroes/papyrus/abilities/papyrusOrangeBoneApply.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.papyrus.abilities.papyrusCoolGuy": {
    sources: [new URL("./heroes/papyrus/abilities/papyrusCoolGuyFire.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.lechy.abilities.lechyGuideTraveler": {
    sources: [new URL("./heroes/lechy/abilities/GuideTraveler.mp3.mpeg", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.lechy.abilities.lechyConfuseTerrain": {
    sources: [new URL("./heroes/lechy/abilities/ConfuseTerrain.mp3.mpeg", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.lechy.phantasms.lechyStorm": {
    sources: [new URL("./heroes/lechy/phantasms/StormSound1.mp3", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.guts.abilities.gutsArbalet": {
    sources: [new URL("./heroes/guts/abilities/gutsArbaletFire.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.guts.abilities.gutsCannon": {
    sources: [new URL("./heroes/guts/abilities/gutsCannonFire.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.guts.phantasms.gutsBerserkMode": {
    sources: [new URL("./heroes/guts/phantasms/gutsBerserkModeActivate.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.guts.abilities.gutsExitBerserk": {
    sources: [new URL("./heroes/guts/abilities/gutsExitBerserkRelease.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.griffith.transformations.griffithFemtoRebirth": {
    sources: [
      new URL(
        "./heroes/griffith/transformations/griffithFemtoRebirthTransform.wav",
        import.meta.url,
      ).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.odin.abilities.odinSleipnir": {
    sources: [new URL("./heroes/odin/abilities/odinSleipnirTeleport.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.elCidCompeador.abilities.elCidCompeadorTisona": {
    sources: [
      new URL("./heroes/elCidCompeador/abilities/elCidCompeadorTisonaSweep.wav", import.meta.url)
        .href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.elCidCompeador.abilities.elCidCompeadorKolada": {
    sources: [
      new URL("./heroes/elCidCompeador/abilities/elCidCompeadorKoladaSweep.wav", import.meta.url)
        .href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.elCidCompeador.phantasms.elCidCompeadorDemonDuelist": {
    sources: [
      new URL(
        "./heroes/elCidCompeador/phantasms/elCidCompeadorDemonDuelistActivate.wav",
        import.meta.url,
      ).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.jebe.abilities.jebeHailOfArrows": {
    sources: [new URL("./heroes/jebe/abilities/jebeHailOfArrowsFire.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.jebe.phantasms.jebeKhansShooter": {
    sources: [new URL("./heroes/jebe/phantasms/jebeKhansShooterFire01.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.kaladin.phantasms.kaladinFifth": {
    sources: [new URL("./heroes/kaladin/phantasms/kaladinFifthCast.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.loki.abilities.lokiControl": {
    sources: [new URL("./heroes/loki/abilities/mindcontrol.mp3", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.loki.phantasms.lokiChicken": {
    sources: [new URL("./heroes/loki/phantasms/lokiLaughtChicken.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.loki.phantasms.lokiEntangle": {
    sources: [new URL("./heroes/loki/phantasms/lokiLaughtEntangle.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.frisk.phantasms.friskHugs": {
    sources: [new URL("./heroes/frisk/phantasms/friskPacifismHugs.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.grozny.abilities.groznyInvadeTime": {
    sources: [
      new URL("./heroes/grozny/abilities/groznyInvadeTimeTeleport.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.grozny.abilities.groznyTyrant": {
    sources: [new URL("./heroes/grozny/abilities/groznyTyrantActivate.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.undyne.abilities.undyneSpearThrow": {
    sources: [new URL("./heroes/undyne/abilities/throw_spear.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.undyne.abilities.undyneEnergySpear": {
    sources: [new URL("./heroes/undyne/abilities/energy_spear.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.undyne.abilities.undyneUndying": {
    sources: [new URL("./heroes/undyne/abilities/undyneUndyingRevive.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.duolingo.abilities.duolingoPushNotification": {
    sources: [
      new URL("./heroes/duolingo/abilities/duolingoPushNotificationTeleport.wav", import.meta.url)
        .href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.zoro.abilities.zoroOniGiri": {
    sources: [new URL("./heroes/zoro/abilities/zoroOniGiriDash.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.zoro.phantasms.zoroAsura": {
    sources: [new URL("./heroes/zoro/phantasms/zoroAsuraCast.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.donKihote.abilities.donKihoteWindmills": {
    sources: [
      new URL("./heroes/donKihote/abilities/donKihoteWindmillsDash.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.donKihote.phantasms.donKihoteMadness": {
    sources: [
      new URL("./heroes/donKihote/phantasms/donKihoteMadnessFinalAttack.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.artemida.abilities.artemidaMoonlightShot": {
    sources: [
      new URL("./heroes/artemida/abilities/artemidaMoonlightShotScan.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.artemida.phantasms.artemidaSilverCrescent": {
    sources: [
      new URL("./heroes/artemida/phantasms/artemidaSilverCrescentFire.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.luche.abilities.lucheDivineRay": {
    sources: [new URL("./heroes/luche/abilities/lucheDivineRayFire.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.luche.phantasms.lucheBurningSun": {
    sources: [new URL("./heroes/luche/phantasms/lucheBurningSunCast.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.mettaton.transformations.mettatonEx": {
    sources: [
      new URL("./heroes/mettaton/transformations/mettatonExTransform.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.mettaton.transformations.mettatonNeo": {
    sources: [
      new URL("./heroes/mettaton/transformations/mettatonNeoTransform.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.mettaton.abilities.mettatonPoppins": {
    sources: [new URL("./heroes/mettaton/abilities/mettatonPoppinsFire.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.mettaton.abilities.mettatonLaser": {
    sources: [new URL("./heroes/mettaton/abilities/mettatonLaserFire.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.mettaton.phantasms.mettatonFinalChord": {
    sources: [
      new URL("./heroes/mettaton/phantasms/mettatonFinalChordFire.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.grand-kaiser.transformations.kaiserEngineeringMiracle": {
    sources: [
      new URL("./heroes/grand-kaiser/transformations/EngineeringMiracle.mp3", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.sans.abilities.sansBadassJoke": {
    sources: [new URL("./heroes/sans/abilities/sansBadassJokeCast.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.sans.abilities.sansBoneField": {
    sources: [new URL("./heroes/sans/abilities/sansBoneFieldActivate.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },

  "hero.riverPerson.abilities.riverBoat.launch": {
    sources: [new URL("./heroes/riverPerson/abilities/riverBoatLaunch.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.45,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.riverPerson.abilities.riverBoat.pickup": {
    sources: [new URL("./heroes/riverPerson/abilities/riverBoatPickup.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.45,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.riverPerson.abilities.riverBoat.move": {
    sources: [
      new URL("./heroes/riverPerson/abilities/riverBoatMove01.wav", import.meta.url).href,
      new URL("./heroes/riverPerson/abilities/riverBoatMove02.wav", import.meta.url).href,
      new URL("./heroes/riverPerson/abilities/riverBoatMove03.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.3,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.riverPerson.abilities.riverBoat.disembark": {
    sources: [
      new URL("./heroes/riverPerson/abilities/riverBoatDisembark.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.45,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.riverPerson.abilities.riverBoat.interrupted": {
    sources: [
      new URL("./heroes/riverPerson/abilities/riverBoatInterrupted.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.riverPerson.abilities.riverBoatman": {
    sources: [
      new URL("./heroes/riverPerson/abilities/riverBoatmanGrant.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.4,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.riverPerson.phantasms.riverTraLaLa": {
    sources: [
      new URL("./heroes/riverPerson/phantasms/riverTraLaLaActivate.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.5,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.riverPerson.basic.death": {
    sources: [new URL("./heroes/riverPerson/basic/died.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.5,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.asgore.abilities.asgoreFireball.cast": {
    sources: [new URL("./heroes/asgore/abilities/asgoreFireballCast.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.5,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.asgore.abilities.asgoreFireball.travel": {
    sources: [new URL("./heroes/asgore/abilities/asgoreFireballTravel.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.35,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.asgore.abilities.asgoreFireball.impact": {
    sources: [
      new URL("./heroes/asgore/abilities/asgoreFireballImpact01.wav", import.meta.url).href,
      new URL("./heroes/asgore/abilities/asgoreFireballImpact02.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.6,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.asgore.abilities.asgoreFireParade.cast": {
    sources: [new URL("./heroes/asgore/abilities/asgoreFireParadeCast.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.5,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.asgore.abilities.asgoreSoulParade.reveal": {
    sources: [
      new URL("./heroes/asgore/abilities/asgoreSoulParadeReveal.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.45,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.sans.abilities.sansGasterBlaster.charge": {
    sources: [new URL("./heroes/sans/abilities/sansGasterBlasterCharge.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.5,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.sans.abilities.sansGasterBlaster.fire": {
    sources: [new URL("./heroes/sans/abilities/sansGasterBlasterFire.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.6,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.sans.abilities.sansLastAttack.apply": {
    sources: [new URL("./heroes/sans/abilities/sansLastAttackApply.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.5,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.sans.abilities.sansLastAttack.tick": {
    sources: [
      new URL("./heroes/sans/abilities/sansLastAttackTick01.wav", import.meta.url).href,
      new URL("./heroes/sans/abilities/sansLastAttackTick02.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.35,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.sans.abilities.sansLastAttack.remove": {
    sources: [new URL("./heroes/sans/abilities/sansLastAttackExpire.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.3,
    preload: "lazy",
    maxVoices: 1,
  },
  "common.ui.buttonClick": {
    sources: [
      new URL("./common/ui/buttonClick01.wav", import.meta.url).href,
      new URL("./common/ui/buttonClick02.wav", import.meta.url).href,
      new URL("./common/ui/buttonClick03.wav", import.meta.url).href,
    ],
    category: "ui",
    gain: 0.4,
    preload: "core",
    maxVoices: 2,
  },
  "common.ui.actionInvalid": {
    sources: [new URL("./common/ui/actionInvalid.wav", import.meta.url).href],
    category: "ui",
    gain: 0.4,
    preload: "core",
    maxVoices: 1,
  },
  "common.combat.diceRoll": {
    sources: [
      new URL("./common/combat/diceRoll01.wav", import.meta.url).href,
      new URL("./common/combat/diceRoll02.wav", import.meta.url).href,
      new URL("./common/combat/diceRoll03.wav", import.meta.url).href,
      new URL("./common/combat/diceRoll04.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.55,
    preload: "core",
    maxVoices: 2,
  },
  "common.combat.hit": {
    sources: [
      new URL("./common/combat/hit01.wav", import.meta.url).href,
      new URL("./common/combat/hit02.wav", import.meta.url).href,
      new URL("./common/combat/hit03.wav", import.meta.url).href,
      new URL("./common/combat/hit04.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.6,
    preload: "core",
    maxVoices: 4,
  },
  "common.combat.miss": {
    sources: [
      new URL("./common/combat/miss01.wav", import.meta.url).href,
      new URL("./common/combat/miss02.wav", import.meta.url).href,
      new URL("./common/combat/miss03.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.5,
    preload: "core",
    maxVoices: 3,
  },
  "common.combat.death": {
    sources: [
      new URL("./common/combat/death01.wav", import.meta.url).href,
      new URL("./common/combat/death02.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.6,
    preload: "core",
    maxVoices: 2,
  },
  "hero.grand-kaiser.abilities.kaiserDora": {
    sources: [new URL("./heroes/grand-kaiser/abilities/Dora.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.65,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.grand-kaiser.abilities.kaiserCarpetStrike.launch": {
    sources: [
      new URL("./heroes/grand-kaiser/abilities/kaiserCarpetStrikeLaunch.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.5,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.grand-kaiser.abilities.kaiserCarpetStrike.impact": {
    sources: [
      new URL("./heroes/grand-kaiser/abilities/kaiserCarpetStrikeImpact.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.65,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.grand-kaiser.statuses.bunker.enter": {
    sources: [
      new URL("./heroes/grand-kaiser/abilities/kaiserBunkerEnter.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.5,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.grand-kaiser.statuses.bunker.exit": {
    sources: [
      new URL("./heroes/grand-kaiser/abilities/kaiserBunkerExit.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.45,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.vladTepes.abilities.vladStakes.place": {
    sources: [
      new URL("./heroes/vladTepes/abilities/vladStakesPlace01.wav", import.meta.url).href,
      new URL("./heroes/vladTepes/abilities/vladStakesPlace02.wav", import.meta.url).href,
      new URL("./heroes/vladTepes/abilities/vladStakesPlace03.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.5,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.vladTepes.abilities.vladForest.impact": {
    sources: [new URL("./heroes/vladTepes/abilities/vladForestCast.wav", import.meta.url).href],
    category: "gameplay",
    gain: 0.6,
    preload: "lazy",
    maxVoices: 1,
  },
  "hero.vladTepes.abilities.intimidatingStare": {
    sources: [
      new URL("./heroes/vladTepes/abilities/vladIntimidateActivate.wav", import.meta.url).href,
    ],
    category: "gameplay",
    gain: 0.5,
    preload: "lazy",
    maxVoices: 1,
  },
} as const satisfies Record<string, SoundDefinition>;

export type SoundKey = keyof typeof SOUND_REGISTRY;

type RulesHeroId =
  | typeof Rules.HERO_ARTEMIDA_ID
  | typeof Rules.HERO_ASGORE_ID
  | typeof Rules.HERO_CHIKATILO_ID
  | typeof Rules.HERO_DON_KIHOTE_ID
  | typeof Rules.HERO_DUOLINGO_ID
  | typeof Rules.HERO_EL_CID_COMPEADOR_ID
  | typeof Rules.HERO_FEMTO_ID
  | typeof Rules.HERO_FRISK_ID
  | typeof Rules.HERO_GENGHIS_KHAN_ID
  | typeof Rules.HERO_GRAND_KAISER_ID
  | typeof Rules.HERO_GRIFFITH_ID
  | typeof Rules.HERO_GROZNY_ID
  | typeof Rules.HERO_GUTS_ID
  | typeof Rules.HERO_HASSAN_ID
  | typeof Rules.HERO_JACK_RIPPER_ID
  | typeof Rules.HERO_JEBE_ID
  | typeof Rules.HERO_KALADIN_ID
  | typeof Rules.HERO_KANEKI_ID
  | typeof Rules.HERO_LECHY_ID
  | typeof Rules.HERO_LOKI_ID
  | typeof Rules.HERO_LUCHE_ID
  | typeof Rules.HERO_METTATON_ID
  | typeof Rules.HERO_ODIN_ID
  | typeof Rules.HERO_PAPYRUS_ID
  | typeof Rules.HERO_RIVER_PERSON_ID
  | typeof Rules.HERO_SANS_ID
  | typeof Rules.HERO_UNDYNE_ID
  | typeof Rules.HERO_VLAD_TEPES_ID
  | typeof Rules.HERO_ZORO_ID;

/**
 * Hero IDs that may own SFX. Values come from the rules package so paths and
 * registry keys cannot silently drift from gameplay IDs.
 */
export const HERO_SFX_IDS = [
  "grand-kaiser",
  "vladTepes",
  "elCidCompeador",
  "genghisKhan",
  "hassan",
  "loki",
  "chikatilo",
  "papyrus",
  "sans",
  "jackRipper",
  "luche",
  "kaneki",
  "zoro",
  "duolingo",
  "donKihote",
  "artemida",
  "guts",
  "griffith",
  "kaladin",
  "odin",
  "frisk",
  "asgore",
  "riverPerson",
  "jebe",
  "grozny",
  "lechy",
  "femto",
  "undyne",
  "mettaton",
] as const satisfies readonly RulesHeroId[];

export type HeroId = (typeof HERO_SFX_IDS)[number];
export type BasicSfxKey = "attack" | "hit" | "death" | "move";
export type HeroSfxCategory = "basic" | "abilities" | "phantasms" | "transformations" | "statuses";
export type CommonSfxCategory = "ui" | "combat" | "movement" | "status";

export type SfxKey =
  | `common.${CommonSfxCategory}.${string}`
  | `hero.${HeroId}.${HeroSfxCategory}.${string}`;

export type HeroSfxMap = {
  basic?: Partial<Record<BasicSfxKey, string>>;
  abilities?: Record<string, string>;
  phantasms?: Record<string, string>;
  transformations?: Record<string, string>;
  statuses?: Record<string, string>;
};

export type HeroSfxRegistry = Partial<Record<HeroId, HeroSfxMap>>;
export type CommonSfxRegistry = Partial<Record<CommonSfxCategory, Record<string, string>>>;

/**
 * Add explicit Vite imports above and register only files that exist.
 *
 * Example:
 * import lokiLaughSfx from "./heroes/loki/phantasms/lokiLaught.mp3";
 * export const heroSfx = {
 *   loki: { phantasms: { lokiLaught: lokiLaughSfx } },
 * } satisfies HeroSfxRegistry;
 */
export const heroSfx: HeroSfxRegistry = {};

/**
 * Legacy optional string resolver scaffolding. Phase 5 live playback uses the
 * closed SOUND_REGISTRY above; hero mappings remain unpopulated for later work.
 */
export const commonSfx: CommonSfxRegistry = {};

const heroIdSet: ReadonlySet<string> = new Set(HERO_SFX_IDS);

export function isHeroId(value: string | undefined): value is HeroId {
  return typeof value === "string" && heroIdSet.has(value);
}
