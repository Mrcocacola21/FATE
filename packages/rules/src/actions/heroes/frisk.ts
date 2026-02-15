import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PlayerId,
  UnitState,
} from "../../model";
import { chebyshev } from "../../board";
import {
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  getCharges,
  setCharges,
} from "../../abilities";
import { HERO_FALSE_TRAIL_TOKEN_ID, HERO_FRISK_ID } from "../../heroes";
import { requestRoll } from "../../shared/rollUtils";
import { evGameEnded } from "../../shared/events";

const FRISK_COUNTER_CAP = 30;

export const FRISK_PACIFISM_HUGS_COST = 3;
export const FRISK_PACIFISM_CHILDS_CRY_COST = 5;
export const FRISK_PACIFISM_WARM_WORDS_COST = 10;
export const FRISK_GENOCIDE_SUBSTITUTION_COST = 3;
export const FRISK_GENOCIDE_KEEN_EYE_COST = 5;
export const FRISK_GENOCIDE_PRECISION_STRIKE_COST = 10;

export function isFrisk(unit: UnitState | undefined): unit is UnitState {
  return !!unit && unit.heroId === HERO_FRISK_ID;
}

export function canFriskUsePacifism(unit: UnitState | undefined): boolean {
  return !!unit && isFrisk(unit) && !unit.friskPacifismDisabled;
}

function addFriskCounter(
  unit: UnitState,
  abilityId: string,
  delta: number
): UnitState {
  const current = getCharges(unit, abilityId);
  const next = Math.max(0, Math.min(FRISK_COUNTER_CAP, current + delta));
  if (next === current) return unit;
  return setCharges(unit, abilityId, next);
}

export function getFriskPacifismTargetIds(
  state: GameState,
  friskId: string
): string[] {
  const frisk = state.units[friskId];
  if (!isFrisk(frisk) || !frisk.isAlive || !frisk.position) {
    return [];
  }
  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.id === frisk.id) return false;
      return chebyshev(frisk.position!, unit.position) <= 2;
    })
    .map((unit) => unit.id)
    .sort();
}

export function getFriskWarmWordsTargetIds(
  state: GameState,
  friskId: string
): string[] {
  return getFriskPacifismTargetIds(state, friskId);
}

export function getFriskKeenEyeTargetIds(
  state: GameState,
  friskId: string
): string[] {
  const frisk = state.units[friskId];
  if (!isFrisk(frisk) || !frisk.isAlive || !frisk.position) {
    return [];
  }
  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.owner === frisk.owner) return false;
      if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return false;
      return true;
    })
    .map((unit) => unit.id)
    .sort();
}

export function canTriggerPowerOfFriendshipForFrisk(
  state: GameState,
  frisk: UnitState
): boolean {
  if (!isFrisk(frisk) || !frisk.isAlive || !frisk.position) return false;
  if (frisk.friskPacifismDisabled) return false;
  if (getCharges(frisk, ABILITY_FRISK_GENOCIDE) !== 0) return false;

  const enemiesAlive = Object.values(state.units).filter(
    (unit) =>
      unit.isAlive &&
      !!unit.position &&
      unit.owner !== frisk.owner &&
      unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
  ).length;
  return enemiesAlive === 1;
}

function getPowerOfFriendshipWinner(state: GameState): PlayerId | null {
  if (state.phase === "ended") return null;
  const friskUnits = Object.values(state.units).filter(
    (unit) => isFrisk(unit) && unit.isAlive && !!unit.position
  );
  for (const frisk of friskUnits) {
    if (canTriggerPowerOfFriendshipForFrisk(state, frisk)) {
      return frisk.owner;
    }
  }
  return null;
}

export function tryApplyFriskPowerOfFriendship(
  state: GameState
): ApplyResult | null {
  const winner = getPowerOfFriendshipWinner(state);
  if (!winner) return null;
  return {
    state: {
      ...state,
      phase: "ended",
      activeUnitId: null,
      pendingMove: null,
      pendingRoll: null,
    },
    events: [evGameEnded({ winner })],
  };
}

export function applyFriskPacifism(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!canFriskUsePacifism(unit) || !unit.position) {
    return { state, events: [] };
  }
  return requestRoll(
    state,
    unit.owner,
    "friskPacifismChoice",
    {
      friskId: unit.id,
      hugsOptions: getFriskPacifismTargetIds(state, unit.id),
      warmWordsOptions: getFriskWarmWordsTargetIds(state, unit.id),
      canPowerOfFriendship: canTriggerPowerOfFriendshipForFrisk(state, unit),
    },
    unit.id
  );
}

export function applyFriskGenocide(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isFrisk(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  return requestRoll(
    state,
    unit.owner,
    "friskGenocideChoice",
    { friskId: unit.id },
    unit.id
  );
}

export function markFriskAttackedWhileStealthed(
  state: GameState,
  attackerId: string
): GameState {
  const attacker = state.units[attackerId];
  if (!isFrisk(attacker) || !attacker.isStealthed) {
    return state;
  }
  if (attacker.friskDidAttackWhileStealthedSinceLastEnter) {
    return state;
  }
  return {
    ...state,
    units: {
      ...state.units,
      [attacker.id]: {
        ...attacker,
        friskDidAttackWhileStealthedSinceLastEnter: true,
      },
    },
  };
}

function applyFriskKillBonuses(
  state: GameState,
  frisk: UnitState
): { state: GameState; event?: GameEvent } {
  const beforePacifism = getCharges(frisk, ABILITY_FRISK_PACIFISM);
  const beforeGenocide = getCharges(frisk, ABILITY_FRISK_GENOCIDE);
  const killCountBefore = frisk.friskKillCount ?? 0;
  let updated: UnitState = {
    ...frisk,
    friskKillCount: killCountBefore + 1,
  };

  if (killCountBefore === 0) {
    updated = {
      ...updated,
      attack: updated.attack + 1,
    };
  }

  if (!updated.friskPacifismDisabled) {
    const pacifism = getCharges(updated, ABILITY_FRISK_PACIFISM);
    updated = setCharges(updated, ABILITY_FRISK_PACIFISM, 0);
    updated = addFriskCounter(updated, ABILITY_FRISK_GENOCIDE, pacifism);
    updated = {
      ...updated,
      friskPacifismDisabled: true,
    };
  }

  if (killCountBefore >= 1) {
    updated = addFriskCounter(updated, ABILITY_FRISK_GENOCIDE, 3);
  }

  const afterPacifism = getCharges(updated, ABILITY_FRISK_PACIFISM);
  const afterGenocide = getCharges(updated, ABILITY_FRISK_GENOCIDE);
  const deltas: Record<string, number> = {};
  if (afterPacifism !== beforePacifism) {
    deltas[ABILITY_FRISK_PACIFISM] = afterPacifism - beforePacifism;
  }
  if (afterGenocide !== beforeGenocide) {
    deltas[ABILITY_FRISK_GENOCIDE] = afterGenocide - beforeGenocide;
  }

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updated.id]: updated,
    },
  };

  if (Object.keys(deltas).length === 0) {
    return { state: nextState };
  }
  return {
    state: nextState,
    event: {
      type: "chargesUpdated",
      unitId: updated.id,
      deltas,
      now: {
        [ABILITY_FRISK_PACIFISM]: afterPacifism,
        [ABILITY_FRISK_GENOCIDE]: afterGenocide,
      },
    },
  };
}

export function applyFriskPostAction(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  if (events.length === 0) {
    return { state, events };
  }

  let nextState = state;
  const nextEvents: GameEvent[] = [...events];
  let hadUnitDeath = false;

  for (const event of events) {
    if (event.type === "attackResolved") {
      const defender = nextState.units[event.defenderId];
      if (
        defender &&
        isFrisk(defender) &&
        !event.hit &&
        !defender.friskPacifismDisabled
      ) {
        const before = getCharges(defender, ABILITY_FRISK_PACIFISM);
        const updated = addFriskCounter(defender, ABILITY_FRISK_PACIFISM, 1);
        const after = getCharges(updated, ABILITY_FRISK_PACIFISM);
        if (after !== before) {
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
            deltas: { [ABILITY_FRISK_PACIFISM]: after - before },
            now: { [ABILITY_FRISK_PACIFISM]: after },
          });
        }
      }

      const attacker = nextState.units[event.attackerId];
      if (attacker && isFrisk(attacker) && event.hit) {
        const before = getCharges(attacker, ABILITY_FRISK_GENOCIDE);
        const updated = addFriskCounter(attacker, ABILITY_FRISK_GENOCIDE, 1);
        const after = getCharges(updated, ABILITY_FRISK_GENOCIDE);
        if (after !== before) {
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
            deltas: { [ABILITY_FRISK_GENOCIDE]: after - before },
            now: { [ABILITY_FRISK_GENOCIDE]: after },
          });
        }
      }
      continue;
    }

    if (event.type === "stealthEntered") {
      if (!event.success) continue;
      const unit = nextState.units[event.unitId];
      if (!isFrisk(unit)) continue;
      nextState = {
        ...nextState,
        units: {
          ...nextState.units,
          [unit.id]: {
            ...unit,
            friskDidAttackWhileStealthedSinceLastEnter: false,
          },
        },
      };
      continue;
    }

    if (event.type === "stealthRevealed") {
      const unit = nextState.units[event.unitId];
      if (!isFrisk(unit)) continue;
      if (unit.friskDidAttackWhileStealthedSinceLastEnter) continue;
      nextState = {
        ...nextState,
        units: {
          ...nextState.units,
          [unit.id]: {
            ...unit,
            friskCleanSoulShield: true,
          },
        },
      };
      continue;
    }

    if (event.type === "unitDied") {
      hadUnitDeath = true;
      if (!event.killerId) continue;
      const killer = nextState.units[event.killerId];
      if (!isFrisk(killer)) continue;
      const applied = applyFriskKillBonuses(nextState, killer);
      nextState = applied.state;
      if (applied.event) {
        nextEvents.push(applied.event);
      }
    }
  }

  if (hadUnitDeath) {
    const friendship = tryApplyFriskPowerOfFriendship(nextState);
    if (friendship) {
      return {
        state: friendship.state,
        events: [...nextEvents, ...friendship.events],
      };
    }
  }

  return { state: nextState, events: nextEvents };
}

export function findUnitByIdWithPosition(
  state: GameState,
  unitId: string
): UnitState | null {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) return null;
  return unit;
}

export function isWithinDistance(
  from: Coord,
  to: Coord,
  distance: number
): boolean {
  return chebyshev(from, to) <= distance;
}
