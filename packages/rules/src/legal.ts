// packages/rules/src/legal.ts

import { Coord, GameState } from "./model";
import { isCellOccupied } from "./board";
import { canAttackTarget } from "./combat";
import { canDirectlyTargetUnit } from "./visibility";

export function getLegalPlacements(state: GameState, unitId: string): Coord[] {
  if (state.phase !== "placement") return [];

  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || unit.position) return [];
  if (unit.owner !== state.currentPlayer) return [];

  const res: Coord[] = [];
  const backRow = unit.owner === "P1" ? 0 : state.boardSize - 1;

  for (let col = 1; col < state.boardSize - 1; col += 1) {
    const dest: Coord = { col, row: backRow };
    if (isCellOccupied(state, dest)) continue;
    res.push(dest);
  }

  return res;
}

export function getLegalAttackTargets(
  state: GameState,
  attackerId: string
): string[] {
  if (state.phase !== "battle") return [];

  const attacker = state.units[attackerId];
  if (!attacker || !attacker.isAlive || !attacker.position) return [];

  const targets: string[] = [];
  for (const defender of Object.values(state.units)) {
    if (!defender || !defender.isAlive || !defender.position) continue;
    if (!canDirectlyTargetUnit(state, attackerId, defender.id)) continue;
    if (!canAttackTarget(state, attacker, defender)) continue;
    targets.push(defender.id);
  }

  return targets;
}

