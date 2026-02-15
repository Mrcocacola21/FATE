import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  UnitState,
} from "../../model";
import { chebyshev } from "../../board";
import { canAttackTarget } from "../../combat";
import { canDirectlyTargetUnit } from "../../visibility";
import {
  ABILITY_LOKI_LAUGHT,
  addCharges,
  getCharges,
} from "../../abilities";
import {
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_LOKI_ID,
} from "../../heroes";
import { requestRoll } from "../../core";
import { canSpendSlots } from "../../turnEconomy";

export const LOKI_LAUGHT_CAP = 15;

export type LokiLaughtOption =
  | "againSomeNonsense"
  | "chicken"
  | "mindControl"
  | "spinTheDrum"
  | "greatLokiJoke";

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

export function getLokiTricksterAreaTargetIds(
  state: GameState,
  lokiId: string
): string[] {
  const loki = state.units[lokiId];
  if (!loki || !loki.isAlive || !loki.position) {
    return [];
  }

  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.id === loki.id) return false;
      return chebyshev(loki.position!, unit.position) <= 2;
    })
    .map((unit) => unit.id)
    .sort();
}

export function getLokiChickenTargetIds(
  state: GameState,
  lokiId: string
): string[] {
  const loki = state.units[lokiId];
  if (!loki || !loki.isAlive || !loki.position || !isLoki(loki)) {
    return [];
  }

  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.owner === loki.owner) return false;
      if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return false;
      return chebyshev(loki.position!, unit.position) <= 2;
    })
    .map((unit) => unit.id)
    .sort();
}

export function getLokiForcedAttackTargetIds(
  state: GameState,
  attackerId: string
): string[] {
  const attacker = state.units[attackerId];
  if (!attacker || !attacker.isAlive || !attacker.position) {
    return [];
  }
  if (!canSpendSlots(attacker, { attack: true, action: true })) {
    return [];
  }

  return Object.values(state.units)
    .filter((target) => {
      if (!target.isAlive || !target.position) return false;
      if (target.id === attacker.id) return false;
      if (!canDirectlyTargetUnit(state, attacker.id, target.id)) return false;
      return canAttackTarget(state, attacker, target, {
        allowFriendlyTarget: true,
      });
    })
    .map((target) => target.id)
    .sort();
}

export function getLokiMindControlEnemyIds(
  state: GameState,
  lokiId: string
): string[] {
  const loki = state.units[lokiId];
  if (!loki || !loki.isAlive || !loki.position || !isLoki(loki)) {
    return [];
  }

  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.owner === loki.owner) return false;
      if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return false;
      if (chebyshev(loki.position!, unit.position) > 2) return false;
      if (!canSpendSlots(unit, { attack: true, action: true })) return false;
      return getLokiForcedAttackTargetIds(state, unit.id).length > 0;
    })
    .map((unit) => unit.id)
    .sort();
}

export function getLokiSpinCandidateIds(
  state: GameState,
  lokiId: string
): string[] {
  const loki = state.units[lokiId];
  if (!loki || !loki.isAlive || !loki.position || !isLoki(loki)) {
    return [];
  }

  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.owner !== loki.owner) return false;
      if (unit.id === loki.id) return false;
      if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return false;
      return true;
    })
    .map((unit) => unit.id)
    .sort();
}

export function buildLokiLaughtChoiceContext(
  state: GameState,
  lokiId: string
): Record<string, unknown> {
  return {
    lokiId,
    chickenOptions: getLokiChickenTargetIds(state, lokiId),
    mindControlEnemyOptions: getLokiMindControlEnemyIds(state, lokiId),
    spinCandidateIds: getLokiSpinCandidateIds(state, lokiId),
  };
}

export function applyLokiLaught(state: GameState, unit: UnitState): ApplyResult {
  if (!isLoki(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  const ctx = buildLokiLaughtChoiceContext(state, unit.id);
  return requestRoll(state, unit.owner, "lokiLaughtChoice", ctx, unit.id);
}

function isDoubleDice(dice: number[] | undefined): boolean {
  return Array.isArray(dice) && dice.length >= 2 && dice[0] === dice[1];
}

function countDoubles(events: GameEvent[]): number {
  let total = 0;
  for (const event of events) {
    if (event.type === "attackResolved") {
      if (event.attackerRoll?.isDouble) total += 1;
      if (event.defenderRoll?.isDouble) total += 1;
      continue;
    }
    if (event.type === "initiativeRolled") {
      if (isDoubleDice(event.dice)) total += 1;
      continue;
    }
    if (event.type === "carpetStrikeCenter") {
      if (isDoubleDice(event.dice)) total += 1;
      continue;
    }
    if (event.type === "carpetStrikeAttackRolled") {
      if (isDoubleDice(event.dice)) total += 1;
    }
  }
  return total;
}

export function applyLokiIllusoryDoubleFromEvents(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const doubles = countDoubles(events);
  if (doubles <= 0) {
    return { state, events };
  }

  let nextState = state;
  let changed = false;
  const nextEvents: GameEvent[] = [...events];

  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.position || !isLoki(unit)) continue;
    const before = getCharges(unit, ABILITY_LOKI_LAUGHT);
    const updated = addCharges(unit, ABILITY_LOKI_LAUGHT, doubles);
    const after = getCharges(updated, ABILITY_LOKI_LAUGHT);
    if (after === before) continue;

    changed = true;
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [updated.id]: updated,
      },
    };
    nextEvents.push({
      type: "chargesUpdated",
      unitId: updated.id,
      deltas: { [ABILITY_LOKI_LAUGHT]: after - before },
      now: { [ABILITY_LOKI_LAUGHT]: after },
    });
  }

  return changed ? { state: nextState, events: nextEvents } : { state, events };
}

export function getLokiLaughter(unit: UnitState): number {
  return getCharges(unit, ABILITY_LOKI_LAUGHT);
}

export function pickRandomFromIds(
  ids: string[],
  next01: () => number
): string | null {
  if (ids.length === 0) return null;
  const idx = Math.min(ids.length - 1, Math.floor(next01() * ids.length));
  return ids[idx] ?? null;
}

export function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

