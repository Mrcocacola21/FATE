import type { GameState, UnitState } from "../../../model";
import { HERO_LOKI_ID } from "../../../heroes";

export function isLoki(unit: UnitState): boolean {
  return unit.heroId === HERO_LOKI_ID;
}

export function isLokiChicken(unit: UnitState): boolean {
  return (unit.lokiChickenSources?.length ?? 0) > 0;
}

export function isLokiMoveLocked(unit: UnitState): boolean {
  return (unit.lokiMoveLockSources?.length ?? 0) > 0;
}

export function addLokiMoveLock(unit: UnitState, sourceUnitId: string): UnitState {
  const sources = Array.isArray(unit.lokiMoveLockSources)
    ? unit.lokiMoveLockSources
    : [];
  if (sources.includes(sourceUnitId)) {
    return unit;
  }
  return {
    ...unit,
    lokiMoveLockSources: [...sources, sourceUnitId],
  };
}

export function addLokiChicken(unit: UnitState, sourceUnitId: string): UnitState {
  const sources = Array.isArray(unit.lokiChickenSources)
    ? unit.lokiChickenSources
    : [];
  if (sources.includes(sourceUnitId)) {
    return unit;
  }
  return {
    ...unit,
    lokiChickenSources: [...sources, sourceUnitId],
  };
}

export function clearLokiEffectsForCaster(
  state: GameState,
  casterUnitId: string
): GameState {
  let changed = false;
  const units: Record<string, UnitState> = { ...state.units };

  for (const [unitId, unit] of Object.entries(state.units)) {
    const moveSources = Array.isArray(unit.lokiMoveLockSources)
      ? unit.lokiMoveLockSources
      : [];
    const chickenSources = Array.isArray(unit.lokiChickenSources)
      ? unit.lokiChickenSources
      : [];
    if (
      !moveSources.includes(casterUnitId) &&
      !chickenSources.includes(casterUnitId)
    ) {
      continue;
    }

    changed = true;
    const nextMoveSources = moveSources.filter((id) => id !== casterUnitId);
    const nextChickenSources = chickenSources.filter((id) => id !== casterUnitId);
    units[unitId] = {
      ...unit,
      lokiMoveLockSources:
        nextMoveSources.length > 0 ? nextMoveSources : undefined,
      lokiChickenSources:
        nextChickenSources.length > 0 ? nextChickenSources : undefined,
    };
  }

  return changed ? { ...state, units } : state;
}
