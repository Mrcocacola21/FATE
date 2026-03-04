import type { Coord, GameEvent, GameState, UnitState } from "../../../model";
import { coordsEqual } from "../../../board";
import { applyStakeTriggerIfAny, evStealthRevealed, evUnitMoved } from "../../../core";
import type { RNG } from "../../../rng";
import { chebyshevDistance } from "./helpers";

function revealAdjacentStealthedEnemies(
  state: GameState,
  mover: UnitState
): { state: GameState; events: GameEvent[] } {
  if (!mover.position) return { state, events: [] };
  const moverOwner = mover.owner;
  const moverPos = mover.position;
  let nextState = state;
  const events: GameEvent[] = [];

  for (const other of Object.values(nextState.units)) {
    if (!other.isAlive || !other.position) continue;
    if (other.owner === moverOwner) continue;
    if (!other.isStealthed) continue;

    const dist = chebyshevDistance(other.position, moverPos);
    if (dist > 1) continue;

    const revealed: UnitState = {
      ...other,
      isStealthed: false,
      stealthTurnsLeft: 0,
    };
    const updatedLastKnown = {
      ...nextState.lastKnownPositions,
      P1: { ...(nextState.lastKnownPositions?.P1 ?? {}) },
      P2: { ...(nextState.lastKnownPositions?.P2 ?? {}) },
    };
    delete updatedLastKnown.P1[revealed.id];
    delete updatedLastKnown.P2[revealed.id];

    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [revealed.id]: revealed,
      },
      knowledge: {
        ...nextState.knowledge,
        [moverOwner]: {
          ...(nextState.knowledge?.[moverOwner] ?? {}),
          [revealed.id]: true,
        },
      },
      lastKnownPositions: updatedLastKnown,
    };

    events.push(
      evStealthRevealed({
        unitId: revealed.id,
        reason: "adjacency",
        revealerId: mover.id,
      })
    );
  }

  return { state: nextState, events };
}

export function applyGroznyFreeMove(
  state: GameState,
  unit: UnitState,
  to: Coord,
  rng: RNG
): { state: GameState; events: GameEvent[]; unit: UnitState } {
  if (!unit.position || coordsEqual(unit.position, to)) {
    return { state, events: [], unit };
  }

  const from = unit.position;
  let movedUnit: UnitState = {
    ...unit,
    position: { ...to },
  };

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [movedUnit.id]: movedUnit,
    },
  };

  const events: GameEvent[] = [
    evUnitMoved({ unitId: movedUnit.id, from, to: movedUnit.position! }),
  ];

  const stakeResult = applyStakeTriggerIfAny(
    nextState,
    movedUnit,
    movedUnit.position!,
    rng
  );
  if (stakeResult.triggered) {
    nextState = stakeResult.state;
    movedUnit = stakeResult.unit;
    events.push(...stakeResult.events);
  }

  if (!movedUnit.isAlive || !movedUnit.position) {
    return { state: nextState, events, unit: movedUnit };
  }

  const revealResult = revealAdjacentStealthedEnemies(nextState, movedUnit);
  nextState = revealResult.state;
  events.push(...revealResult.events);

  return { state: nextState, events, unit: movedUnit };
}
