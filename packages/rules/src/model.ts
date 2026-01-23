// packages/rules/src/model.ts

export type PlayerId = "P1" | "P2";

export type TurnSlot = "move" | "attack" | "action" | "stealth";

export interface TurnEconomy {
  moveUsed: boolean;
  attackUsed: boolean;
  actionUsed: boolean;
  stealthUsed: boolean;
}

export interface PendingMove {
  unitId: string;
  roll?: number;
  legalTo: Coord[];
  expiresTurnNumber: number;
}

// Классы фигур
export type UnitClass =
  | "spearman" // копейщик
  | "rider" // наездник
  | "trickster" // трюкач
  | "assassin" // убийца
  | "berserker" // берсерк
  | "archer" // лучник
  | "knight"; // рыцарь / сабер

// Координаты на поле 9×9
// col: 0..8 соответствует a..i
// row: 0..8 соответствует 0..8
export interface Coord {
  col: number;
  row: number;
}

// Фазы партии
export type GamePhase = "placement" | "battle" | "ended";

// Статическое описание класса (то, что не меняется в бою)
export interface UnitDefinition {
  class: UnitClass;
  maxHp: number;
  baseAttack: number;
  // базовые флаги
  canStealth: boolean;
  // максимальная длительность скрытности для этого класса
  maxStealthTurns?: number;
}

// Состояние конкретной фигуры в партии
export interface UnitState {
  id: string;
  owner: PlayerId;
  class: UnitClass;
  hp: number;
  attack: number;
  position: Coord | null;

  isStealthed: boolean;
  stealthTurnsLeft: number;
  stealthAttemptedThisTurn: boolean; // уже было

  turn: TurnEconomy;

  charges: Record<string, number>;
  cooldowns: Record<string, number>;

  /** Номер хода, на котором юнит в последний раз заряжал счётчики */
  lastChargedTurn?: number;

  /** Экономика хода фигуры */
  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  hasActedThisTurn: boolean;

  isAlive: boolean;
}

export function makeEmptyTurnEconomy(): TurnEconomy {
  return {
    moveUsed: false,
    attackUsed: false,
    actionUsed: false,
    stealthUsed: false,
  };
}


// Бросок кубов: 2к6, к6 и т.д.
export interface DiceRoll {
  dice: number[]; // например [3, 5] для 2к6
  sum: number;
  isDouble: boolean;
}

export type StealthRevealReason =
  | "search"
  | "timerExpired"
  | "aoeHit"
  | "forcedDisplacement"
  | "adjacency"
  | "attacked"
  | "steppedOnHidden";

export type RollKind =
  | "enterStealth"
  | "searchStealth"
  | "moveTrickster"
  | "moveBerserker"
  | "attackRoll"
  | "berserkerDefenseChoice";

export interface PendingRoll {
  id: string;
  player: PlayerId;
  kind: RollKind;
  context: Record<string, unknown>;
}

export type GameEvent =
  | {
      type: "turnStarted";
      player: PlayerId;
      turnNumber: number;
    }
  | {
      type: "roundStarted";
      roundNumber: number;
    }
  | {
      type: "unitPlaced";
      unitId: string;
      position: Coord;
    }
  | {
      type: "unitMoved";
      unitId: string;
      from: Coord;
      to: Coord;
    }
  | {
      type: "attackResolved";
      attackerId: string;
      defenderId: string;
      attackerRoll: DiceRoll;
      defenderRoll: DiceRoll;
      tieBreakDice?: { attacker: number[]; defender: number[] };
      hit: boolean;
      damage: number;
      defenderHpAfter: number;
    }
  | {
      type: "unitDied";
      unitId: string;
      killerId: string | null;
    }
  | {
      type: "stealthEntered";
      unitId: string;
      success?: boolean;
      roll?: number;
    }
  | {
      type: "searchStealth";
      unitId: string;
      mode: SearchStealthMode;
      rolls?: { targetId: string; roll: number; success: boolean }[];
     }   // 👈 НОВОЕ
  | {
      type: "stealthRevealed";
      unitId: string;
      reason: StealthRevealReason;
    }
  | {
      type: "rollRequested";
      rollId: string;
      kind: RollKind;
      player: PlayerId;
      actorUnitId?: string;
    }
  | {
      type: "berserkerDefenseChosen";
      defenderId: string;
      choice: "auto" | "roll";
    }
  | {
      type: "abilityUsed";
      unitId: string;
      abilityId: string;
    }
  | {
      type: "aoeResolved";
      sourceUnitId: string;
      abilityId?: string;
      casterId?: string;
      center: Coord;
      radius: number;
      affectedUnitIds: string[];
      revealedUnitIds: string[];
      damageByUnitId?: Record<string, number>;
    }
  | {
      type: "moveOptionsGenerated";
      unitId: string;
      roll?: number;
      legalTo: Coord[];
    }
    | {
      type: "initiativeRolled";
      rolls: { P1: number; P2: number };
      placementFirstPlayer: PlayerId;
    }
  | {
      type: "arenaChosen";
      arenaId: string;
    }
  | {
      type: "battleStarted";
      startingUnitId: string;
      startingPlayer: PlayerId;
    }
  | {
      type: "gameEnded";
      winner: PlayerId;
    };


    export type SearchStealthMode = "action" | "move";
    export type ResolveRollChoice = "auto" | "roll";

    export type GameAction =
    | {
        type: "rollInitiative";      // 👈 НОВОЕ
      }
    | {
        type: "chooseArena";        // 👈 НОВОЕ
        arenaId: string;
      }
    | {
        type: "placeUnit";
        unitId: string;
        position: Coord;
      }
    | {
        type: "move";
        unitId: string;
        to: Coord;
      }
    | {
        type: "requestMoveOptions";
        unitId: string;
      }
    | {
        type: "attack";
        attackerId: string;
        defenderId: string;
        defenderUseBerserkAutoDefense?: boolean;
      }
    | {
        type: "enterStealth";
        unitId: string;
      }
    | {
        type: "searchStealth";
        unitId: string;
        mode: SearchStealthMode;
      }
    | {
        type: "useAbility";
        unitId: string;
        abilityId: string;
        payload?: unknown;
      }
    | {
        type: "resolvePendingRoll";
        pendingRollId: string;
        choice?: ResolveRollChoice;
      }
    | {
        type: "endTurn";
      }
    | {
        type: "unitStartTurn";
        unitId: string;
      };

    



// Результат применения действия
export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

// Основной стейт игры
export interface GameState {
  boardSize: number;
  phase: "placement" | "battle" | "ended";
  currentPlayer: PlayerId;
  turnNumber: number;
  roundNumber: number;

  /**
   * Какая фигура сейчас активна в фазе battle.
   *
   * Порядок ходов всех фигур хранится в turnOrder/turnOrderIndex:
   *  - В начале глобального хода движок ожидает unitStartTurn
   *    именно для фигуры turnOrder[turnOrderIndex].
   *  - До unitStartTurn активной фигуры нет (null).
   */
  activeUnitId: string | null;
  pendingMove: PendingMove | null;
  pendingRoll: PendingRoll | null;
  rollCounter: number;

  /**
   * Глобальный порядок ходов фигур в бою (циклический список id),
   * формируется в фазе placement в порядке фактической расстановки.
   */
  turnOrder: string[];

  /**
   * Индекс «чья очередь ходить» в массиве turnOrder.
   *
   * В фазе battle:
   *  - unitStartTurn можно вызвать только для turnOrder[turnOrderIndex];
   *  - endTurn сдвигает индекс вперёд по кругу на следующую живую фигуру.
   */
  turnOrderIndex: number;

  /**
   * Порядок размещения фигур в placement (строго по факту успешных placeUnit).
   */
  placementOrder: string[];

  /**
   * Очередь ходов в бою (инициализируется из placementOrder при старте боя).
   */
  turnQueue: string[];

  /**
   * Индекс «чья очередь ходить» в turnQueue.
   */
  turnQueueIndex: number;

  units: Record<string, UnitState>;
  events: GameEvent[];

  /** Knowledge: for each player, which unitIds are known (visible) */
  knowledge: {
    [playerId in PlayerId]: { [unitId: string]: boolean };
  };

  /** Last known positions for each player (used for hidden units in views) */
  lastKnownPositions: {
    [playerId in PlayerId]: { [unitId: string]: Coord };
  };

  initiative: {
    P1: number | null;
    P2: number | null;
  };

  placementFirstPlayer: PlayerId | null;
  arenaId: string | null;

  /** Первая поставленная фигура — «ходит первой» */
  startingUnitId: string | null;

  unitsPlaced: {
    P1: number;
    P2: number;
  };
}

export interface LegalView {
  placementsByUnitId: Record<string, Coord[]>;
  movesByUnitId: Record<string, Coord[]>;
  attackTargetsByUnitId: Record<string, string[]>;
}

export type PlayerView = Omit<
  GameState,
  "knowledge" | "lastKnownPositions" | "pendingRoll" | "rollCounter"
> & {
  knowledge: {
    [playerId in PlayerId]: { [unitId: string]: boolean };
  };
  lastKnownPositions: { [unitId: string]: Coord };
  pendingRoll: PendingRoll | null;
  legal?: LegalView;
};






// Утилиты по координатам
export function coord(col: number, row: number): Coord {
  return { col, row };
}

export function isInsideBoard(c: Coord, size = 9): boolean {
  return c.col >= 0 && c.col < size && c.row >= 0 && c.row < size;
}

// Преобразование "a0" -> Coord и обратно
const COLS = "abcdefghi";

export function coordFromNotation(notation: string): Coord {
  if (notation.length !== 2) {
    throw new Error(`Invalid coord notation: ${notation}`);
  }
  const colChar = notation[0].toLowerCase();
  const rowChar = notation[1];
  const col = COLS.indexOf(colChar);
  const row = parseInt(rowChar, 10);
  if (col === -1 || isNaN(row)) {
    throw new Error(`Invalid coord notation: ${notation}`);
  }
  return { col, row };
}

export function coordToNotation(c: Coord): string {
  return `${COLS[c.col]}${c.row}`;
}
