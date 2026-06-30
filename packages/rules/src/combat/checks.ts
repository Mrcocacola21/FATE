import type { GameState, UnitState } from "../model";
import {
  HERO_ASGORE_ID,
  HERO_FEMTO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_GUTS_ID,
  HERO_KALADIN_ID,
  HERO_SANS_ID,
  HERO_UNDYNE_ID,
} from "../heroes";
import { isStormActive, isStormExempt } from "../forest";
import {
  canUnitKnowUnitExactPosition,
  getLineBlockersForPlayer,
} from "../visibility";
import { canAttackAcrossRuleDeclarationBoundary } from "../ruleDeclarations";
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

  if (!canAttackAcrossRuleDeclarationBoundary(state, attacker, defender, false)) {
    return false;
  }

  if (defender.isStealthed) {
    if (!canUnitKnowUnitExactPosition(state, attacker, defender)) {
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

      const blockers = getLineBlockersForPlayer(
        state,
        attacker.owner,
        attPos,
        defPos,
        attacker.id
      );
      return blockers[0] === defender.id;
    }

    case "trickster": {
      return cheb > 0 && cheb <= 2;
    }

    default:
      return false;
  }
}
