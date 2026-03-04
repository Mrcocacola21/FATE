import type {
  Coord,
  DiceRoll,
  GameState,
  UnitState,
} from "../../../model";
import { makeEmptyTurnEconomy } from "../../../model";
import { getUnitAt } from "../../../board";
import { getUnitDefinition } from "../../../units";
import { HERO_CHIKATILO_ID, HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import type { RNG } from "../../../rng";
import { rollD6 } from "../../../rng";

export function isChikatilo(unit: UnitState): boolean {
  return unit.heroId === HERO_CHIKATILO_ID;
}

export function isFalseTrailToken(unit: UnitState): boolean {
  return unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID;
}

export function parseCoord(value: unknown): Coord | null {
  if (!value || typeof value !== "object") return null;
  const col = (value as { col?: unknown }).col;
  const row = (value as { row?: unknown }).row;
  if (typeof col !== "number" || typeof row !== "number") return null;
  return { col, row };
}

function buildDiceRoll(base: number[], tieBreak: number[]): DiceRoll {
  const dice = [...base, ...tieBreak];
  const sum = dice.reduce((acc, v) => acc + v, 0);
  const isDouble = base.length >= 2 && base[0] === base[1];
  return { dice, sum, isDouble };
}

export function rollContest(rng: RNG): {
  attackerRoll: DiceRoll;
  defenderRoll: DiceRoll;
  tieBreakDice?: { attacker: number[]; defender: number[] };
  hit: boolean;
} {
  const attackerBase = [rollD6(rng), rollD6(rng)];
  const defenderBase = [rollD6(rng), rollD6(rng)];
  let attackerSum = attackerBase[0] + attackerBase[1];
  let defenderSum = defenderBase[0] + defenderBase[1];
  const tieBreakAttacker: number[] = [];
  const tieBreakDefender: number[] = [];

  const maxTieBreak = 12;
  while (attackerSum === defenderSum && tieBreakAttacker.length < maxTieBreak) {
    const att = rollD6(rng);
    const def = rollD6(rng);
    tieBreakAttacker.push(att);
    tieBreakDefender.push(def);
    attackerSum += att;
    defenderSum += def;
  }

  const attackerRoll = buildDiceRoll(attackerBase, tieBreakAttacker);
  const defenderRoll = buildDiceRoll(defenderBase, tieBreakDefender);
  return {
    attackerRoll,
    defenderRoll,
    tieBreakDice:
      tieBreakAttacker.length > 0
        ? { attacker: tieBreakAttacker, defender: tieBreakDefender }
        : undefined,
    hit: attackerSum > defenderSum,
  };
}

export function getEmptyCells(state: GameState): Coord[] {
  const cells: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const coord = { col, row };
      if (getUnitAt(state, coord)) continue;
      cells.push(coord);
    }
  }
  return cells;
}

export function insertTokenBefore(
  queue: string[],
  tokenId: string,
  unitId: string
): string[] {
  const filtered = queue.filter((id) => id !== tokenId);
  const index = filtered.indexOf(unitId);
  if (index < 0) {
    return [...filtered, tokenId];
  }
  return [...filtered.slice(0, index), tokenId, ...filtered.slice(index)];
}

export function getFalseTrailTokenId(chikatilo: UnitState): string {
  return chikatilo.chikatiloFalseTrailTokenId ?? `falseTrail-${chikatilo.id}`;
}

export function createFalseTrailToken(
  chikatilo: UnitState,
  position: Coord | null
): UnitState {
  const def = getUnitDefinition("assassin");
  return {
    id: getFalseTrailTokenId(chikatilo),
    owner: chikatilo.owner,
    class: "assassin",
    figureId: HERO_FALSE_TRAIL_TOKEN_ID,
    heroId: HERO_FALSE_TRAIL_TOKEN_ID,
    hp: def.maxHp,
    attack: def.baseAttack,
    position: position ? { ...position } : null,
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthAttemptedThisTurn: false,
    movementDisabledNextTurn: false,
    ownTurnsStarted: 0,
    turn: makeEmptyTurnEconomy(),
    charges: {},
    cooldowns: {},
    lastChargedTurn: undefined,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    genghisKhanDiagonalMoveActive: false,
    genghisKhanDecreeMovePending: false,
    genghisKhanMongolChargeActive: false,
    genghisKhanAttackedThisTurn: [],
    genghisKhanAttackedLastTurn: [],
    isAlive: true,
  };
}
