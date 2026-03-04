import type { GameState, UnitState } from "../model";
import { getUnitAt } from "../board";
import {
  HERO_ASGORE_ID,
  HERO_CHIKATILO_ID,
  HERO_FEMTO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_GUTS_ID,
  HERO_KALADIN_ID,
  HERO_ODIN_ID,
  HERO_SANS_ID,
  HERO_UNDYNE_ID,
} from "../heroes";
import { isStormActive, isStormExempt } from "../forest";
import { canSeeStealthedTarget } from "../visibility";
import { distanceInfo, isSpearmanReachTarget, isTricksterReachTarget } from "./math";

export function canAttackTarget(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
  options?: { allowFriendlyTarget?: boolean }
): boolean {
  if (!attacker.isAlive || !defender.isAlive) return false;
  if (!attacker.position || !defender.position) return false;
  if (attacker.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return false;

  if (!options?.allowFriendlyTarget && attacker.owner === defender.owner) {
    return false;
  }

  if (defender.isStealthed) {
    const marked =
      attacker.heroId === HERO_CHIKATILO_ID &&
      Array.isArray(attacker.chikatiloMarkedTargets) &&
      attacker.chikatiloMarkedTargets.includes(defender.id);
    if (!marked && !canSeeStealthedTarget(state, attacker, defender)) {
      return false;
    }
  }

  const attPos = attacker.position;
  const defPos = defender.position;
  const { dx, dy, cheb, sameRow, sameCol } = distanceInfo(attPos, defPos);
  const attackerClass =
    attacker.heroId === HERO_FEMTO_ID ||
    attacker.heroId === HERO_UNDYNE_ID ||
    (attacker.heroId === HERO_ASGORE_ID && attacker.class === "knight") ||
    (attacker.heroId === HERO_GUTS_ID &&
      attacker.gutsBerserkModeActive &&
      attacker.class !== "archer")
      ? "spearman"
      : attacker.class;

  if (isStormActive(state) && !isStormExempt(state, attacker)) {
    if (cheb > 1) return false;
  }

  switch (attackerClass) {
    case "spearman": {
      if (isSpearmanReachTarget(attPos, defPos)) return true;
      if (attacker.heroId === HERO_KALADIN_ID) {
        return isTricksterReachTarget(attPos, defPos);
      }
      return false;
    }

    case "rider":
    case "knight":
    case "assassin":
    case "berserker": {
      return cheb === 1;
    }

    case "archer": {
      const isStraight = sameRow || sameCol;
      const isDiagonal = dx === dy;
      if (!isStraight && !isDiagonal) return false;

      const stepCol = Math.sign(defPos.col - attPos.col);
      const stepRow = Math.sign(defPos.row - attPos.row);
      if (stepCol === 0 && stepRow === 0) return false;

      let col = attPos.col + stepCol;
      let row = attPos.row + stepRow;
      let firstEnemy: UnitState | null = null;

      while (
        col >= 0 &&
        col < state.boardSize &&
        row >= 0 &&
        row < state.boardSize
      ) {
        const unitOnLine = getUnitAt(state, { col, row });
        if (unitOnLine) {
          if (unitOnLine.owner !== attacker.owner) {
            firstEnemy = unitOnLine;
            break;
          }
        }

        col += stepCol;
        row += stepRow;
      }

      return !!firstEnemy && firstEnemy.id === defender.id;
    }

    case "trickster": {
      return cheb > 0 && cheb <= 2;
    }

    default:
      return false;
  }
}
