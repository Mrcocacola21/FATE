// packages/rules/src/legal.ts

import { Coord, GameState, LegalIntents, PlayerId } from "./model";
import { isCellOccupied } from "./board";
import { canAttackTarget } from "./combat";
import { canDirectlyTargetUnit } from "./visibility";
import { canSpendSlots } from "./turnEconomy";
import {
  HERO_CHIKATILO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_GRAND_KAISER_ID,
  HERO_LECHY_ID,
} from "./heroes";

export function getLegalPlacements(state: GameState, unitId: string): Coord[] {
  if (state.phase !== "placement") return [];

  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || unit.position) return [];
  if (unit.owner !== state.currentPlayer) return [];

  if (unit.heroId === HERO_CHIKATILO_ID) {
    const tokenId =
      unit.chikatiloFalseTrailTokenId ?? `falseTrail-${unit.id}`;
    const token = state.units[tokenId];
    const hasToken =
      (token && token.isAlive && token.owner === unit.owner) ||
      Object.values(state.units).some(
        (u) =>
          u.isAlive &&
          u.owner === unit.owner &&
          u.heroId === HERO_FALSE_TRAIL_TOKEN_ID
      );
    if (hasToken) {
      return [];
    }
  }

  if (unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID) {
    const res: Coord[] = [];
    for (let col = 0; col < state.boardSize; col += 1) {
      for (let row = 0; row < state.boardSize; row += 1) {
        const dest: Coord = { col, row };
        if (isCellOccupied(state, dest)) continue;
        res.push(dest);
      }
    }
    return res;
  }

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
  if (attacker.heroId === HERO_FALSE_TRAIL_TOKEN_ID) return [];

  const targets: string[] = [];
  for (const defender of Object.values(state.units)) {
    if (!defender || !defender.isAlive || !defender.position) continue;
    if (!canDirectlyTargetUnit(state, attackerId, defender.id)) continue;
    if (!canAttackTarget(state, attacker, defender)) continue;
    targets.push(defender.id);
  }

  return targets;
}

export function getLegalIntents(
  state: GameState,
  viewerPlayerId: PlayerId
): LegalIntents {
  const baseBlocked =
    state.currentPlayer !== viewerPlayerId
      ? "notYourTurn"
      : !state.activeUnitId
      ? "noActiveUnit"
      : (() => {
          const activeUnit = state.units[state.activeUnitId!];
          if (!activeUnit || !activeUnit.isAlive || !activeUnit.position) {
            return "noActiveUnit";
          }
          if (activeUnit.owner !== viewerPlayerId) {
            return "activeUnitNotOwned";
          }
          if (state.pendingRoll) {
            return "pendingRollBlocking";
          }
          return undefined;
        })();

  if (baseBlocked) {
    return {
      canSearchMove: false,
      canSearchAction: false,
      searchMoveReason: baseBlocked,
      searchActionReason: baseBlocked,
      canMove: false,
      canAttack: false,
      canEnterStealth: false,
    };
  }

  const activeUnit = state.units[state.activeUnitId!];
  const canSearchMove = canSpendSlots(activeUnit, { move: true });
  const canSearchAction = canSpendSlots(activeUnit, { action: true });

  const canMove = canSpendSlots(activeUnit, { move: true });
  const canAttack = canSpendSlots(activeUnit, { attack: true, action: true });
  const kaiserTransformed =
    activeUnit.heroId === HERO_GRAND_KAISER_ID && activeUnit.transformed;
  const kaiserInBunker =
    activeUnit.heroId === HERO_GRAND_KAISER_ID && activeUnit.bunker?.active;
  const canEnterStealth =
    canSpendSlots(activeUnit, { stealth: true }) &&
    (activeUnit.class === "assassin" ||
      activeUnit.class === "archer" ||
      activeUnit.heroId === HERO_LECHY_ID) &&
    !kaiserTransformed &&
    !kaiserInBunker;
  const isFalseTrailToken = activeUnit.heroId === HERO_FALSE_TRAIL_TOKEN_ID;

  return {
    canSearchMove,
    canSearchAction,
    searchMoveReason: canSearchMove ? undefined : "moveSlotUsed",
    searchActionReason: canSearchAction ? undefined : "actionSlotUsed",
    canMove,
    canAttack: isFalseTrailToken ? false : canAttack,
    canEnterStealth: isFalseTrailToken ? false : canEnterStealth,
  };
}

