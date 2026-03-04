import type { ApplyResult, GameState, UnitState } from "../../model";
import type { RNG } from "../../rng";
import {
  ABILITY_ASGORE_FIRE_PARADE,
  ABILITY_ASGORE_FIREBALL,
  ABILITY_ASGORE_SOUL_PARADE,
  ABILITY_CHIKATILO_ASSASSIN_MARK,
  ABILITY_CHIKATILO_DECOY,
  ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
  ABILITY_EL_SID_COMPEADOR_KOLADA,
  ABILITY_EL_SID_COMPEADOR_TISONA,
  ABILITY_FEMTO_DIVINE_MOVE,
  ABILITY_FALSE_TRAIL_EXPLOSION,
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  ABILITY_GENGHIS_KHAN_KHANS_DECREE,
  ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
  ABILITY_GROZNY_INVADE_TIME,
  ABILITY_GUTS_ARBALET,
  ABILITY_GUTS_BERSERK_MODE,
  ABILITY_GUTS_CANNON,
  ABILITY_GUTS_EXIT_BERSERK,
  ABILITY_HASSAN_TRUE_ENEMY,
  ABILITY_JEBE_HAIL_OF_ARROWS,
  ABILITY_JEBE_KHANS_SHOOTER,
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_KAISER_DORA,
  ABILITY_KAISER_ENGINEERING_MIRACLE,
  ABILITY_KALADIN_FIFTH,
  ABILITY_KALADIN_FIRST,
  ABILITY_LECHY_CONFUSE_TERRAIN,
  ABILITY_LECHY_GUIDE_TRAVELER,
  ABILITY_LECHY_STORM,
  ABILITY_LOKI_LAUGHT,
  ABILITY_METTATON_EX,
  ABILITY_METTATON_FINAL_CHORD,
  ABILITY_METTATON_LASER,
  ABILITY_METTATON_NEO,
  ABILITY_METTATON_POPPINS,
  ABILITY_ODIN_SLEIPNIR,
  ABILITY_PAPYRUS_COOL_GUY,
  ABILITY_PAPYRUS_LONG_BONE,
  ABILITY_PAPYRUS_ORANGE_BONE,
  ABILITY_PAPYRUS_SPAGHETTI,
  ABILITY_RIVER_PERSON_BOATMAN,
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  ABILITY_SANS_BADASS_JOKE,
  ABILITY_SANS_BONE_FIELD,
  ABILITY_SANS_GASTER_BLASTER,
  ABILITY_SANS_SLEEP,
  ABILITY_UNDYNE_ENERGY_SPEAR,
  ABILITY_UNDYNE_SPEAR_THROW,
} from "../../abilities";
import { applyAsgoreFireball, applyAsgoreFireParade } from "../heroes/asgore";
import {
  applyChikatiloAssassinMark,
  applyChikatiloDecoyStealth,
  applyFalseTrailExplosion,
} from "../heroes/chikatilo";
import { applyElCidDemonDuelist, applyElCidTisona } from "../heroes/elCid";
import { applyFemtoDivineMove } from "../heroes/griffith";
import { applyFriskGenocide, applyFriskPacifism } from "../heroes/frisk";
import { applyKhansDecree, applyMongolCharge } from "../heroes/genghisKhan";
import { applyGroznyInvadeTime } from "../heroes/grozny";
import {
  applyGutsArbalet,
  applyGutsBerserkMode,
  applyGutsCannon,
  applyGutsExitBerserk,
} from "../heroes/guts";
import { applyHassanTrueEnemy } from "../heroes/hassan";
import { applyJebeHailOfArrows, applyJebeKhansShooter } from "../heroes/jebe";
import { applyKaiserDora } from "../heroes/kaiser";
import { applyKaladinFifth, applyKaladinFirst } from "../heroes/kaladin";
import { applyLechyGuideTraveler, applyLechyStorm } from "../heroes/lechy";
import { applyLokiLaught } from "../heroes/loki";
import {
  applyMettatonEx,
  applyMettatonFinalChord,
  applyMettatonLaser,
  applyMettatonNeo,
  applyMettatonPoppins,
} from "../heroes/mettaton";
import { applyOdinSleipnir } from "../heroes/odin";
import {
  applyPapyrusCoolGuy,
  applyPapyrusLongBoneToggle,
  applyPapyrusOrangeBoneToggle,
  applyPapyrusSpaghetti,
} from "../heroes/papyrus";
import { applyRiverBoatman, applyRiverTraLaLa } from "../heroes/riverPerson";
import {
  applySansBadassJoke,
  applySansBoneField,
  applySansGasterBlaster,
  applySansSleep,
} from "../heroes/sans";
import { applyUndyneEnergySpear, applyUndyneSpearThrow } from "../heroes/undyne";
import type { UseAbilityAction } from "./types";

type DirectAbilityHandler = (
  state: GameState,
  unit: UnitState,
  action: UseAbilityAction,
  rng: RNG
) => ApplyResult;

const NO_OP_RESULT = (state: GameState): ApplyResult => ({ state, events: [] });

const DIRECT_HANDLERS: Record<string, DirectAbilityHandler> = {
  [ABILITY_KAISER_DORA]: (state, unit, action, rng) =>
    applyKaiserDora(state, unit, action, rng),
  [ABILITY_KAISER_ENGINEERING_MIRACLE]: (state) => NO_OP_RESULT(state),
  [ABILITY_KAISER_CARPET_STRIKE]: (state) => NO_OP_RESULT(state),
  [ABILITY_EL_SID_COMPEADOR_TISONA]: (state, unit, action, rng) =>
    applyElCidTisona(state, unit, action, rng),
  [ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST]: (state, unit, action) =>
    applyElCidDemonDuelist(state, unit, action),
  [ABILITY_EL_SID_COMPEADOR_KOLADA]: (state) => NO_OP_RESULT(state),
  [ABILITY_GENGHIS_KHAN_KHANS_DECREE]: (state, unit) =>
    applyKhansDecree(state, unit),
  [ABILITY_GENGHIS_KHAN_MONGOL_CHARGE]: (state, unit) =>
    applyMongolCharge(state, unit),
  [ABILITY_CHIKATILO_ASSASSIN_MARK]: (state, unit, action) =>
    applyChikatiloAssassinMark(state, unit, action),
  [ABILITY_CHIKATILO_DECOY]: (state, unit) => applyChikatiloDecoyStealth(state, unit),
  [ABILITY_FALSE_TRAIL_EXPLOSION]: (state, unit) => applyFalseTrailExplosion(state, unit),
  [ABILITY_LECHY_GUIDE_TRAVELER]: (state, unit, action) =>
    applyLechyGuideTraveler(state, unit, action),
  [ABILITY_LECHY_CONFUSE_TERRAIN]: (state) => NO_OP_RESULT(state),
  [ABILITY_LECHY_STORM]: (state, unit) => applyLechyStorm(state, unit),
  [ABILITY_GROZNY_INVADE_TIME]: (state, unit, action, rng) =>
    applyGroznyInvadeTime(state, unit, action, rng),
  [ABILITY_JEBE_HAIL_OF_ARROWS]: (state, unit, action, rng) =>
    applyJebeHailOfArrows(state, unit, action, rng),
  [ABILITY_JEBE_KHANS_SHOOTER]: (state, unit, action) =>
    applyJebeKhansShooter(state, unit, action),
  [ABILITY_HASSAN_TRUE_ENEMY]: (state, unit, action) =>
    applyHassanTrueEnemy(state, unit, action),
  [ABILITY_LOKI_LAUGHT]: (state, unit) => applyLokiLaught(state, unit),
  [ABILITY_FRISK_PACIFISM]: (state, unit) => applyFriskPacifism(state, unit),
  [ABILITY_FRISK_GENOCIDE]: (state, unit) => applyFriskGenocide(state, unit),
  [ABILITY_ASGORE_FIREBALL]: (state, unit, action) =>
    applyAsgoreFireball(state, unit, action),
  [ABILITY_ASGORE_FIRE_PARADE]: (state, unit, _action, rng) =>
    applyAsgoreFireParade(state, unit, rng),
  [ABILITY_ASGORE_SOUL_PARADE]: (state) => NO_OP_RESULT(state),
  [ABILITY_ODIN_SLEIPNIR]: (state, unit, action) => applyOdinSleipnir(state, unit, action),
  [ABILITY_RIVER_PERSON_BOATMAN]: (state, unit) => applyRiverBoatman(state, unit),
  [ABILITY_RIVER_PERSON_TRA_LA_LA]: (state, unit) => applyRiverTraLaLa(state, unit),
  [ABILITY_KALADIN_FIRST]: (state, unit) => applyKaladinFirst(state, unit),
  [ABILITY_KALADIN_FIFTH]: (state, unit, action, rng) =>
    applyKaladinFifth(state, unit, action, rng),
  [ABILITY_GUTS_ARBALET]: (state, unit, action) => applyGutsArbalet(state, unit, action),
  [ABILITY_GUTS_CANNON]: (state, unit, action) => applyGutsCannon(state, unit, action),
  [ABILITY_GUTS_BERSERK_MODE]: (state, unit) => applyGutsBerserkMode(state, unit),
  [ABILITY_GUTS_EXIT_BERSERK]: (state, unit) => applyGutsExitBerserk(state, unit),
  [ABILITY_FEMTO_DIVINE_MOVE]: (state, unit) => applyFemtoDivineMove(state, unit),
  [ABILITY_PAPYRUS_SPAGHETTI]: (state, unit) => applyPapyrusSpaghetti(state, unit),
  [ABILITY_PAPYRUS_COOL_GUY]: (state, unit, action) =>
    applyPapyrusCoolGuy(state, unit, action),
  [ABILITY_PAPYRUS_ORANGE_BONE]: (state, unit, action) =>
    applyPapyrusOrangeBoneToggle(state, unit, action),
  [ABILITY_PAPYRUS_LONG_BONE]: (state, unit, action) =>
    applyPapyrusLongBoneToggle(state, unit, action),
  [ABILITY_METTATON_POPPINS]: (state, unit, action, rng) =>
    applyMettatonPoppins(state, unit, action, rng),
  [ABILITY_METTATON_LASER]: (state, unit, action) => applyMettatonLaser(state, unit, action),
  [ABILITY_METTATON_EX]: (state, unit) => applyMettatonEx(state, unit),
  [ABILITY_METTATON_NEO]: (state, unit) => applyMettatonNeo(state, unit),
  [ABILITY_METTATON_FINAL_CHORD]: (state, unit) => applyMettatonFinalChord(state, unit),
  [ABILITY_SANS_GASTER_BLASTER]: (state, unit, action) =>
    applySansGasterBlaster(state, unit, action),
  [ABILITY_SANS_BADASS_JOKE]: (state, unit, _action, rng) =>
    applySansBadassJoke(state, unit, rng),
  [ABILITY_SANS_BONE_FIELD]: (state, unit, _action, rng) =>
    applySansBoneField(state, unit, rng),
  [ABILITY_SANS_SLEEP]: (state, unit) => applySansSleep(state, unit),
  [ABILITY_UNDYNE_SPEAR_THROW]: (state, unit, action) =>
    applyUndyneSpearThrow(state, unit, action),
  [ABILITY_UNDYNE_ENERGY_SPEAR]: (state, unit, action) =>
    applyUndyneEnergySpear(state, unit, action),
};

export function tryApplyDirectAbility(
  state: GameState,
  unit: UnitState,
  action: UseAbilityAction,
  rng: RNG,
  abilityId: string
): ApplyResult | null {
  const handler = DIRECT_HANDLERS[abilityId];
  return handler ? handler(state, unit, action, rng) : null;
}
