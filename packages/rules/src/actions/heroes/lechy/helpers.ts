import type { Coord, GameState, UnitState } from "../../../model";
import { getUnitAt } from "../../../board";
import { FOREST_AURA_RADIUS } from "../../../forest";
import { HERO_LECHY_ID } from "../../../heroes";

export function isLechy(unit: UnitState | undefined): unit is UnitState {
  return !!unit && unit.heroId === HERO_LECHY_ID;
}

export function getEmptyCellsInAura(state: GameState, origin: Coord): Coord[] {
  const positions: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const coord = { col, row };
      if (
        Math.max(Math.abs(coord.col - origin.col), Math.abs(coord.row - origin.row)) >
        FOREST_AURA_RADIUS
      ) {
        continue;
      }
      if (getUnitAt(state, coord)) continue;
      positions.push(coord);
    }
  }
  return positions;
}
