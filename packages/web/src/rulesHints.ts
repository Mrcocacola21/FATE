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
  return base;
}
