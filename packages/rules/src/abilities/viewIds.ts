import type { UnitState } from "../model";
import {
  HERO_ASGORE_ID,
  HERO_CHIKATILO_ID,
  HERO_EL_CID_COMPEADOR_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_FEMTO_ID,
  HERO_FRISK_ID,
  HERO_GENGHIS_KHAN_ID,
  HERO_GRIFFITH_ID,
  HERO_GROZNY_ID,
  HERO_GRAND_KAISER_ID,
  HERO_GUTS_ID,
  HERO_HASSAN_ID,
  HERO_JEBE_ID,
  HERO_KALADIN_ID,
  HERO_LECHY_ID,
  HERO_LOKI_ID,
  HERO_METTATON_ID,
  HERO_ODIN_ID,
  HERO_PAPYRUS_ID,
  HERO_RIVER_PERSON_ID,
  HERO_SANS_ID,
  HERO_UNDYNE_ID,
} from "../heroes";
import {
  hasMettatonBerserkerFeature,
  hasMettatonExUnlocked,
  hasMettatonNeoUnlocked,
} from "../mettaton";
import { hasSansUnbelieverUnlocked } from "../sans";
import * as ids from "./constants";
import { appendLegacyHeroAbilityIds } from "./viewIdsExtras";

export function collectAbilityIdsForUnit(unit: UnitState): string[] {
  const abilityIds: string[] = [];

  if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) {
    abilityIds.push(ids.ABILITY_FALSE_TRAIL_EXPLOSION, ids.ABILITY_FALSE_TRAIL_TRAP);
  }

  if (
    unit.class === "berserker" ||
    (unit.heroId === HERO_GRAND_KAISER_ID && unit.transformed) ||
    unit.heroId === HERO_FEMTO_ID ||
    (unit.heroId === HERO_PAPYRUS_ID && unit.papyrusUnbelieverActive) ||
    hasMettatonBerserkerFeature(unit)
  ) {
    abilityIds.push(ids.ABILITY_BERSERK_AUTO_DEFENSE);
  }
  if (unit.class === "trickster" || unit.heroId === HERO_KALADIN_ID) {
    abilityIds.push(ids.ABILITY_TRICKSTER_AOE);
  }
  if (unit.heroId === HERO_GRAND_KAISER_ID) {
    abilityIds.push(
      ids.ABILITY_KAISER_BUNKER,
      ids.ABILITY_KAISER_DORA,
      ids.ABILITY_KAISER_CARPET_STRIKE,
      ids.ABILITY_KAISER_ENGINEERING_MIRACLE
    );
  }
  if (unit.heroId === HERO_GENGHIS_KHAN_ID) {
    abilityIds.push(
      ids.ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES,
      ids.ABILITY_VLAD_POLKOVODETS,
      ids.ABILITY_GENGHIS_KHAN_KHANS_DECREE,
      ids.ABILITY_GENGHIS_KHAN_MONGOL_CHARGE
    );
  }
  if (unit.heroId === HERO_EL_CID_COMPEADOR_ID) {
    abilityIds.push(
      ids.ABILITY_VLAD_POLKOVODETS,
      ids.ABILITY_EL_SID_COMPEADOR_TISONA,
      ids.ABILITY_EL_SID_COMPEADOR_KOLADA,
      ids.ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST
    );
  }
  if (unit.heroId === HERO_CHIKATILO_ID) {
    abilityIds.push(
      ids.ABILITY_CHIKATILO_TOUGH,
      ids.ABILITY_CHIKATILO_FALSE_TRAIL,
      ids.ABILITY_CHIKATILO_ASSASSIN_MARK,
      ids.ABILITY_CHIKATILO_DECOY
    );
  }
  if (unit.heroId === HERO_GROZNY_ID) {
    abilityIds.push(
      ids.ABILITY_GROZNY_INVADE_TIME,
      ids.ABILITY_GROZNY_TYRANT,
      ids.ABILITY_VLAD_POLKOVODETS
    );
  }
  if (unit.heroId === HERO_LECHY_ID) {
    abilityIds.push(
      ids.ABILITY_LECHY_GIANT,
      ids.ABILITY_LECHY_NATURAL_STEALTH,
      ids.ABILITY_LECHY_GUIDE_TRAVELER,
      ids.ABILITY_LECHY_CONFUSE_TERRAIN,
      ids.ABILITY_LECHY_STORM
    );
  }
  if (unit.heroId === HERO_GRIFFITH_ID) {
    abilityIds.push(
      ids.ABILITY_GRIFFITH_WRETCHED_MAN,
      ids.ABILITY_VLAD_POLKOVODETS,
      ids.ABILITY_GRIFFITH_FEMTO_REBIRTH
    );
  }
  if (unit.heroId === HERO_FEMTO_ID) {
    abilityIds.push(
      ids.ABILITY_FEMTO_GOD_HP,
      ids.ABILITY_FEMTO_MULTI_BERSERK_SPEAR,
      ids.ABILITY_FEMTO_DIVINE_MOVE
    );
  }
  if (unit.heroId === HERO_GUTS_ID) {
    if (!unit.gutsBerserkModeActive && !unit.gutsBerserkExitUsed) {
      abilityIds.push(ids.ABILITY_GUTS_BERSERK_MODE);
    }
    abilityIds.push(ids.ABILITY_GUTS_CANNON, ids.ABILITY_GUTS_ARBALET);
    if (unit.gutsBerserkModeActive && !unit.gutsBerserkExitUsed) {
      abilityIds.push(ids.ABILITY_GUTS_EXIT_BERSERK);
    }
  }
  if (unit.heroId === HERO_ODIN_ID) {
    abilityIds.push(
      ids.ABILITY_ODIN_SLEIPNIR,
      ids.ABILITY_ODIN_MUNINN,
      ids.ABILITY_ODIN_HUGINN,
      ids.ABILITY_ODIN_GUNGNIR
    );
  }
  if (unit.heroId === HERO_LOKI_ID) {
    abilityIds.push(ids.ABILITY_LOKI_LAUGHT, ids.ABILITY_LOKI_ILLUSORY_DOUBLE);
  }
  if (unit.heroId === HERO_JEBE_ID) {
    abilityIds.push(
      ids.ABILITY_JEBE_DURABLE,
      ids.ABILITY_JEBE_KHANS_SHOOTER,
      ids.ABILITY_JEBE_HAIL_OF_ARROWS,
      ids.ABILITY_GENGHIS_KHAN_LEGEND_OF_THE_STEPPES,
      ids.ABILITY_VLAD_POLKOVODETS
    );
  }
  if (unit.heroId === HERO_HASSAN_ID) {
    abilityIds.push(
      ids.ABILITY_HASSAN_ONE_WITH_SAND,
      ids.ABILITY_HASSAN_TRUE_ENEMY,
      ids.ABILITY_HASSAN_ASSASIN_ORDER,
      ids.ABILITY_VLAD_POLKOVODETS
    );
  }
  if (unit.heroId === HERO_KALADIN_ID) {
    abilityIds.push(
      ids.ABILITY_KALADIN_FIRST,
      ids.ABILITY_KALADIN_SECOND,
      ids.ABILITY_KALADIN_THIRD,
      ids.ABILITY_KALADIN_FOURTH,
      ids.ABILITY_KALADIN_FIFTH
    );
  }
  if (unit.heroId === HERO_FRISK_ID) {
    abilityIds.push(
      ids.ABILITY_FRISK_CLEAN_SOUL,
      ids.ABILITY_FRISK_GENOCIDE,
      ids.ABILITY_FRISK_PACIFISM,
      ids.ABILITY_FRISK_ONE_PATH
    );
  }
  if (unit.heroId === HERO_SANS_ID) {
    abilityIds.push(
      ids.ABILITY_SANS_LONG_LIVER,
      ids.ABILITY_SANS_GASTER_BLASTER,
      ids.ABILITY_SANS_BADASS_JOKE,
      ids.ABILITY_SANS_SPEARMAN_FEATURE,
      ids.ABILITY_SANS_UNBELIEVER
    );
    if (hasSansUnbelieverUnlocked(unit)) {
      abilityIds.push(
        ids.ABILITY_SANS_BONE_FIELD,
        ids.ABILITY_SANS_SLEEP,
        ids.ABILITY_SANS_LAST_ATTACK
      );
    }
  }
  if (unit.heroId === HERO_ASGORE_ID) {
    abilityIds.push(
      ids.ABILITY_ASGORE_FIREBALL,
      ids.ABILITY_ASGORE_FIRE_PARADE,
      ids.ABILITY_ASGORE_SOUL_PARADE
    );
  }
  if (unit.heroId === HERO_UNDYNE_ID) {
    abilityIds.push(
      ids.ABILITY_UNDYNE_TOUGH,
      ids.ABILITY_UNDYNE_SPEARMAN_MULTICLASS,
      ids.ABILITY_UNDYNE_SPEAR_THROW,
      ids.ABILITY_UNDYNE_ENERGY_SPEAR,
      ids.ABILITY_UNDYNE_SWITCH_DIRECTION,
      ids.ABILITY_UNDYNE_UNDYING
    );
  }
  if (unit.heroId === HERO_PAPYRUS_ID) {
    abilityIds.push(
      ids.ABILITY_PAPYRUS_BLUE_BONE,
      ids.ABILITY_PAPYRUS_SPAGHETTI,
      ids.ABILITY_PAPYRUS_COOL_GUY,
      ids.ABILITY_PAPYRUS_UNBELIEVER
    );
    if (unit.papyrusUnbelieverActive) {
      abilityIds.push(
        ids.ABILITY_PAPYRUS_ORANGE_BONE,
        ids.ABILITY_PAPYRUS_LONG_BONE,
        ids.ABILITY_PAPYRUS_OSSIFIED
      );
    }
  }
  if (unit.heroId === HERO_METTATON_ID) {
    abilityIds.push(
      ids.ABILITY_METTATON_LONG_LIVER,
      ids.ABILITY_METTATON_RATING,
      ids.ABILITY_METTATON_POPPINS,
      ids.ABILITY_METTATON_WORK_ON_CAMERA,
      ids.ABILITY_METTATON_EX,
      ids.ABILITY_METTATON_NEO,
      ids.ABILITY_METTATON_FINAL_CHORD
    );
    if (hasMettatonExUnlocked(unit)) {
      abilityIds.push(ids.ABILITY_METTATON_STAGE_PHENOMENON, ids.ABILITY_METTATON_LASER);
    }
    if (hasMettatonNeoUnlocked(unit)) {
      abilityIds.push(
        ids.ABILITY_METTATON_RIDER_FEATURE,
        ids.ABILITY_METTATON_BERSERKER_MULTICLASS,
        ids.ABILITY_METTATON_GRACE
      );
    }
  }
  if (unit.heroId === HERO_RIVER_PERSON_ID) {
    abilityIds.push(
      ids.ABILITY_RIVER_PERSON_BOAT,
      ids.ABILITY_RIVER_PERSON_BOATMAN,
      ids.ABILITY_RIVER_PERSON_GUIDE_OF_SOULS,
      ids.ABILITY_RIVER_PERSON_TRA_LA_LA
    );
  }
  appendLegacyHeroAbilityIds(unit, abilityIds);

  return abilityIds;
}
