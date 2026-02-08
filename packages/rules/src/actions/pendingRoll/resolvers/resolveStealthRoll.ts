import type {
  ApplyResult,
  GameEvent,
  GameState,
  PlayerId,
  UnitState,
} from "../../../model";
import type { RNG } from "../../../rng";
import { rollD6 } from "../../../rng";
import { chebyshev } from "../../../board";
import { getUnitDefinition } from "../../../units";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { clearPendingRoll } from "../../utils/rollUtils";
import {
  evSearchStealth,
  evStealthEntered,
  evStealthRevealed,
} from "../../utils/events";

export function resolveEnterStealthRoll(
  state: GameState,
  unitId: string,
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!canSpendSlots(unit, { stealth: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = rollD6(rng);
  const def = getUnitDefinition(unit.class);
  let success = false;

  if (unit.class === "archer") {
    success = roll === 6;
  } else if (unit.class === "assassin") {
    success = roll >= 5;
  }

  const baseUnit: UnitState = spendSlots(unit, { stealth: true });
  const updated: UnitState = success
    ? {
        ...baseUnit,
        isStealthed: true,
        stealthTurnsLeft: def.maxStealthTurns ?? 3,
      }
    : {
        ...baseUnit,
      };

  const otherPlayer: PlayerId = unit.owner === "P1" ? "P2" : "P1";
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updated.id]: updated,
    },
    lastKnownPositions:
      success && updated.position
        ? {
            ...state.lastKnownPositions,
            [otherPlayer]: {
              ...(state.lastKnownPositions?.[otherPlayer] ?? {}),
              [updated.id]: { ...updated.position },
            },
          }
        : state.lastKnownPositions,
  };

  const events: GameEvent[] = [
    evStealthEntered({ unitId: updated.id, success, roll }),
  ];

  return { state: clearPendingRoll(nextState), events };
}

export function resolveSearchStealthRoll(
  state: GameState,
  unitId: string,
  mode: "action" | "move",
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const searchCosts = mode === "action" ? { action: true } : { move: true };
  if (!canSpendSlots(unit, searchCosts)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const units: Record<string, UnitState> = { ...state.units };
  const events: GameEvent[] = [];
  const rollResults: { targetId: string; roll: number; success: boolean }[] = [];
  const lastKnownPositions = {
    ...state.lastKnownPositions,
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };

  const candidates = Object.values(units).filter((candidate) => {
    if (!candidate.isAlive || !candidate.isStealthed || !candidate.position) {
      return false;
    }
    if (candidate.owner === unit.owner) {
      return false;
    }
    const dist = chebyshev(unit.position!, candidate.position);
    return dist <= 1;
  });

  if (candidates.length === 0) {
    return { state: clearPendingRoll(state), events: [] };
  }

  for (const candidate of candidates) {
    const roll = rollD6(rng);
    const success = roll >= 5;
    rollResults.push({ targetId: candidate.id, roll, success });
    if (!success) continue;

    const updatedHidden: UnitState = {
      ...candidate,
      isStealthed: false,
      stealthTurnsLeft: 0,
    };

    units[updatedHidden.id] = updatedHidden;
    delete lastKnownPositions.P1[updatedHidden.id];
    delete lastKnownPositions.P2[updatedHidden.id];

    events.push(
      evStealthRevealed({
        unitId: updatedHidden.id,
        reason: "search",
        revealerId: unit.id,
      })
    );
  }

  const updatedSearcher: UnitState = spendSlots(unit, searchCosts);
  units[updatedSearcher.id] = updatedSearcher;

  const newState: GameState = {
    ...state,
    units,
    knowledge: {
      ...state.knowledge,
      [unit.owner]: {
        ...(state.knowledge?.[unit.owner] ?? {}),
        ...(Object.values(units)
          .filter((u) => !u.isStealthed && u.owner !== unit.owner)
          .reduce<Record<string, boolean>>((acc, u) => {
            if (state.knowledge?.[unit.owner]?.[u.id]) return acc;
            acc[u.id] = true;
            return acc;
          }, {})),
      },
    },
    lastKnownPositions,
  };

  events.unshift(
    evSearchStealth({
      unitId: updatedSearcher.id,
      mode,
      rolls: rollResults,
    })
  );

  return { state: clearPendingRoll(newState), events };
}
