import { coordsEqual, getUnitsAt } from "../board";
import type { ApplyResult, Coord, GameEvent, GameState, UnitState } from "../model";
import { isInsideBoard } from "../model";
import type { RNG } from "../rng";
import { rollDie } from "../rng";
import { canUnitEnterCell } from "../visibility";
import { applyGriffithFemtoRebirth } from "../actions/heroes/griffith";
import { NEIGHBOR_OFFSETS } from "./constants";

/**
 * Adjacent cells are always considered north first and then clockwise.
 * Filtering never changes that relative order, so a 1dN result maps
 * deterministically onto the remaining legal cells.
 */
export function getHiddenCollisionFreeCells(
  state: GameState,
  displacedUnitId: string,
): Coord[] {
  const displaced = state.units[displacedUnitId];
  if (!displaced?.isAlive || !displaced.position) return [];

  return NEIGHBOR_OFFSETS
    .map((offset) => ({
      col: displaced.position!.col + offset.col,
      row: displaced.position!.row + offset.row,
    }))
    .filter((candidate) => isInsideBoard(candidate, state.boardSize))
    .filter((candidate) => canUnitEnterCell(state, displaced.id, candidate));
}

function hasOverlap(state: GameState, unit: UnitState): boolean {
  if (!unit.position) return false;
  return getUnitsAt(state, unit.position).some((other) => other.id !== unit.id);
}

/**
 * Resolves one hidden-overlap collision without revealing the displaced unit.
 * The caller selects the hidden unit that was already on the entered cell.
 */
export function resolveHiddenOverlapCollision(
  state: GameState,
  displacedUnitId: string,
  rng: RNG,
): ApplyResult {
  const displaced = state.units[displacedUnitId];
  if (
    !displaced?.isAlive ||
    !displaced.position ||
    !hasOverlap(state, displaced)
  ) {
    return { state, events: [] };
  }

  const from = { ...displaced.position };
  const freeCells = getHiddenCollisionFreeCells(state, displaced.id);
  if (freeCells.length > 0) {
    const roll = rollDie(rng, freeCells.length);
    const to = freeCells[roll - 1]!;
    const moved: UnitState = { ...displaced, position: { ...to } };
    return {
      state: {
        ...state,
        units: {
          ...state.units,
          [moved.id]: moved,
        },
      },
      events: [
        {
          type: "hiddenCollisionResolved",
          displacedUnitId: moved.id,
          from,
          to,
          dieSides: freeCells.length,
          roll,
          damage: 0,
        },
        {
          type: "unitMoved",
          unitId: moved.id,
          from,
          to,
        },
      ],
    };
  }

  const hp = Math.max(0, displaced.hp - 1);
  const damaged: UnitState = {
    ...displaced,
    hp,
    ...(hp === 0 ? { isAlive: false, position: null } : {}),
  };
  const events: GameEvent[] = [
    {
      type: "hiddenCollisionResolved",
      displacedUnitId: damaged.id,
      from,
      dieSides: 0,
      damage: 1,
    },
  ];

  let finalUnit = damaged;
  if (hp === 0) {
    events.push({
      type: "unitDied",
      unitId: damaged.id,
      killerId: null,
    });
    const rebirth = applyGriffithFemtoRebirth(damaged, from);
    if (rebirth.transformed) {
      finalUnit = rebirth.unit;
      events.push(...rebirth.events);
    }
  }

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [finalUnit.id]: finalUnit,
      },
    },
    events,
  };
}

function positionChanged(previous: GameState, unit: UnitState): boolean {
  if (!unit.position) return false;
  const before = previous.units[unit.id]?.position;
  return !before || !coordsEqual(before, unit.position);
}

/**
 * Safety-net resolver for forced moves and teleports. Only a hidden figure that
 * was already on the destination is displaced; the entering figure stays put.
 */
export function resolveHiddenOverlapsAfterTransitions(
  previous: GameState,
  current: GameState,
  rng: RNG,
  options?: {
    entrantUnitIds?: readonly string[];
    alreadyResolvedUnitIds?: ReadonlySet<string>;
  },
): ApplyResult {
  const entrantIds =
    options?.entrantUnitIds ??
    Object.values(current.units)
      .filter((unit) => unit.isAlive && unit.position && positionChanged(previous, unit))
      .map((unit) => unit.id)
      .sort();
  const resolvedIds = new Set(options?.alreadyResolvedUnitIds ?? []);
  let nextState = current;
  const events: GameEvent[] = [];

  for (const entrantId of entrantIds) {
    const entrant = nextState.units[entrantId];
    if (!entrant?.isAlive || !entrant.position) continue;
    const priorEntrantPosition = previous.units[entrantId]?.position;
    if (priorEntrantPosition && coordsEqual(priorEntrantPosition, entrant.position)) continue;

    const hiddenOccupants = getUnitsAt(nextState, entrant.position)
      .filter((occupant) => occupant.id !== entrant.id && occupant.isStealthed)
      .filter((occupant) => {
        const before = previous.units[occupant.id]?.position;
        return !!before && coordsEqual(before, entrant.position!);
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const hidden of hiddenOccupants) {
      if (resolvedIds.has(hidden.id)) continue;
      const resolved = resolveHiddenOverlapCollision(nextState, hidden.id, rng);
      if (resolved.state === nextState && resolved.events.length === 0) continue;
      nextState = resolved.state;
      events.push(...resolved.events);
      resolvedIds.add(hidden.id);
    }
  }

  return { state: nextState, events };
}
