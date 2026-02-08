import type { GameState, PlayerId, UnitState } from "../model";
import { makeEmptyTurnEconomy } from "../model";
import { getUnitDefinition } from "../units";
import { initUnitAbilities } from "../abilities";
import { getHeroDefinition, heroMatchesClass, type HeroSelection } from "../heroes";
import { getUnitBaseAttack, getUnitBaseMaxHp } from "./shared";
import { setupChikatiloFalseTrailForPlacement } from "./heroes/chikatilo";

function applyHeroOverrides(unit: UnitState): UnitState {
  const hero = getHeroDefinition(unit.heroId);
  if (!hero) return unit;
  return {
    ...unit,
    hp: hero.baseHpOverride ?? unit.hp,
    attack: hero.baseAttackOverride ?? unit.attack,
  };
}

export function createEmptyGame(): GameState {
  return {
    boardSize: 9,
    phase: "lobby",
    hostPlayerId: null,
    playersReady: { P1: false, P2: false },
    seats: { P1: false, P2: false },
    currentPlayer: "P1",
    turnNumber: 1,
    roundNumber: 1,

    activeUnitId: null,
    pendingMove: null,
    pendingRoll: null,
    pendingCombatQueue: [],
    pendingAoE: null,
    rollCounter: 0,
    stakeMarkers: [],
    stakeCounter: 0,
    turnOrder: [],
    turnOrderIndex: 0,
    placementOrder: [],
    turnQueue: [],
    turnQueueIndex: 0,

    units: {},
    events: [],

    initiative: { P1: null, P2: null, winner: null },
    placementFirstPlayer: null,
    arenaId: null,
    startingUnitId: null,
    unitsPlaced: { P1: 0, P2: 0 },
    knowledge: { P1: {}, P2: {} },
    lastKnownPositions: { P1: {}, P2: {} },
  };
}

// Создаём 7 фигур игрока с дефолтными статами и ещё без позиции
export function createDefaultArmy(
  player: PlayerId,
  selection?: HeroSelection
): UnitState[] {
  const classesOrder = [
    "rider",
    "spearman",
    "trickster",
    "assassin",
    "berserker",
    "archer",
    "knight",
  ] as const;

  return classesOrder.map((cls, index) => {
    const def = getUnitDefinition(cls);
    const id = `${player}-${cls}-${index + 1}`;
    const selectedHero = selection?.[cls];
    const figureId = selectedHero ?? undefined;
    const heroId = heroMatchesClass(selectedHero, cls) ? selectedHero : undefined;

    let unit: UnitState = {
      id,
      owner: player,
      class: def.class,
      figureId,
      heroId,
      hp: def.maxHp,
      attack: def.baseAttack,
      position: null,
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

    unit = initUnitAbilities(unit);
    unit = applyHeroOverrides({
      ...unit,
      hp: getUnitBaseMaxHp(unit),
      attack: getUnitBaseAttack(unit),
    });

    return unit;
  });
}

// Добавить армию в GameState
export function attachArmy(state: GameState, army: UnitState[]): GameState {
  const units = { ...state.units };
  for (const u of army) {
    units[u.id] = u;
  }
  return setupChikatiloFalseTrailForPlacement({ ...state, units });
}
