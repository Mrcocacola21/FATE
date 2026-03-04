import type { Coord } from "../model";

export const NEIGHBOR_OFFSETS: Coord[] = [
  { col: 0, row: -1 },
  { col: 1, row: -1 },
  { col: 1, row: 0 },
  { col: 1, row: 1 },
  { col: 0, row: 1 },
  { col: -1, row: 1 },
  { col: -1, row: 0 },
  { col: -1, row: -1 },
];
