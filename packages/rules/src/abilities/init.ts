import type { UnitState } from "../model";
import {
  HERO_ASGORE_ID,
  HERO_CHIKATILO_ID,
  HERO_EL_CID_COMPEADOR_ID,
  HERO_FRISK_ID,
  HERO_GENGHIS_KHAN_ID,
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
import * as ids from "./constants";
import { getAbilitySpec, setCharges } from "./charges";

export function initUnitAbilities(unit: UnitState): UnitState {
  let updated = { ...unit };

  if (unit.class === "berserker") {
    const spec = getAbilitySpec(ids.ABILITY_BERSERK_AUTO_DEFENSE)!;
    const startCharges =
      spec.startsFull || spec.startsCharged ? spec.maxCharges ?? 0 : 0;

    updated = setCharges(updated, spec.id, startCharges);
  }

  if (unit.heroId === HERO_GRAND_KAISER_ID) {
    updated = setCharges(updated, ids.ABILITY_KAISER_DORA, 0);
    updated = setCharges(updated, ids.ABILITY_KAISER_CARPET_STRIKE, 0);
    updated = setCharges(updated, ids.ABILITY_KAISER_ENGINEERING_MIRACLE, 0);
  }

  if (unit.heroId === HERO_EL_CID_COMPEADOR_ID) {
    updated = setCharges(updated, ids.ABILITY_EL_SID_COMPEADOR_TISONA, 0);
    updated = setCharges(updated, ids.ABILITY_EL_SID_COMPEADOR_KOLADA, 0);
    updated = setCharges(updated, ids.ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST, 0);
  }
  if (unit.heroId === HERO_GENGHIS_KHAN_ID) {
    updated = setCharges(updated, ids.ABILITY_GENGHIS_KHAN_KHANS_DECREE, 0);
    updated = setCharges(updated, ids.ABILITY_GENGHIS_KHAN_MONGOL_CHARGE, 0);
  }
  if (unit.heroId === HERO_CHIKATILO_ID) {
    updated = setCharges(updated, ids.ABILITY_CHIKATILO_DECOY, 0);
  }
  if (unit.heroId === HERO_GROZNY_ID) {
    updated = setCharges(updated, ids.ABILITY_GROZNY_INVADE_TIME, 0);
  }
  if (unit.heroId === HERO_LECHY_ID) {
    updated = setCharges(updated, ids.ABILITY_LECHY_GUIDE_TRAVELER, 0);
    updated = setCharges(updated, ids.ABILITY_LECHY_CONFUSE_TERRAIN, 0);
    updated = setCharges(updated, ids.ABILITY_LECHY_STORM, 0);
  }
  if (unit.heroId === HERO_GUTS_ID) {
    updated = setCharges(updated, ids.ABILITY_GUTS_CANNON, 0);
    updated = setCharges(updated, ids.ABILITY_GUTS_BERSERK_MODE, 0);
    updated = {
      ...updated,
      gutsBerserkModeActive: false,
      gutsBerserkExitUsed: false,
    };
  }
  if (unit.heroId === HERO_ODIN_ID) {
    updated = setCharges(updated, ids.ABILITY_ODIN_SLEIPNIR, 0);
    updated = setCharges(updated, ids.ABILITY_ODIN_MUNINN, 0);
  }
  if (unit.heroId === HERO_LOKI_ID) {
    updated = setCharges(updated, ids.ABILITY_LOKI_LAUGHT, 0);
    updated = {
      ...updated,
      stealthSuccessMinRoll: 5,
    };
  }
  if (unit.heroId === HERO_JEBE_ID) {
    updated = setCharges(updated, ids.ABILITY_JEBE_HAIL_OF_ARROWS, 0);
    updated = setCharges(updated, ids.ABILITY_JEBE_KHANS_SHOOTER, 0);
  }
  if (unit.heroId === HERO_HASSAN_ID) {
    updated = setCharges(updated, ids.ABILITY_HASSAN_TRUE_ENEMY, 0);
    updated = {
      ...updated,
      stealthSuccessMinRoll: 4,
    };
  }
  if (unit.heroId === HERO_KALADIN_ID) {
    updated = setCharges(updated, ids.ABILITY_KALADIN_FIRST, 0);
    updated = setCharges(updated, ids.ABILITY_KALADIN_FIFTH, 0);
  }
  if (unit.heroId === HERO_FRISK_ID) {
    updated = setCharges(updated, ids.ABILITY_FRISK_PACIFISM, 0);
    updated = setCharges(updated, ids.ABILITY_FRISK_GENOCIDE, 0);
    updated = {
      ...updated,
      friskPacifismDisabled: false,
      friskCleanSoulShield: false,
      friskDidAttackWhileStealthedSinceLastEnter: false,
      friskPrecisionStrikeReady: false,
      friskKillCount: 0,
    };
  }
  if (unit.heroId === HERO_SANS_ID) {
    updated = setCharges(updated, ids.ABILITY_SANS_GASTER_BLASTER, 0);
    updated = setCharges(updated, ids.ABILITY_SANS_BADASS_JOKE, 0);
    updated = {
      ...updated,
      sansUnbelieverUnlocked: false,
      sansMoveLockArmed: false,
      sansMoveLockSourceId: undefined,
      sansBoneFieldStatus: undefined,
      sansLastAttackCurseSourceId: undefined,
    };
  }
  if (unit.heroId === HERO_ASGORE_ID) {
    updated = setCharges(updated, ids.ABILITY_ASGORE_FIREBALL, 0);
    updated = setCharges(updated, ids.ABILITY_ASGORE_FIRE_PARADE, 0);
    updated = setCharges(updated, ids.ABILITY_ASGORE_SOUL_PARADE, 0);
    updated = {
      ...updated,
      asgorePatienceStealthActive: false,
      asgoreBraveryAutoDefenseReady: false,
    };
  }
  if (unit.heroId === HERO_UNDYNE_ID) {
    updated = setCharges(updated, ids.ABILITY_UNDYNE_ENERGY_SPEAR, 0);
    updated = {
      ...updated,
      undyneImmortalUsed: false,
      undyneImmortalActive: false,
    };
  }
  if (unit.heroId === HERO_PAPYRUS_ID) {
    updated = setCharges(updated, ids.ABILITY_PAPYRUS_SPAGHETTI, 0);
    updated = setCharges(updated, ids.ABILITY_PAPYRUS_COOL_GUY, 0);
    updated = {
      ...updated,
      papyrusUnbelieverActive: false,
      papyrusBoneMode: "blue",
      papyrusLongBoneMode: false,
      papyrusLineAxis: "row",
      papyrusBoneStatus: undefined,
    };
  }
  if (unit.heroId === HERO_METTATON_ID) {
    updated = {
      ...updated,
      mettatonRating: 0,
      mettatonExUnlocked: false,
      mettatonNeoUnlocked: false,
    };
  }
  if (unit.heroId === HERO_RIVER_PERSON_ID) {
    updated = setCharges(updated, ids.ABILITY_RIVER_PERSON_TRA_LA_LA, 0);
    updated = {
      ...updated,
      riverBoatCarryAllyId: undefined,
      riverBoatmanMovePending: false,
    };
  }

  return updated;
}
