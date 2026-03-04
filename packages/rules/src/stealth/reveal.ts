import type {
  Coord,
  GameEvent,
  GameState,
  StealthRevealReason,
  UnitState,
} from "../model";
import { isInsideBoard } from "../model";
import type { RNG } from "../rng";
import { applyGriffithFemtoRebirth } from "../actions/heroes/griffith";
import { NEIGHBOR_OFFSETS } from "./constants";

export function revealUnit(
  state: GameState,
  unitId: string,
  reason: StealthRevealReason,
  rng: RNG,
  revealerId?: string
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position || !unit.isStealthed) {
    return { state, events: [] };
  }

  let events: GameEvent[] = [];
  const nextState: GameState = {
    ...state,
    units: { ...state.units },
  };

  let updated: UnitState = {
    ...unit,
    isStealthed: false,
    stealthTurnsLeft: 0,
  };

  const basePos: Coord = updated.position!;

  const overlapping: UnitState[] = [];
  for (const other of Object.values(nextState.units)) {
    if (!other.isAlive || !other.position) continue;
    if (other.id === updated.id) continue;
    if (other.position.col === basePos.col && other.position.row === basePos.row) {
      overlapping.push(other);
    }
  }

  if (overlapping.length > 0) {
    const freeNeighbors: Coord[] = [];
    for (const offset of NEIGHBOR_OFFSETS) {
      const candidate: Coord = {
        col: basePos.col + offset.col,
        row: basePos.row + offset.row,
      };
      if (!isInsideBoard(candidate, nextState.boardSize)) continue;

      let occupied = false;
      for (const other of Object.values(nextState.units)) {
        if (!other.isAlive || !other.position) continue;
        if (other.id === updated.id) continue;
        if (
          other.position.col === candidate.col &&
          other.position.row === candidate.row
        ) {
          occupied = true;
          break;
        }
      }

      if (!occupied) {
        freeNeighbors.push(candidate);
      }
    }

    if (freeNeighbors.length > 0) {
      const index = Math.floor(rng.next() * freeNeighbors.length);
      const destination = freeNeighbors[index];
      const from: Coord = basePos;
      updated = { ...updated, position: destination };
      events.push({
        type: "unitMoved",
        unitId: updated.id,
        from,
        to: destination,
      });
    } else {
      const newHp = Math.max(0, updated.hp - 1);
      const deathPosition = updated.position ? { ...updated.position } : null;
      updated = {
        ...updated,
        hp: newHp,
      };
      if (newHp <= 0) {
        updated = {
          ...updated,
          isAlive: false,
          position: null,
        };
        events.push({
          type: "unitDied",
          unitId: updated.id,
          killerId: null,
        });
        const rebirth = applyGriffithFemtoRebirth(updated, deathPosition);
        if (rebirth.transformed) {
          updated = rebirth.unit;
          events = [...events, ...rebirth.events];
        }
      }
    }
  }

  nextState.units[updated.id] = updated;

  if (
    reason === "timerExpired" ||
    reason === "aoeHit" ||
    reason === "forcedDisplacement" ||
    reason === "stakeTriggered"
  ) {
    nextState.knowledge = {
      ...nextState.knowledge,
      P1: { ...(nextState.knowledge?.P1 ?? {}), [updated.id]: true },
      P2: { ...(nextState.knowledge?.P2 ?? {}), [updated.id]: true },
    };
  }

  const clearedLastKnown = {
    ...nextState.lastKnownPositions,
    P1: { ...(nextState.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(nextState.lastKnownPositions?.P2 ?? {}) },
  };
  delete clearedLastKnown.P1[updated.id];
  delete clearedLastKnown.P2[updated.id];
  nextState.lastKnownPositions = clearedLastKnown;

  events.push({
    type: "stealthRevealed",
    unitId: updated.id,
    reason,
    revealerId,
  });

  return { state: nextState, events };
}

export function revealStealthedInArea(
  state: GameState,
  center: Coord,
  radius: number,
  rng: RNG,
  targetFilter?: (unit: UnitState) => boolean
): { state: GameState; events: GameEvent[] } {
  let nextState: GameState = state;
  const events: GameEvent[] = [];

  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.isStealthed || !unit.position) continue;
    if (targetFilter && !targetFilter(unit)) continue;

    const dx = Math.abs(unit.position.col - center.col);
    const dy = Math.abs(unit.position.row - center.row);
    const distance = Math.max(dx, dy);

    if (distance <= radius) {
      const result = revealUnit(nextState, unit.id, "aoeHit", rng);
      nextState = result.state;
      events.push(...result.events);
    }
  }

  return { state: nextState, events };
}
