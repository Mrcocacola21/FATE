import type { ApplyResult, GameAction, GameEvent, GameState, UnitState } from "../model";
import type { RNG } from "../rng";
import { chebyshev } from "../board";
import { ABILITY_FRISK_GENOCIDE, getCharges } from "../abilities";
import { canSpendSlots, spendSlots } from "../turnEconomy";
import { isKaiser, isKaiserTransformed } from "./shared";
import { HERO_FALSE_TRAIL_TOKEN_ID, HERO_FRISK_ID, HERO_METTATON_ID } from "../heroes";
import { getFriskKeenEyeTargetIds } from "./heroes/frisk";
import { requestRoll } from "../core";
import { evSearchStealth, evStealthEntered } from "../core";
import { getStealthSuccessMinRoll } from "../stealth";
import { canEnterStealthByRuleDeclaration } from "../ruleDeclarations";

export const KAISER_TRANSFORMED_STEALTH_REJECTION =
  "Grand Kaiser cannot enter stealth after transformation.";

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
  if ((unit.lokiChickenSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }
  if (unit.heroId === HERO_METTATON_ID) {
    return { state, events: [] };
  }
  if (!canEnterStealthByRuleDeclaration(state, unit)) {
    return { state, events: [] };
  }

  if (isKaiser(unit)) {
    if (isKaiserTransformed(unit)) {
      return {
        state,
        events: [],
        rejectionReason: KAISER_TRANSFORMED_STEALTH_REJECTION,
      };
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
  const canStealth = getStealthSuccessMinRoll(unit) !== null;

  if (canStealth) {
    if (
      unit.heroId === HERO_FRISK_ID &&
      getCharges(unit, ABILITY_FRISK_GENOCIDE) >= 5
    ) {
      const keenEyeOptions = getFriskKeenEyeTargetIds(state, unit.id);
      if (keenEyeOptions.length > 0) {
        return requestRoll(
          state,
          unit.owner,
          "friskKeenEyeChoice",
          { friskId: unit.id, options: keenEyeOptions },
          unit.id
        );
      }
    }

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
  if ((unit.lokiChickenSources?.length ?? 0) > 0) {
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


