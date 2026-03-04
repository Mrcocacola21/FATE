import type { DiceRoll, UnitState } from "../model";
import { HERO_CHIKATILO_ID, HERO_GENGHIS_KHAN_ID, HERO_JEBE_ID } from "../heroes";

export function buildDiceRoll(base: number[], tieBreak: number[]): DiceRoll {
  const dice = [...base, ...tieBreak];
  const sum = dice.reduce((acc, v) => acc + v, 0);
  const isDouble = base.length >= 2 && base[0] === base[1];
  return { dice, sum, isDouble };
}

export function recordGenghisAttack(
  attacker: UnitState,
  defenderId: string
): UnitState {
  if (
    attacker.heroId !== HERO_GENGHIS_KHAN_ID &&
    attacker.heroId !== HERO_JEBE_ID
  ) {
    return attacker;
  }
  const existing = Array.isArray(attacker.genghisKhanAttackedThisTurn)
    ? attacker.genghisKhanAttackedThisTurn
    : [];
  if (existing.includes(defenderId)) {
    return attacker;
  }
  return {
    ...attacker,
    genghisKhanAttackedThisTurn: [...existing, defenderId],
  };
}

export function hasLegendOfTheSteppesBonus(
  attacker: UnitState,
  defenderId: string
): boolean {
  if (
    attacker.heroId !== HERO_GENGHIS_KHAN_ID &&
    attacker.heroId !== HERO_JEBE_ID
  ) {
    return false;
  }
  const lastTurn = Array.isArray(attacker.genghisKhanAttackedLastTurn)
    ? attacker.genghisKhanAttackedLastTurn
    : [];
  return lastTurn.includes(defenderId);
}

export function getChikatiloMarkBonus(
  attacker: UnitState,
  defenderId: string
): number {
  if (attacker.heroId !== HERO_CHIKATILO_ID) {
    return 0;
  }
  const marked = attacker.chikatiloMarkedTargets;
  if (!Array.isArray(marked)) {
    return 0;
  }
  return marked.includes(defenderId) ? 1 : 0;
}
