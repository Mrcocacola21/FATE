import type { ApplyResult, GameEvent, GameState, UnitState } from "../../../model";
import {
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  getCharges,
  setCharges,
} from "../../../abilities";
import { isFrisk } from "./helpers";
import { tryApplyFriskPowerOfFriendship } from "./friendship";

const FRISK_COUNTER_CAP = 30;

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
