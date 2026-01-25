// packages/rules/src/abilities.ts
import {
  AbilityKind,
  AbilitySlot,
  AbilityView,
  GameEvent,
  GameState,
  TurnSlot,
  UnitState,
} from "./model";
import { RNG } from "./rng";
import { HERO_GRAND_KAISER_ID } from "./heroes";

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
  kind: AbilityKind;
  description: string;

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
  chargeUnlimited?: boolean;
  triggerCharges?: number;
}

/**
 * Константа с id берсерковской авто-защиты, на которую ссылается combat.ts.
 */
export const ABILITY_BERSERK_AUTO_DEFENSE = "berserkAutoDefense" as const;
export const ABILITY_TRICKSTER_AOE = "tricksterAoE" as const;
export const ABILITY_TEST_MULTI_SLOT = "testMultiSlot" as const;
export const ABILITY_KAISER_DORA = "kaiserDora" as const;
export const ABILITY_KAISER_CARPET_STRIKE = "kaiserCarpetStrike" as const;
export const ABILITY_KAISER_ENGINEERING_MIRACLE =
  "kaiserEngineeringMiracle" as const;
export const ABILITY_KAISER_BUNKER = "kaiserBunker" as const;
export const TRICKSTER_AOE_RADIUS = 2;

/**
 * Каталог способностей.
 * Пока у нас только авто-деф берсерка.
 */
const ABILITY_SPECS: Record<string, AbilitySpec> = {
  [ABILITY_BERSERK_AUTO_DEFENSE]: {
    id: ABILITY_BERSERK_AUTO_DEFENSE,
    displayName: "Berserker Auto Defense",
    kind: "passive",
    description: "Auto-dodge when fully charged. Resets after use.",
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
    kind: "active",
    description: "5x5 AoE (radius 2). Hits allies (not self).",
    actionCost: {
      consumes: { attack: true, action: true },
    },
  },
  [ABILITY_TEST_MULTI_SLOT]: {
    id: ABILITY_TEST_MULTI_SLOT,
    displayName: "Test Multi Slot",
    kind: "active",
    description: "Consumes move and attack slots.",
    actionCost: {
      consumes: { move: true, attack: true },
    },
  },
  [ABILITY_KAISER_BUNKER]: {
    id: ABILITY_KAISER_BUNKER,
    displayName: "Bunker",
    kind: "passive",
    description: "Enter on 4-6. Damage capped to 1 for 3 own turns.",
  },
  [ABILITY_KAISER_DORA]: {
    id: ABILITY_KAISER_DORA,
    displayName: "Dora",
    kind: "active",
    description: "3x3 bombardment on archer line.",
    maxCharges: 2,
    chargesPerUse: 2,
    actionCost: {
      consumes: { action: true },
    },
  },
  [ABILITY_KAISER_CARPET_STRIKE]: {
    id: ABILITY_KAISER_CARPET_STRIKE,
    displayName: "Carpet Strike",
    kind: "impulse",
    description: "Impulse 5x5 strike: roll center and attack. Hits all sides.",
    maxCharges: 3,
    chargesPerUse: 3,
  },
  [ABILITY_KAISER_ENGINEERING_MIRACLE]: {
    id: ABILITY_KAISER_ENGINEERING_MIRACLE,
    displayName: "Engineering Miracle",
    kind: "impulse",
    description: "Auto transform. Gain rider + berserker movement, attack 2.",
    chargeUnlimited: true,
    triggerCharges: 5,
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

  if (unit.heroId === HERO_GRAND_KAISER_ID) {
    updated = setCharges(updated, ABILITY_KAISER_DORA, 0);
    updated = setCharges(updated, ABILITY_KAISER_CARPET_STRIKE, 0);
    updated = setCharges(updated, ABILITY_KAISER_ENGINEERING_MIRACLE, 0);
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
  const deltas: Record<string, number> = {};
  const now: Record<string, number> = {};

  for (const abilityId of Object.keys(updated.charges)) {
    const spec = getAbilitySpec(abilityId);
    if (!spec || spec.isSpecialCounter) continue;
    const isChargeable =
      spec.chargeUnlimited === true ||
      spec.maxCharges !== undefined ||
      spec.chargesPerUse !== undefined ||
      spec.chargeCost !== undefined;
    if (!isChargeable) continue;
    const before = getCharges(updated, abilityId);
    updated = addCharges(updated, abilityId, 1);
    const after = getCharges(updated, abilityId);
    if (after !== before) {
      deltas[abilityId] = after - before;
    }
    if (after !== before || abilityId in now) {
      now[abilityId] = after;
    }
  }

  updated = {
    ...updated,
    lastChargedTurn: state.turnNumber,
  };

  const events: GameEvent[] = [];
  if (Object.keys(deltas).length > 0) {
    events.push({
      type: "chargesUpdated",
      unitId: updated.id,
      deltas,
      now: Object.keys(now).length > 0 ? now : { ...updated.charges },
    });
  }

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    },
    events,
  };
}

function getSlotFromCost(spec: AbilitySpec): AbilitySlot {
  const costs = spec.actionCost?.consumes;
  if (costs?.action) return "action";
  if (costs?.move) return "move";
  if (costs?.attack) return "attack";
  if (costs?.stealth) return "stealth";
  return "none";
}

function getChargeRequired(spec: AbilitySpec): number | undefined {
  return spec.chargesPerUse ?? spec.chargeCost ?? spec.maxCharges;
}

function getActiveDisabledReason(
  state: GameState,
  unit: UnitState,
  spec: AbilitySpec
): string | undefined {
  if (state.pendingRoll) return "Pending roll must be resolved";
  if (state.phase !== "battle") return "Not in battle";
  if (unit.owner !== state.currentPlayer) return "Not your turn";
  if (state.activeUnitId !== unit.id) return "Not active unit";

  const costs = spec.actionCost?.consumes;
  if (costs?.action && unit.turn?.actionUsed) {
    return "Action slot already used";
  }
  if (costs?.move && unit.turn?.moveUsed) {
    return "Move slot already used";
  }
  if (costs?.attack && unit.turn?.attackUsed) {
    return "Attack slot already used";
  }
  if (costs?.stealth && unit.turn?.stealthUsed) {
    return "Stealth slot already used";
  }

  const required = getChargeRequired(spec);
  if (
    required !== undefined &&
    spec.id !== ABILITY_KAISER_ENGINEERING_MIRACLE &&
    !(spec.id === ABILITY_KAISER_DORA && unit.heroId === HERO_GRAND_KAISER_ID && unit.transformed) &&
    getCharges(unit, spec.id) < required
  ) {
    return "Not enough charges";
  }

  return undefined;
}

export function getAbilityViewsForUnit(
  state: GameState,
  unitId: string
): AbilityView[] {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) return [];

  const abilityIds: string[] = [];

  if (
    unit.class === "berserker" ||
    (unit.heroId === HERO_GRAND_KAISER_ID && unit.transformed)
  ) {
    abilityIds.push(ABILITY_BERSERK_AUTO_DEFENSE);
  }
  if (unit.class === "trickster") {
    abilityIds.push(ABILITY_TRICKSTER_AOE);
  }
  if (unit.heroId === HERO_GRAND_KAISER_ID) {
    abilityIds.push(
      ABILITY_KAISER_BUNKER,
      ABILITY_KAISER_DORA,
      ABILITY_KAISER_CARPET_STRIKE,
      ABILITY_KAISER_ENGINEERING_MIRACLE
    );
  }

  return abilityIds
    .map((id) => {
      const spec = getAbilitySpec(id);
      if (!spec) return null;
      const chargeRequired = getChargeRequired(spec);
      const hasCharges =
        spec.chargeUnlimited === true ||
        spec.maxCharges !== undefined ||
        chargeRequired !== undefined;
      const currentCharges = hasCharges ? getCharges(unit, id) : undefined;

      let isAvailable = true;
      let disabledReason: string | undefined = undefined;

      if (spec.kind === "active") {
        disabledReason = getActiveDisabledReason(state, unit, spec);
        isAvailable = !disabledReason;
      } else if (spec.kind === "impulse") {
        if (spec.id === ABILITY_KAISER_ENGINEERING_MIRACLE && unit.transformed) {
          isAvailable = false;
          disabledReason = "Already transformed";
        } else if (
          chargeRequired !== undefined &&
          getCharges(unit, id) < chargeRequired
        ) {
          isAvailable = false;
          disabledReason = "Not enough charges";
        }
      }

      return {
        id,
        name: spec.displayName,
        kind: spec.kind,
        description: spec.description,
        slot: getSlotFromCost(spec),
        chargeRequired,
        chargeUnlimited: spec.chargeUnlimited,
        currentCharges,
        isAvailable,
        disabledReason,
      } as AbilityView;
    })
    .filter((item): item is AbilityView => item !== null);
}
