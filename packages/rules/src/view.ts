// packages/rules/src/view.ts

import {
  GameState,
  PlayerId,
  UnitState,
  makeEmptyTurnEconomy,
} from "./model";

function cloneUnit(unit: UnitState): UnitState {
  const turn = unit.turn ?? makeEmptyTurnEconomy();
  return {
    ...unit,
    position: unit.position ? { ...unit.position } : null,
    charges: { ...unit.charges },
    cooldowns: { ...unit.cooldowns },
    turn: { ...turn },
  };
}

function maskStealthedEnemy(unit: UnitState): UnitState {
  const masked = cloneUnit(unit);
  masked.charges = {};
  masked.cooldowns = {};
  masked.stealthTurnsLeft = 0;
  masked.lastChargedTurn = undefined;
  return masked;
}

/**
 * Build a player-specific view of the game state.
 * - Friendly units are fully visible.
 * - Enemy stealthed units are hidden unless known.
 * - Known stealthed enemies are included but masked (no charges/cooldowns).
 */
export function makePlayerView(
  state: GameState,
  playerId: PlayerId
): GameState {
  const units: Record<string, UnitState> = {};

  for (const unit of Object.values(state.units)) {
    if (unit.owner === playerId) {
      units[unit.id] = cloneUnit(unit);
      continue;
    }

    if (!unit.isAlive) {
      units[unit.id] = cloneUnit(unit);
      continue;
    }

    if (unit.isStealthed) {
      const known = !!state.knowledge?.[playerId]?.[unit.id];
      if (!known) {
        continue;
      }
      units[unit.id] = maskStealthedEnemy(unit);
      continue;
    }

    units[unit.id] = cloneUnit(unit);
  }

  const knowledge = {
    P1: playerId === "P1" ? { ...(state.knowledge?.P1 ?? {}) } : {},
    P2: playerId === "P2" ? { ...(state.knowledge?.P2 ?? {}) } : {},
  };

  return {
    ...state,
    units,
    knowledge,
    turnOrder: [...state.turnOrder],
    placementOrder: [...state.placementOrder],
    turnQueue: [...state.turnQueue],
    initiative: { ...state.initiative },
    unitsPlaced: { ...state.unitsPlaced },
    events: [],
  };
}
