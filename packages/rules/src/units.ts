// packages/rules/src/units.ts

import { UnitClass, UnitDefinition } from "./model";

// Базовые характеристики классов
export const UNIT_DEFINITIONS: Record<UnitClass, UnitDefinition> = {
  spearman: {
    class: "spearman",
    maxHp: 5,
    baseAttack: 1,
    canStealth: false,
    maxStealthTurns: 0,
  },
  rider: {
    class: "rider",
    maxHp: 6,
    baseAttack: 1,
    canStealth: false,
    maxStealthTurns: 0,
  },
  knight: {
    class: "knight",
    maxHp: 6,
    baseAttack: 2,
    canStealth: false,
    maxStealthTurns: 0,
  },
  archer: {
    class: "archer",
    maxHp: 5,
    baseAttack: 1,
    canStealth: true, // может входить в скрытность на к6 = 6
    maxStealthTurns: 3,
  },
  trickster: {
    class: "trickster",
    maxHp: 4,
    baseAttack: 1,
    canStealth: false,
    maxStealthTurns: 0,
  },
  assassin: {
    class: "assassin",
    maxHp: 4,
    baseAttack: 1, // 2 из скрытности посчитаем в боевой логике
    canStealth: true,
    maxStealthTurns: 3,
  },
  berserker: {
    class: "berserker",
    maxHp: 8,
    baseAttack: 2,
    canStealth: false,
    maxStealthTurns: 0,
  },
};

export function getUnitDefinition(unitClass: UnitClass): UnitDefinition {
  return UNIT_DEFINITIONS[unitClass];
}
