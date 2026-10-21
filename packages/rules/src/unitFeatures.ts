import type { UnitState } from "./model";
import {
  HERO_DON_KIHOTE_ID, HERO_DUOLINGO_ID, HERO_EL_CID_COMPEADOR_ID,
  HERO_FEMTO_ID, HERO_GENGHIS_KHAN_ID, HERO_GRAND_KAISER_ID,
  HERO_GRIFFITH_ID, HERO_GROZNY_ID, HERO_HASSAN_ID, HERO_JEBE_ID,
  HERO_PAPYRUS_ID, HERO_VLAD_TEPES_ID,
} from "./heroes";
import { hasMettatonBerserkerFeature } from "./mettaton";

const COMMANDER_HEROES: ReadonlySet<string> = new Set([
  HERO_VLAD_TEPES_ID, HERO_EL_CID_COMPEADOR_ID, HERO_GENGHIS_KHAN_ID,
  HERO_HASSAN_ID, HERO_JEBE_ID, HERO_DON_KIHOTE_ID, HERO_GRIFFITH_ID, HERO_GROZNY_ID,
]);

/** Identity/form eligibility only; callers enforce life, visibility and range. */
export function hasCommanderAura(unit: UnitState): boolean {
  return Boolean(unit.heroId && COMMANDER_HEROES.has(unit.heroId));
}

/** Shared by single-target combat and area queues; charges are checked separately. */
export function hasBerserkerAutoDefense(unit: UnitState): boolean {
  return unit.class === "berserker" || unit.heroId === HERO_FEMTO_ID ||
    (unit.heroId === HERO_GRAND_KAISER_ID && unit.transformed === true) ||
    (unit.heroId === HERO_DUOLINGO_ID && unit.duolingoBerserkerUnlocked === true) ||
    (unit.heroId === HERO_PAPYRUS_ID && unit.papyrusUnbelieverActive === true) ||
    hasMettatonBerserkerFeature(unit);
}
