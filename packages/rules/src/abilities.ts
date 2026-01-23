// packages/rules/src/abilities.ts
import { GameState, UnitState, GameEvent, TurnSlot } from "./model";
import { RNG } from "./rng";

/**
 * Стоимость способности с точки зрения экономики хода.
 */
export interface AbilityCost {
  /** Какие слоты хода расходуются */
  consumes?: Partial<Record<TurnSlot, boolean>>;
}

export interface AbilitySpec {
  id: string;
  displayName: string;

  /** Максимальное число зарядов на счётчике (если ограничено) */
  maxCharges?: number;

  /**
   * Сколько зарядов нужно потратить за одно использование.
   */
  chargesPerUse?: number;

  /**
   * Легаси-поле, которое уже использовалось — трактуем как синоним chargesPerUse.
   */
  chargeCost?: number;

  /** Счётчик "особый" — не заряжается автоматически на начале хода */
  isSpecialCounter?: boolean;

  /** Стартует ли счётчик сразу на maxCharges */
  startsFull?: boolean;
  startsCharged?: boolean;

  /** Обнулять ли счётчик после использования абилки */
  resetsChargesOnUse?: boolean;

  /** Что тратит абилка: слоты хода */
  actionCost?: AbilityCost;
}

/**
 * Константа с id берсерковской авто-защиты, на которую ссылается combat.ts.
 */
export const ABILITY_BERSERK_AUTO_DEFENSE = "berserkAutoDefense" as const;
export const ABILITY_TRICKSTER_AOE = "tricksterAoE" as const;
export const ABILITY_TEST_MULTI_SLOT = "testMultiSlot" as const;
export const TRICKSTER_AOE_RADIUS = 2;

/**
 * Каталог способностей.
 * Пока у нас только авто-деф берсерка.
 */
const ABILITY_SPECS: Record<string, AbilitySpec> = {
  [ABILITY_BERSERK_AUTO_DEFENSE]: {
    id: ABILITY_BERSERK_AUTO_DEFENSE,
    displayName: "Berserker Auto Defense",
    maxCharges: 6,
    chargesPerUse: 6,
    chargeCost: 6,
    resetsChargesOnUse: true,
    startsFull: true,
    startsCharged: true,
    isSpecialCounter: false,
  },
  [ABILITY_TRICKSTER_AOE]: {
    id: ABILITY_TRICKSTER_AOE,
    displayName: "Trickster AoE",
    actionCost: {
      consumes: { attack: true, action: true },
    },
  },
  [ABILITY_TEST_MULTI_SLOT]: {
    id: ABILITY_TEST_MULTI_SLOT,
    displayName: "Test Multi Slot",
    actionCost: {
      consumes: { move: true, attack: true },
    },
  },
};

export function getAbilitySpec(id: string): AbilitySpec | undefined {
  return ABILITY_SPECS[id];
}

export function getCharges(unit: UnitState, abilityId: string): number {
  return unit.charges[abilityId] ?? 0;
}

export function setCharges(
  unit: UnitState,
  abilityId: string,
  value: number
): UnitState {
  return {
    ...unit,
    charges: {
      ...unit.charges,
      [abilityId]: value,
    },
  };
}

export function addCharges(
  unit: UnitState,
  abilityId: string,
  delta: number
): UnitState {
  const spec = getAbilitySpec(abilityId);
  const current = getCharges(unit, abilityId);
  let next = current + delta;

  if (spec?.maxCharges !== undefined) {
    next = Math.min(next, spec.maxCharges);
  }
  if (next < 0) next = 0;

  return setCharges(unit, abilityId, next);
}

/**
 * Проверка — хватает ли зарядов на использование способности.
 * Старый API, которым пользуется combat.ts: canUseAbility(unit, abilityId)
 */
export function canUseAbility(unit: UnitState, abilityId: string): boolean {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return false;

  const need = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const current = getCharges(unit, abilityId);

  return current >= need;
}

/**
 * Старый API combat.ts: consumeAbilityCharges(unit, abilityId)
 * — тратит нужное количество зарядов (или сбрасывает в 0, если так настроено).
 */
export function consumeAbilityCharges(
  unit: UnitState,
  abilityId: string
): UnitState {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return unit;

  const need = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const { unit: updated } = spendCharges(unit, abilityId, need);
  return updated;
}

/**
 * Новый более общий хелпер — можно вызывать напрямую из других мест.
 */
export function spendCharges(
  unit: UnitState,
  abilityId: string,
  amount: number
): { unit: UnitState; ok: boolean } {
  if (amount <= 0) {
    return { unit, ok: true };
  }

  const spec = getAbilitySpec(abilityId);
  const current = getCharges(unit, abilityId);

  if (current < amount) {
    return { unit, ok: false };
  }

  const resets = spec?.resetsChargesOnUse ?? false;
  const newValue = resets ? 0 : current - amount;

  const updated = setCharges(unit, abilityId, newValue);
  return { unit: updated, ok: true };
}

/**
 * Инициализация способностей юнита (при создании армии).
 * Пока только берсерк получает авто-деф на 6 зарядах.
 */
export function initUnitAbilities(unit: UnitState): UnitState {
  let updated = { ...unit };

  if (unit.class === "berserker") {
    const spec = getAbilitySpec(ABILITY_BERSERK_AUTO_DEFENSE)!;
    const startCharges =
      spec.startsFull || spec.startsCharged
        ? spec.maxCharges ?? 0
        : 0;

    updated = setCharges(updated, spec.id, startCharges);
  }

  return updated;
}

/**
 * Начало хода КОНКРЕТНОЙ фигуры:
 * +1 заряд ко всем не-special счётчикам.
 */
export function processUnitStartOfTurn(
  state: GameState,
  unitId: string,
  rng: RNG
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) {
    return { state, events: [] };
  }

  let updated = unit;

  for (const abilityId of Object.keys(updated.charges)) {
    const spec = getAbilitySpec(abilityId);
    if (!spec || spec.isSpecialCounter) continue;
    updated = addCharges(updated, abilityId, 1);
  }

  updated = {
    ...updated,
    lastChargedTurn: state.turnNumber,
  };

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    },
    events: [],
  };
}
