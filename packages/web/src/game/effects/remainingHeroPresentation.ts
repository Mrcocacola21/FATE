import type { PlayerView, ProjectedGameEvent } from "rules";
import type { SoundKey } from "../../assets/sfx/registry";
import type { VfxEffectId } from "../../features/vfx/vfxTypes";

type Signature = { vfx: VfxEffectId; sfx?: SoundKey };

/** Committed source accents. Costs/legality remain entirely in rules. */
export const REMAINING_CASTS: Record<string, Signature> = {
  jackRipperDismemberment: {
    vfx: "statusSmall",
    sfx: "hero.jackRipper.phantasms.jackRipperDismemberment",
  },
  hassanAssasinOrder: { vfx: "hassanOrder", sfx: "hero.hassan.phantasms.hassanAssasinOrder" },
  hassanTrueEnemy: { vfx: "hassanControl", sfx: "hero.hassan.abilities.hassanTrueEnemy" },
  genghisKhanKhansDecree: {
    vfx: "genghisDecree",
    sfx: "hero.genghisKhan.abilities.genghisKhanKhansDecree",
  },
  genghisKhanMongolCharge: {
    vfx: "genghisDecree",
    sfx: "hero.genghisKhan.phantasms.genghisKhanMongolCharge",
  },
  chikatiloDecoy: { vfx: "chikatiloDecoy", sfx: "hero.chikatilo.abilities.chikatiloDecoy" },
  elCidCompeadorTisona: {
    vfx: "statusSmall",
    sfx: "hero.elCidCompeador.abilities.elCidCompeadorTisona",
  },
  elCidCompeadorDemonDuelist: {
    vfx: "shield",
    sfx: "hero.elCidCompeador.phantasms.elCidCompeadorDemonDuelist",
  },
  gutsArbalet: { vfx: "muzzle", sfx: "hero.guts.abilities.gutsArbalet" },
  gutsCannon: { vfx: "muzzle", sfx: "hero.guts.abilities.gutsCannon" },
  gutsBerserkMode: { vfx: "gutsBerserk", sfx: "hero.guts.phantasms.gutsBerserkMode" },
  gutsExitBerserk: { vfx: "gutsExit", sfx: "hero.guts.abilities.gutsExitBerserk" },
  groznyInvadeTime: { vfx: "groznyInvade", sfx: "hero.grozny.abilities.groznyInvadeTime" },
  groznyTyrant: { vfx: "groznyTyrant", sfx: "hero.grozny.abilities.groznyTyrant" },
  odinSleipnir: { vfx: "odinSleipnir", sfx: "hero.odin.abilities.odinSleipnir" },
  odinMuninn: { vfx: "odinMuninn" },
  femtoDivineMove: { vfx: "femtoMove" },
  jebeKhansShooter: { vfx: "statusSmall", sfx: "hero.jebe.phantasms.jebeKhansShooter" },
  kaladinFirst: { vfx: "kaladinHeal" },
  kanekiRegeneration: { vfx: "kanekiRegen" },
  papyrusSpaghetti: { vfx: "papyrusSpaghetti" },
  lechyGuideTraveler: { vfx: "lechyGuide", sfx: "hero.lechy.abilities.lechyGuideTraveler" },
  lechyConfuseTerrain: { vfx: "lechyForest", sfx: "hero.lechy.abilities.lechyConfuseTerrain" },
  duolingoPushNotification: {
    vfx: "duolingoPush",
    sfx: "hero.duolingo.abilities.duolingoPushNotification",
  },
  zoroOniGiri: { vfx: "statusSmall", sfx: "hero.zoro.abilities.zoroOniGiri" },
  donKihoteWindmills: { vfx: "statusSmall", sfx: "hero.donKihote.abilities.donKihoteWindmills" },
  donKihoteSorrowfulCountenance: { vfx: "donSorrow" },
  undyneSpearThrow: { vfx: "statusSmall", sfx: "hero.undyne.abilities.undyneSpearThrow" },
  undyneUndying: { vfx: "undyneUndying", sfx: "hero.undyne.abilities.undyneUndying" },
  lucheShine: { vfx: "lucheRadiance" },
  kaiserEngineeringMiracle: {
    vfx: "kaiserEngineering",
    sfx: "hero.grand-kaiser.transformations.kaiserEngineeringMiracle",
  },
  sansSleep: { vfx: "sansSleep" },
};

/** Square areas use confirmed center/radius. Sparse/line abilities receive a
 * compact origin accent: their aggregate radius is not a hit footprint. */
export const REMAINING_AREAS: Record<string, Signature & { square: boolean }> = {
  jackRipperCoveringTracks: {
    vfx: "jackCoverTracks",
    sfx: "hero.jackRipper.abilities.jackRipperCoveringTracks",
    square: true,
  },
  falseTrailExplosion: {
    vfx: "falseTrailBlast",
    sfx: "hero.chikatilo.phantasms.falseTrailExplosion",
    square: true,
  },
  elCidCompeadorKolada: {
    vfx: "statusSmall",
    sfx: "hero.elCidCompeador.abilities.elCidCompeadorKolada",
    square: true,
  },
  jebeHailOfArrows: { vfx: "jebeHail", sfx: "hero.jebe.abilities.jebeHailOfArrows", square: true },
  kaladinFifth: { vfx: "kaladinFifth", sfx: "hero.kaladin.phantasms.kaladinFifth", square: true },
  papyrusCoolGuy: {
    vfx: "statusSmall",
    sfx: "hero.papyrus.abilities.papyrusCoolGuy",
    square: false,
  },
  undyneEnergySpear: {
    vfx: "statusSmall",
    sfx: "hero.undyne.abilities.undyneEnergySpear",
    square: false,
  },
  zoroAsura: { vfx: "zoroAsura", sfx: "hero.zoro.phantasms.zoroAsura", square: true },
  artemidaMoonlightShot: {
    vfx: "artemidaReveal",
    sfx: "hero.artemida.abilities.artemidaMoonlightShot",
    square: true,
  },
  artemidaSilverCrescent: {
    vfx: "statusSmall",
    sfx: "hero.artemida.phantasms.artemidaSilverCrescent",
    square: false,
  },
  lucheDivineRay: { vfx: "statusSmall", sfx: "hero.luche.abilities.lucheDivineRay", square: false },
  lucheBurningSun: {
    vfx: "statusSmall",
    sfx: "hero.luche.phantasms.lucheBurningSun",
    square: false,
  },
  mettatonPoppins: {
    vfx: "mettatonPoppins",
    sfx: "hero.mettaton.abilities.mettatonPoppins",
    square: true,
  },
  mettatonLaser: {
    vfx: "statusSmall",
    sfx: "hero.mettaton.abilities.mettatonLaser",
    square: false,
  },
  mettatonFinalChord: {
    vfx: "statusSmall",
    sfx: "hero.mettaton.phantasms.mettatonFinalChord",
    square: false,
  },
  donKihoteMadness: {
    vfx: "statusSmall",
    sfx: "hero.donKihote.phantasms.donKihoteMadness",
    square: false,
  },
  lokiLaught: { vfx: "lokiEntangle", sfx: "hero.loki.phantasms.lokiEntangle", square: true },
  sansBadassJoke: { vfx: "sansJoke", sfx: "hero.sans.abilities.sansBadassJoke", square: true },
};

/** One signature accent on the first confirmed hit of this use. Further hits
 * retain their independent generic combat/HP cues. Missing identity stays generic. */
export const REMAINING_HIT_ACCENTS: Record<string, VfxEffectId> = {
  jackRipperDismemberment: "jackSlaughter",
  gutsArbalet: "gutsCrossbow",
  gutsCannon: "gutsCannon",
  undyneSpearThrow: "undyneThrow",
  zoroOniGiri: "zoroOni",
};

export function remainingHitAccent(event: ProjectedGameEvent): VfxEffectId | undefined {
  return event.type === "attackResolved" && event.hit && event.abilityUseId && event.abilityId
    ? REMAINING_HIT_ACCENTS[event.abilityId]
    : undefined;
}

export function remainingStatusSignature(
  event: ProjectedGameEvent,
): (Signature & { unitId?: string; stage: string }) | null {
  switch (event.type) {
    case "chikatiloMarkApplied":
      return {
        vfx: "chikatiloMark",
        sfx: "hero.chikatilo.abilities.chikatiloAssassinMark",
        unitId: event.targetId,
        stage: "mark",
      };
    case "papyrusBoneApplied":
      return {
        vfx: "papyrusBones",
        sfx:
          event.boneType === "blue"
            ? "hero.papyrus.abilities.papyrusBlueBone"
            : "hero.papyrus.abilities.papyrusOrangeBone",
        unitId: event.targetId,
        stage: "boneApply",
      };
    case "papyrusUnbelieverActivated":
      return { vfx: "papyrusUnbeliever", unitId: event.papyrusId, stage: "unbeliever" };
    case "sansUnbelieverActivated":
      return { vfx: "sansUnbeliever", unitId: event.sansId, stage: "unbeliever" };
    case "sansBoneFieldActivated":
      return {
        vfx: "sansField",
        sfx: "hero.sans.abilities.sansBoneField",
        unitId: event.sansId,
        stage: "field",
      };
    case "lechyStormStarted":
      return {
        vfx: "lechyStorm",
        sfx: "hero.lechy.phantasms.lechyStorm",
        unitId: event.sourceUnitId,
        stage: "stormStart",
      };
    case "lechyStormRollResult":
      return { vfx: "storm", unitId: event.unitId, stage: "stormTick" };
    case "friskHugsApplied":
      return {
        vfx: "friskHugs",
        sfx: "hero.frisk.phantasms.friskHugs",
        unitId: event.targetId,
        stage: "hugs",
      };
    case "unitHealed":
      return event.sourceAbilityId === "friskPacifism"
        ? { vfx: "friskHeal", unitId: event.unitId, stage: "warmWords" }
        : null;
    case "lokiChickenApplied":
      return {
        vfx: "lokiChicken",
        sfx: "hero.loki.phantasms.lokiChicken",
        unitId: event.targetId,
        stage: "chicken",
      };
    case "controlledAttackDeclared":
      return event.abilityId === "lokiLaught"
        ? {
            vfx: "lokiControl",
            sfx: "hero.loki.abilities.lokiControl",
            unitId: event.controlledUnitId,
            stage: "control",
          }
        : null;
    case "unitTransformed":
      return event.reason === "griffithFemtoRebirth"
        ? {
            vfx: "griffithRebirth",
            sfx: "hero.griffith.transformations.griffithFemtoRebirth",
            unitId: event.unitId,
            stage: "rebirth",
          }
        : event.toFormId === "mettatonNeo" || event.toFormId === "mettatonEx"
          ? {
              vfx: event.toFormId === "mettatonNeo" ? "mettatonNeo" : "mettatonEx",
              sfx:
                event.toFormId === "mettatonNeo"
                  ? "hero.mettaton.transformations.mettatonNeo"
                  : "hero.mettaton.transformations.mettatonEx",
              unitId: event.unitId,
              stage: "transform",
            }
          : null;
    default:
      return null;
  }
}

/** Metadata drives readiness for every manually usable charged ability. */
export function chargeReadyAbilities(event: ProjectedGameEvent, view: PlayerView): string[] {
  if (event.type !== "chargesUpdated") return [];
  return (view.abilitiesByUnitId[event.unitId] ?? [])
    .filter((ability) => {
      if (ability.kind !== "active" && ability.kind !== "phantasm") return false;
      const required = ability.chargeRequired;
      const now = event.now[ability.id];
      const delta = event.deltas[ability.id] ?? 0;
      return (
        typeof required === "number" &&
        required > 0 &&
        typeof now === "number" &&
        delta > 0 &&
        now >= required &&
        now - delta < required
      );
    })
    .map((ability) => ability.id);
}
