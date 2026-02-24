// packages/rules/src/model.ts

export type PlayerId = "P1" | "P2";

export type TurnSlot = "move" | "attack" | "action" | "stealth";

export type AbilityKind = "passive" | "active" | "impulse" | "phantasm";
export type AbilitySlot = "none" | "action" | "move" | "attack" | "stealth";

export interface AbilityView {
  id: string;
  name: string;
  kind: AbilityKind;
  description: string;
  slot: AbilitySlot;
  chargeRequired?: number;
  maxCharges?: number;
  chargeUnlimited?: boolean;
  currentCharges?: number;
  isAvailable: boolean;
  disabledReason?: string;
}

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
  mode?: MoveMode;
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

export type MoveMode = "normal" | UnitClass;

// Координаты на поле 9×9
// col: 0..8 соответствует a..i
// row: 0..8 соответствует 0..8
export interface Coord {
  col: number;
  row: number;
}

// Фазы партии
export type GamePhase = "lobby" | "placement" | "battle" | "ended";

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

export type PapyrusBoneType = "blue" | "orange";
export type PapyrusLineAxis = "row" | "col" | "diagMain" | "diagAnti";

export interface PapyrusBoneStatus {
  sourceUnitId: string;
  kind: PapyrusBoneType;
  /** Expires when source Papyrus reaches this own-turn counter at turn start. */
  expiresOnSourceOwnTurn: number;
  /** Blue Bone: remembers turnNumber when movement punishment already triggered. */
  bluePunishedTurnNumber?: number;
}

export interface SansBoneFieldStatus {
  kind: PapyrusBoneType;
  /** Applies only during this turn number. */
  turnNumber: number;
  /** Blue Bone: remembers turnNumber when movement punishment already triggered. */
  bluePunishedTurnNumber?: number;
}

// Состояние конкретной фигуры в партии
export interface UnitState {
  id: string;
  owner: PlayerId;
  class: UnitClass;
  figureId?: string;
  heroId?: string;
  hp: number;
  attack: number;
  position: Coord | null;

  isStealthed: boolean;
  stealthTurnsLeft: number;
  stealthSuccessMinRoll?: number;
  stealthAttemptedThisTurn: boolean; // уже было

  bunker?: { active: boolean; ownTurnsInBunker: number };
  transformed?: boolean;
  movementDisabledNextTurn?: boolean;
  ownTurnsStarted?: number;

  turn: TurnEconomy;

  charges: Record<string, number>;
  cooldowns: Record<string, number>;
  chikatiloMarkedTargets?: string[];
  chikatiloFalseTrailTokenId?: string;
  lechyGuideTravelerTargetId?: string;

  /** Номер хода, на котором юнит в последний раз заряжал счётчики */
  lastChargedTurn?: number;

  /** Экономика хода фигуры */
  hasMovedThisTurn: boolean;
  hasAttackedThisTurn: boolean;
  hasActedThisTurn: boolean;

  /** Genghis Khan: diagonal move enabled for current turn (Khan's Decree). */
  genghisKhanDiagonalMoveActive?: boolean;
  /** Genghis Khan: move allowed after decree even if move slot was consumed. */
  genghisKhanDecreeMovePending?: boolean;
  /** Genghis Khan: special move pending for Mongol Charge resolution. */
  genghisKhanMongolChargeActive?: boolean;
  /** Genghis Khan: targets attacked during this turn (for Legend of the Steppes). */
  genghisKhanAttackedThisTurn?: string[];
  /** Genghis Khan: targets attacked during previous turn (for Legend of the Steppes). */
  genghisKhanAttackedLastTurn?: string[];
  /** Guts: active Berserk Mode flag. */
  gutsBerserkModeActive?: boolean;
  /** Guts: exit from Berserk Mode was already consumed once per game. */
  gutsBerserkExitUsed?: boolean;
  /** Kaladin: move-consuming actions are blocked while list is non-empty. */
  kaladinMoveLockSources?: string[];
  /** Loki option 1: move-consuming actions are blocked while list is non-empty. */
  lokiMoveLockSources?: string[];
  /** Loki option 2/5: chicken status while list is non-empty. */
  lokiChickenSources?: string[];
  /** Frisk: Pacifism branch is permanently disabled after One Path trigger. */
  friskPacifismDisabled?: boolean;
  /** Frisk: next incoming attack automatically misses while this shield is active. */
  friskCleanSoulShield?: boolean;
  /** Frisk: tracks if Frisk attacked while stealthed since last stealth entry. */
  friskDidAttackWhileStealthedSinceLastEnter?: boolean;
  /** Frisk: next attack auto-hits and deals double damage. */
  friskPrecisionStrikeReady?: boolean;
  /** Frisk: kill count used by first/second+ kill bonuses. */
  friskKillCount?: number;
  /** Asgore Soul Parade (Patience): temporary stealth threshold (5-6) for current turn. */
  asgorePatienceStealthActive?: boolean;
  /** Asgore Soul Parade (Bravery): one-time auto-defense available. */
  asgoreBraveryAutoDefenseReady?: boolean;
  /** River Person: selected ally to carry during the next move resolution. */
  riverBoatCarryAllyId?: string;
  /** River Person: next move is granted by Boatman and should not spend move slot. */
  riverBoatmanMovePending?: boolean;
  /** Papyrus: one-time transformation state after allied hero death. */
  papyrusUnbelieverActive?: boolean;
  /** Papyrus: selected on-hit bone mode in Unbeliever state. */
  papyrusBoneMode?: PapyrusBoneType;
  /** Papyrus: whether basic attack is converted to line attack mode. */
  papyrusLongBoneMode?: boolean;
  /** Papyrus: selected line axis used by Cool Guy / Long Bone line picks. */
  papyrusLineAxis?: PapyrusLineAxis;
  /** Papyrus: active Blue/Orange status received from Papyrus attacks. */
  papyrusBoneStatus?: PapyrusBoneStatus;
  /** Sans: one-time Unbeliever transformation unlock after allied hero death. */
  sansUnbelieverUnlocked?: boolean;
  /** Sans: movement lock marker from Badass Joke (paired with movementDisabledNextTurn). */
  sansMoveLockArmed?: boolean;
  /** Sans: source id for the active movement lock marker. */
  sansMoveLockSourceId?: string;
  /** Sans Bone Field: temporary Blue/Orange hazard status for current turn. */
  sansBoneFieldStatus?: SansBoneFieldStatus;
  /** Sans Last Attack: cursed source Sans id. */
  sansLastAttackCurseSourceId?: string;
  /** Mettaton: hero-specific Rating counter. */
  mettatonRating?: number;
  /** Mettaton EX transformation unlock flag. */
  mettatonExUnlocked?: boolean;
  /** Mettaton NEO transformation unlock flag. */
  mettatonNeoUnlocked?: boolean;
  /** Undyne: one-time Immortal transformation already consumed. */
  undyneImmortalUsed?: boolean;
  /** Undyne: Immortal form is currently active. */
  undyneImmortalActive?: boolean;

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
  | "steppedOnHidden"
  | "stakeTriggered";

export type RollKind =
  | "enterStealth"
  | "enterBunker"
  | "searchStealth"
  | "moveTrickster"
  | "moveBerserker"
  | "initiativeRoll"
  | "attack_attackerRoll"
  | "attack_defenderRoll"
  | "berserkerDefenseChoice"
  | "odinMuninnDefenseChoice"
  | "riderPathAttack_attackerRoll"
  | "riderPathAttack_defenderRoll"
  | "tricksterAoE_attackerRoll"
  | "tricksterAoE_defenderRoll"
  | "elCidTisona_attackerRoll"
  | "elCidTisona_defenderRoll"
  | "elCidKolada_attackerRoll"
  | "elCidKolada_defenderRoll"
  | "dora_attackerRoll"
  | "dora_defenderRoll"
  | "dora_berserkerDefenseChoice"
  | "kaiserCarpetStrikeCenter"
  | "kaiserCarpetStrikeAttack"
  | "carpetStrike_defenderRoll"
  | "carpetStrike_berserkerDefenseChoice"
  | "elCidDuelistChoice"
  | "vladIntimidateChoice"
  | "vladPlaceStakes"
  | "vladForestChoice"
  | "vladForestTarget"
  | "vladForest_attackerRoll"
  | "vladForest_defenderRoll"
  | "vladForest_berserkerDefenseChoice"
  | "chikatiloFalseTrailPlacement"
  | "chikatiloDecoyChoice"
  | "falseTrailExplosion_attackerRoll"
  | "falseTrailExplosion_defenderRoll"
  | "chikatiloFalseTrailRevealChoice"
  | "lechyGuideTravelerPlacement"
  | "forestMoveCheck"
  | "forestMoveDestination"
  | "riverBoatCarryChoice"
  | "riverBoatDropDestination"
  | "riverTraLaLaTargetChoice"
  | "riverTraLaLaDestinationChoice"
  | "jebeHailOfArrows_attackerRoll"
  | "jebeHailOfArrows_defenderRoll"
  | "jebeHailOfArrows_berserkerDefenseChoice"
  | "jebeKhansShooterRicochetRoll"
  | "jebeKhansShooterTargetChoice"
  | "hassanTrueEnemyTargetChoice"
  | "hassanAssassinOrderSelection"
  | "asgoreSoulParadeRoll"
  | "asgoreSoulParadePatienceTargetChoice"
  | "asgoreSoulParadePerseveranceTargetChoice"
  | "asgoreSoulParadeJusticeTargetChoice"
  | "asgoreSoulParadeIntegrityDestination"
  | "asgoreBraveryDefenseChoice"
  | "lokiLaughtChoice"
  | "lokiChickenTargetChoice"
  | "lokiMindControlEnemyChoice"
  | "lokiMindControlTargetChoice"
  | "femtoDivineMoveRoll"
  | "femtoDivineMoveDestination"
  | "friskPacifismChoice"
  | "friskPacifismHugsTargetChoice"
  | "friskWarmWordsTargetChoice"
  | "friskWarmWordsHealRoll"
  | "friskGenocideChoice"
  | "friskKeenEyeChoice"
  | "friskSubstitutionChoice"
  | "friskChildsCryChoice";

export interface PendingRoll {
  id: string;
  player: PlayerId;
  kind: RollKind;
  context: Record<string, unknown>;
}

export interface StakeMarker {
  id: string;
  owner: PlayerId;
  position: Coord;
  createdAt: number;
  isRevealed: boolean;
}

export interface ForestMarker {
  owner: PlayerId;
  position: Coord;
}

export interface PendingCombatQueueEntry {
  attackerId: string;
  defenderId: string;
  ignoreRange?: boolean;
  ignoreStealth?: boolean;
  damageBonus?: number;
  damageBonusSourceId?: string;
  rangedAttack?: boolean;
  damageOverride?: number;
  ignoreBonuses?: boolean;
  consumeSlots?: boolean;
  kind: "riderPath" | "aoe";
}

export interface PendingAoEResolution {
  casterId: string;
  abilityId: string;
  center: Coord;
  radius: number;
  affectedUnitIds: string[];
  revealedUnitIds: string[];
  damagedUnitIds: string[];
  damageByUnitId: Record<string, number>;
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
      revealerId?: string;
    }
  | {
      type: "rollRequested";
      rollId: string;
      kind: RollKind;
      player: PlayerId;
      actorUnitId?: string;
    }
  | {
      type: "initiativeRollRequested";
      rollId: string;
      player: PlayerId;
    }
  | {
      type: "initiativeRolled";
      player: PlayerId;
      dice: number[];
      sum: number;
    }
  | {
      type: "initiativeResolved";
      winner: PlayerId;
      P1sum: number;
      P2sum: number;
    }
  | {
      type: "placementStarted";
      placementFirstPlayer: PlayerId;
    }
  | {
      type: "berserkerDefenseChosen";
      defenderId: string;
      choice: "auto" | "roll";
    }
  | {
      type: "damageBonusApplied";
      unitId: string;
      amount: number;
      source: "polkovodets";
      fromUnitId: string;
    }
  | {
      type: "chargesUpdated";
      unitId: string;
      deltas: Record<string, number>;
      now: Record<string, number>;
    }
  | {
      type: "bunkerEntered";
      unitId: string;
      roll: number;
    }
  | {
      type: "bunkerEnterFailed";
      unitId: string;
      roll: number;
    }
  | {
      type: "bunkerExited";
      unitId: string;
      reason: "timerExpired" | "attacked" | "transformed";
    }
  | {
      type: "intimidateTriggered";
      defenderId: string;
      attackerId: string;
      options: Coord[];
    }
  | {
      type: "intimidateResolved";
      attackerId: string;
      from: Coord;
      to: Coord;
    }
  | {
      type: "stakesPlaced";
      owner: PlayerId;
      positions: Coord[];
      hiddenFromOpponent: boolean;
    }
  | {
      type: "stakeTriggered";
      markerPos: Coord;
      unitId: string;
      damage: number;
      stopped: boolean;
      stakeIdsRevealed: string[];
    }
  | {
      type: "forestActivated";
      vladId: string;
      stakesConsumed: number;
    }
  | {
      type: "carpetStrikeTriggered";
      unitId: string;
    }
  | {
      type: "carpetStrikeCenter";
      unitId: string;
      dice: number[];
      sum: number;
      center: Coord;
      area: { shape: "square"; radius: 2 };
    }
  | {
      type: "carpetStrikeAttackRolled";
      unitId: string;
      dice: number[];
      sum: number;
      center: Coord;
      affectedUnitIds: string[];
    }
  | {
      type: "abilityUsed";
      unitId: string;
      abilityId: string;
    }
  | {
      type: "mettatonRatingChanged";
      unitId: string;
      delta: number;
      now: number;
      reason:
        | "attackHit"
        | "defenseSuccess"
        | "defenseRoll"
        | "stagePhenomenon"
        | "abilitySpend";
    }
  | {
      type: "papyrusUnbelieverActivated";
      papyrusId: string;
      fallenAllyId: string;
    }
  | {
      type: "papyrusBoneApplied";
      papyrusId: string;
      targetId: string;
      boneType: PapyrusBoneType;
      expiresOnSourceOwnTurn: number;
    }
  | {
      type: "papyrusBonePunished";
      papyrusId: string;
      targetId: string;
      boneType: PapyrusBoneType;
      damage: number;
      reason: "moveSpent" | "moveNotSpent";
      hpAfter: number;
    }
  | {
      type: "sansUnbelieverActivated";
      sansId: string;
      fallenAllyId: string;
    }
  | {
      type: "sansBadassJokeApplied";
      sansId: string;
      targetId: string;
    }
  | {
      type: "sansMoveDenied";
      unitId: string;
      sourceSansId?: string;
    }
  | {
      type: "sansBoneFieldActivated";
      sansId: string;
      duration: number;
    }
  | {
      type: "sansBoneFieldApplied";
      unitId: string;
      boneType: PapyrusBoneType;
      turnNumber: number;
    }
  | {
      type: "sansBoneFieldPunished";
      targetId: string;
      boneType: PapyrusBoneType;
      damage: number;
      reason: "moveSpent" | "moveNotSpent";
      hpAfter: number;
    }
  | {
      type: "sansLastAttackApplied";
      sansId: string;
      targetId: string;
    }
  | {
      type: "sansLastAttackTick";
      targetId: string;
      damage: number;
      hpAfter: number;
    }
  | {
      type: "sansLastAttackRemoved";
      targetId: string;
      reason: "hpOne" | "targetDead";
    }
  | {
      type: "unitHealed";
      unitId: string;
      amount: number;
      hpAfter: number;
      sourceAbilityId?: string;
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
      damagedUnitIds: string[];
      damageByUnitId?: Record<string, number>;
    }
  | {
      type: "moveOptionsGenerated";
      unitId: string;
      roll?: number;
      legalTo: Coord[];
      mode?: MoveMode;
      modes?: MoveMode[];
    }
  | {
      type: "moveBlocked";
      unitId: string;
      reason: "noLegalDestinations";
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
export type ResolveRollChoice =
  | "auto"
  | "roll"
  | "skip"
  | "activate"
  | "decoy"
  | "falseTrailExplode"
  | "falseTrailRemove"
  | "elCidDuelistContinue"
  | "elCidDuelistStop"
  | { type: "intimidatePush"; to: Coord }
  | { type: "placeStakes"; positions: Coord[] }
  | { type: "forestTarget"; center: Coord }
  | { type: "forestMoveDestination"; position: Coord }
  | { type: "chikatiloPlace"; position: Coord }
  | { type: "lechyGuideTravelerPlace"; position: Coord }
  | { type: "jebeKhansShooterTarget"; targetId: string }
  | { type: "hassanTrueEnemyTarget"; targetId: string }
  | { type: "hassanAssassinOrderPick"; unitIds: string[] }
  | { type: "asgoreSoulParadePatienceTarget"; targetId: string }
  | { type: "asgoreSoulParadePerseveranceTarget"; targetId: string }
  | { type: "asgoreSoulParadeJusticeTarget"; targetId: string }
  | { type: "asgoreSoulParadeIntegrityDestination"; position: Coord }
  | {
      type: "lokiLaughtOption";
      option:
        | "againSomeNonsense"
        | "chicken"
        | "mindControl"
        | "spinTheDrum"
        | "greatLokiJoke";
    }
  | { type: "lokiChickenTarget"; targetId: string }
  | { type: "lokiMindControlEnemy"; targetId: string }
  | { type: "lokiMindControlTarget"; targetId: string }
  | { type: "femtoDivineMoveDestination"; position: Coord }
  | {
      type: "friskPacifismOption";
      option: "hugs" | "childsCry" | "warmWords" | "powerOfFriendship";
    }
  | { type: "friskPacifismHugsTarget"; targetId: string }
  | { type: "friskWarmWordsTarget"; targetId: string }
  | {
      type: "friskGenocideOption";
      option: "substitution" | "keenEye" | "precisionStrike";
    }
  | { type: "friskKeenEyeTarget"; targetId: string };

    export type GameAction =
    | {
        type: "rollInitiative";      // 👈 НОВОЕ
      }
    | {
        type: "chooseArena";        // 👈 НОВОЕ
        arenaId: string;
      }
    | {
        type: "lobbyInit";
        host: PlayerId;
      }
    | {
        type: "setReady";
        player: PlayerId;
        ready: boolean;
      }
    | {
        type: "startGame";
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
        mode?: MoveMode;
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
        player: PlayerId;
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
  phase: "lobby" | "placement" | "battle" | "ended";
  hostPlayerId: PlayerId | null;
  playersReady: { P1: boolean; P2: boolean };
  seats: { P1: boolean; P2: boolean };
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
  pendingCombatQueue: PendingCombatQueueEntry[];
  pendingAoE: PendingAoEResolution | null;
  rollCounter: number;
  stakeMarkers: StakeMarker[];
  stakeCounter: number;
  forestMarkers: ForestMarker[];
  forestMarker: ForestMarker | null;

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
    winner: PlayerId | null;
  };

  placementFirstPlayer: PlayerId | null;
  arenaId: string | null;
  boneFieldTurnsLeft?: number;

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

export interface LegalIntents {
  canSearchMove: boolean;
  canSearchAction: boolean;
  searchMoveReason?: string;
  searchActionReason?: string;
  canMove: boolean;
  canAttack: boolean;
  canEnterStealth: boolean;
}

export interface AoEPreview {
  casterId: string;
  abilityId: string;
  center: Coord;
  radius: number;
}

export type PlayerView = Omit<
  GameState,
  | "knowledge"
  | "lastKnownPositions"
  | "pendingRoll"
  | "rollCounter"
  | "pendingCombatQueue"
  | "pendingAoE"
  | "stakeMarkers"
  | "stakeCounter"
> & {
  knowledge: {
    [playerId in PlayerId]: { [unitId: string]: boolean };
  };
  lastKnownPositions: { [unitId: string]: Coord };
  pendingRoll: PendingRoll | null;
  pendingCombatQueueCount: number;
  pendingAoEPreview: AoEPreview | null;
  stakeMarkers: { position: Coord; isRevealed: boolean }[];
  abilitiesByUnitId: Record<string, AbilityView[]>;
  legal?: LegalView;
  legalIntents?: LegalIntents;
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


