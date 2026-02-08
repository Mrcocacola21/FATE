import type { ApplyResult, GameAction, GameEvent, GameState, UnitState } from "../model";
import type { RNG } from "../rng";
import { getUnitDefinition } from "../units";
import { chebyshev } from "../board";
import { canSpendSlots, spendSlots } from "../turnEconomy";
import { isKaiser, isKaiserTransformed } from "./shared";
import { HERO_FALSE_TRAIL_TOKEN_ID, HERO_LECHY_ID } from "../heroes";
import { requestRoll } from "./utils/rollUtils";
import { evSearchStealth, evStealthEntered } from "./utils/events";

export function applyEnterStealth(
  state: GameState,
  action: Extract<GameAction, { type: "enterStealth" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) {
    return { state, events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state, events: [] };
  }

  if (isKaiser(unit)) {
    if (isKaiserTransformed(unit)) {
      return { state, events: [] };
    }

    if (!canSpendSlots(unit, { stealth: true })) {
      return { state, events: [] };
    }

    if (unit.bunker?.active) {
      const baseUnit: UnitState = spendSlots(unit, { stealth: true });
      return {
        state: {
          ...state,
          units: {
            ...state.units,
            [baseUnit.id]: baseUnit,
          },
        },
        events: [],
      };
    }

    return requestRoll(
      state,
      unit.owner,
      "enterBunker",
      { unitId: unit.id },
      unit.id
    );
  }

  // Уже тратил слот скрытности
  if (!canSpendSlots(unit, { stealth: true })) {
    return { state, events: [] };
  }

  // Уже в стелсе — попытка всё равно потрачена
  if (unit.isStealthed) {
    const baseUnit: UnitState = spendSlots(unit, { stealth: true });
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [baseUnit.id]: baseUnit,
        },
      },
      events: [],
    };
  }

  // Только ассасин и лучник могут в скрытность
  const canStealth =
    unit.class === "assassin" ||
    unit.class === "archer" ||
    unit.heroId === HERO_LECHY_ID;

  if (canStealth) {
    const pos = unit.position!;
    const hasStealthedOverlap = Object.values(state.units).some((u) => {
      if (!u.isAlive || !u.isStealthed || !u.position) return false;
      if (u.id === unit.id) return false;
      return u.position.col === pos.col && u.position.row === pos.row;
    });
    if (hasStealthedOverlap) {
      const baseUnit: UnitState = spendSlots(unit, { stealth: true });
      const newState: GameState = {
        ...state,
        units: {
          ...state.units,
          [baseUnit.id]: baseUnit,
        },
      };
      const events: GameEvent[] = [
        evStealthEntered({ unitId: baseUnit.id, success: false }),
      ];
      return { state: newState, events };
    }

    return requestRoll(
      state,
      unit.owner,
      "enterStealth",
      { unitId: unit.id },
      unit.id
    );
  }
  const baseUnit: UnitState = spendSlots(unit, { stealth: true });
  const newState: GameState = {
    ...state,
    units: {
      ...state.units,
      [baseUnit.id]: baseUnit,
    },
  };
  const events: GameEvent[] = [
    evStealthEntered({ unitId: baseUnit.id, success: false }),
  ];
  return { state: newState, events };
}

export function applySearchStealth(
  state: GameState,
  action: Extract<GameAction, { type: "searchStealth" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state, events: [] };
  }

  const searchCosts =
    action.mode === "action" ? { action: true } : { move: true };
  // 🚫 проверяем, чем платим за поиск
  if (!canSpendSlots(unit, searchCosts)) {
    return { state, events: [] };
  }

  const searcher = unit;
  const candidates = Object.values(state.units).filter((candidate) => {
    if (!candidate.isAlive || !candidate.isStealthed || !candidate.position) {
      return false;
    }
    if (candidate.owner === unit.owner) {
      return false;
    }
    const dist = chebyshev(searcher.position!, candidate.position);
    return dist <= 1;
  });

  if (candidates.length === 0) {
    const updatedSearcher: UnitState = spendSlots(unit, searchCosts);
    const newState: GameState = {
      ...state,
      units: {
        ...state.units,
        [updatedSearcher.id]: updatedSearcher,
      },
    };
    const events: GameEvent[] = [
      evSearchStealth({
        unitId: updatedSearcher.id,
        mode: action.mode,
        rolls: [],
      }),
    ];
    return { state: newState, events };
  }

  return requestRoll(
    state,
    unit.owner,
    "searchStealth",
    { unitId: unit.id, mode: action.mode },
    unit.id
  );
}

