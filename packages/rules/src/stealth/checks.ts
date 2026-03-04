import type { UnitState } from "../model";
import {
  HERO_HASSAN_ID,
  HERO_LECHY_ID,
  HERO_METTATON_ID,
} from "../heroes";

export function getStealthSuccessMinRoll(unit: UnitState): number | null {
  if (unit.heroId === HERO_METTATON_ID) {
    return null;
  }
  if (unit.asgorePatienceStealthActive) {
    return 5;
  }
  if (typeof unit.stealthSuccessMinRoll === "number") {
    return unit.stealthSuccessMinRoll;
  }
  if (unit.heroId === HERO_HASSAN_ID) {
    return 4;
  }
  if (unit.heroId === HERO_LECHY_ID) {
    return 5;
  }
  if (unit.class === "assassin") {
    return 5;
  }
  if (unit.class === "archer") {
    return 6;
  }
  return null;
}
