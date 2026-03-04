import type { Coord } from "../model";

export function distanceInfo(attPos: Coord, defPos: Coord) {
  const dx = Math.abs(defPos.col - attPos.col);
  const dy = Math.abs(defPos.row - attPos.row);
  const cheb = Math.max(dx, dy);
  const sameRow = attPos.row === defPos.row;
  const sameCol = attPos.col === defPos.col;
  return { dx, dy, cheb, sameRow, sameCol };
}

export function isSpearmanReachTarget(attPos: Coord, defPos: Coord): boolean {
  const { dx, dy, cheb, sameRow, sameCol } = distanceInfo(attPos, defPos);
  if (cheb === 1) return true;
  if (cheb !== 2) return false;
  const isStraight = sameRow || sameCol;
  const isDiagonal = dx === dy;
  return isStraight || isDiagonal;
}

export function isTricksterReachTarget(attPos: Coord, defPos: Coord): boolean {
  const { cheb } = distanceInfo(attPos, defPos);
  return cheb > 0 && cheb <= 2;
}
