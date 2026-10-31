import { resolveUnitDeath } from "../death";
import { EVENT_VISIBILITY, movementVisibility } from "../model/events/visibility";
import { getUnitsAt } from "../board";
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
 * Moves one unit off a shared cell, or deals it 1 damage when no cell is free.
 * This never changes stealth; callers apply it to a unit that was just revealed.
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
          [EVENT_VISIBILITY]: movementVisibility(state, moved.id, from, to),
          displacedUnitId: moved.id,
          from: { ...from },
          to: { ...to },
          dieSides: freeCells.length,
          roll,
          damage: 0,
        },
        {
          type: "unitMoved",
          provenance: { kind: "forced", cause: "hiddenCollision" },
          [EVENT_VISIBILITY]: movementVisibility(state, moved.id, from, to),
          unitId: moved.id,
          from: { ...from },
          to: { ...to },
        },
      ],
    };
  }

  const hp = Math.max(0, displaced.hp - 1);
  const damaged: UnitState = {
    ...displaced,
    hp,
  };
  const events: GameEvent[] = [
    {
      type: "hiddenCollisionResolved",
      [EVENT_VISIBILITY]: movementVisibility(state, damaged.id, from),
      displacedUnitId: damaged.id,
      from,
      dieSides: 0,
      damage: 1,
    },
  ];

  let finalUnit = damaged;
  if (hp === 0) {
    finalUnit = resolveUnitDeath(damaged, null, events);
    const rebirth = applyGriffithFemtoRebirth(finalUnit, from);
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

/**
 * Figures may share a cell with an unseen hidden unit; it only has to move once
 * revealed. revealUnit handles this itself, so this catches the paths that clear
 * stealth directly, such as attacking from hiding.
 */
export function resolveRevealedOverlaps(
  previous: GameState,
  current: GameState,
  rng: RNG,
  alreadyResolvedUnitIds?: ReadonlySet<string>,
): ApplyResult {
  // A transport and its passenger share one transit cell by design.
  const transit = current.pendingReactionMovement;
  const revealedIds = Object.values(current.units)
    .filter((unit) => !unit.isStealthed && previous.units[unit.id]?.isStealthed)
    .filter((unit) => !alreadyResolvedUnitIds?.has(unit.id))
    .filter((unit) => unit.id !== transit?.controllerUnitId && unit.id !== transit?.targetUnitId)
    .map((unit) => unit.id)
    .sort();

  let nextState = current;
  const events: GameEvent[] = [];
  for (const unitId of revealedIds) {
    const resolved = resolveHiddenOverlapCollision(nextState, unitId, rng);
    nextState = resolved.state;
    events.push(...resolved.events);
  }

  return { state: nextState, events };
}
