// packages/rules/src/legal.ts

import { Coord, GameState, LegalIntents, PlayerId } from "./model";
import { isCellOccupied } from "./board";
import { canAttackTarget } from "./combat";
import { canDirectlyTargetUnit } from "./visibility";
import { canSpendSlots } from "./turnEconomy";
import { HERO_GRAND_KAISER_ID } from "./heroes";

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
    (activeUnit.class === "assassin" || activeUnit.class === "archer") &&
    !kaiserTransformed &&
    !kaiserInBunker;

  return {
    canSearchMove,
    canSearchAction,
    searchMoveReason: canSearchMove ? undefined : "moveSlotUsed",
    searchActionReason: canSearchAction ? undefined : "actionSlotUsed",
    canMove,
    canAttack,
    canEnterStealth,
  };
}

