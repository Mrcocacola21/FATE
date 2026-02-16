import type { UnitClass } from "rules";

// Keep in sync with packages/rules for UI-only helpers.
export const TRICKSTER_AOE_ID = "tricksterAoE";
export const TRICKSTER_AOE_RADIUS = 2;
export const FOREST_AURA_RADIUS = 2;
export const ARENA_STORM_ID = "storm";
export const KAISER_DORA_ID = "kaiserDora";
export const VLAD_TEPES_ID = "vladTepes";
export const EL_CID_COMPEADOR_ID = "elCidCompeador";
export const GENGHIS_KHAN_ID = "genghisKhan";
export const GROZNY_ID = "grozny";
export const CHIKATILO_ID = "chikatilo";
export const FALSE_TRAIL_TOKEN_ID = "falseTrailToken";
export const LECHY_ID = "lechy";
export const JEBE_ID = "jebe";
export const HASSAN_ID = "hassan";
export const FRISK_ID = "frisk";
export const ASGORE_ID = "asgore";
export const KALADIN_ID = "kaladin";
export const ODIN_ID = "odin";
export const RIVER_PERSON_ID = "riverPerson";
export const LOKI_ID = "loki";
export const GUTS_ID = "guts";
export const GRIFFITH_ID = "griffith";
export const FEMTO_ID = "femto";
export const EL_CID_TISONA_ID = "elCidCompeadorTisona";
export const EL_CID_KOLADA_ID = "elCidCompeadorKolada";
export const EL_CID_DEMON_DUELIST_ID = "elCidCompeadorDemonDuelist";
export const GROZNY_INVADE_TIME_ID = "groznyInvadeTime";
export const GROZNY_TYRANT_ID = "groznyTyrant";
export const CHIKATILO_ASSASSIN_MARK_ID = "chikatiloAssassinMark";
export const CHIKATILO_DECOY_ID = "chikatiloDecoy";
export const FALSE_TRAIL_EXPLOSION_ID = "falseTrailExplosion";
export const LECHY_GUIDE_TRAVELER_ID = "lechyGuideTraveler";
export const LECHY_CONFUSE_TERRAIN_ID = "lechyConfuseTerrain";
export const LECHY_STORM_ID = "lechyStorm";
export const JEBE_HAIL_OF_ARROWS_ID = "jebeHailOfArrows";
export const JEBE_KHANS_SHOOTER_ID = "jebeKhansShooter";
export const HASSAN_TRUE_ENEMY_ID = "hassanTrueEnemy";
export const HASSAN_ASSASSIN_ORDER_ID = "hassanAssasinOrder";
export const KALADIN_FIRST_ID = "kaladinFirst";
export const KALADIN_FIFTH_ID = "kaladinFifth";
export const ODIN_SLEIPNIR_ID = "odinSleipnir";
export const ODIN_MUNINN_ID = "odinMuninn";
export const LOKI_LAUGHT_ID = "lokiLaught";
export const LOKI_ILLUSORY_DOUBLE_ID = "lokiIllusoryDouble";
export const FRISK_PACIFISM_ID = "friskPacifism";
export const FRISK_GENOCIDE_ID = "friskGenocide";
export const FRISK_CLEAN_SOUL_ID = "friskCleanSoul";
export const FRISK_ONE_PATH_ID = "friskOnePath";
export const ASGORE_FIREBALL_ID = "asgoreFireball";
export const ASGORE_FIRE_PARADE_ID = "asgoreFireParade";
export const ASGORE_SOUL_PARADE_ID = "asgoreSoulParade";
export const GUTS_ARBALET_ID = "gutsArbalet";
export const GUTS_CANNON_ID = "gutsCannon";
export const GUTS_BERSERK_MODE_ID = "gutsBerserkMode";
export const GUTS_EXIT_BERSERK_ID = "gutsExitBerserk";
export const FEMTO_DIVINE_MOVE_ID = "femtoDivineMove";
export const RIVER_PERSON_BOATMAN_ID = "riverBoatman";
export const RIVER_PERSON_TRA_LA_LA_ID = "riverTraLaLa";

const MAX_HP_BY_CLASS: Record<UnitClass, number> = {
  spearman: 5,
  rider: 6,
  knight: 6,
  archer: 5,
  trickster: 4,
  assassin: 4,
  berserker: 8,
};

export function getMaxHp(unitClass: UnitClass, heroId?: string): number {
  let base = MAX_HP_BY_CLASS[unitClass] ?? 1;
  if (heroId === VLAD_TEPES_ID) {
    base += 2;
  }
  if (heroId === EL_CID_COMPEADOR_ID) {
    base += 2;
  }
  if (heroId === GENGHIS_KHAN_ID) {
    base = 7;
  }
  if (heroId === GROZNY_ID) {
    base += 3;
  }
  if (heroId === CHIKATILO_ID) {
    base += 1;
  }
  if (heroId === LECHY_ID) {
    base += 3;
  }
  if (heroId === JEBE_ID) {
    base += 1;
  }
  if (heroId === HASSAN_ID) {
    base += 1;
  }
  if (heroId === FRISK_ID) {
    base += 1;
  }
  if (heroId === ASGORE_ID) {
    base += 3;
  }
  if (heroId === KALADIN_ID) {
    base += 1;
  }
  if (heroId === ODIN_ID) {
    base += 5;
  }
  if (heroId === RIVER_PERSON_ID) {
    base += 1;
  }
  if (heroId === LOKI_ID) {
    base += 5;
  }
  if (heroId === GUTS_ID) {
    base += 2;
  }
  if (heroId === FEMTO_ID) {
    base = MAX_HP_BY_CLASS.berserker + 5;
  }
  return base;
}
