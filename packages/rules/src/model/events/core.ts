import type { Coord, MoveMode, PlayerId } from "../shared";
import type { MovementProvenance } from "../semantic";
import type {
  CourtEffectId,
  CourtSide,
  MoonEffectId,
  RuleDeclarationId,
} from "../../ruleDeclarations/types";
import type {
  DiceRoll,
  RollKind,
  SearchStealthMode,
  StealthRevealReason,
} from "../roll";

export type CoreGameEvent =
  | {
      type: "combatVisualBatchReady";
      chainId: string;
      visualBatchId: string;
      isChainComplete: true;
      deferVisuals: false;
    }
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
      provenance: MovementProvenance;
    }
  | {
      type: "hiddenCollisionResolved";
      displacedUnitId: string;
      from: Coord;
      to?: Coord;
      dieSides: number;
      roll?: number;
      damage: 0 | 1;
    }
  | {
      type: "attackResolved";
      attackerId: string;
      defenderId: string;
      sourceCell: Coord | null;
      targetCell: Coord | null;
      attackerRoll: DiceRoll;
      defenderRoll: DiceRoll;
      /** False when an AoE event repeats an attacker roll already logged for another target. */
      attackerRollIsNew?: boolean;
      tieBreakDice?: { attacker: number[]; defender: number[] };
      hit: boolean;
      damage: number;
      defenderHpAfter: number;
      /** Visual snapshot metadata; authoritative HP remains on unit state. */
      previousHp?: number;
      nextHp?: number;
      maxHp?: number;
    }
  | {
      type: "unitDied";
      unitId: string;
      killerId: string | null;
      cause?: string;
      /** Null when death has no board position. */
      deathCell?: Coord | null;
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
    }
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
      type: "rollResolved";
      rollId: string;
      rollKind: RollKind;
      rollerPlayerId: PlayerId;
      unitId?: string;
      /** Index within one manual request (Search can draw for several candidates). */
      rollIndex: number;
      dice: number[];
      sides: number;
      total: number;
    }
  | {
      type: "snarePlaced";
      owner: PlayerId;
      sourceUnitId: string;
      cell: Coord;
    }
  | {
      type: "snareTriggered";
      unitId: string;
      cell: Coord;
      immobilized: true;
    }
  | {
      type: "pendingRollUnhandled";
      rollId: string;
      kind: string;
      player: PlayerId;
    }
  | {
      type: "initiativeRollRequested";
      rollId: string;
      player: PlayerId;
    }
  | {
      type: "initiativeRolled";
      rollId?: string;
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
      type: "ruleDeclarationSelected";
      ruleId: RuleDeclarationId;
      chooserPlayer: PlayerId;
    }
  | {
      type: "ruleDeclarationSetupCompleted";
      ruleId: RuleDeclarationId;
    }
  | {
      type: "courtRolesAssigned";
      attackerPlayer: PlayerId;
      defenderPlayer: PlayerId;
    }
  | {
      type: "courtRolesSwapped";
      attackerPlayer: PlayerId;
      defenderPlayer: PlayerId;
    }
  | {
      type: "courtRollResult";
      side: CourtSide;
      player: PlayerId;
      roll: number;
      effectId: CourtEffectId;
    }
  | {
      type: "courtEffectApplied";
      effectId: CourtEffectId;
      player: PlayerId;
      unitId?: string;
      targetId?: string;
      abilityId?: string;
      position?: Coord;
    }
  | {
      type: "chessKingSelected";
      player: PlayerId;
      unitId: string;
    }
  | {
      type: "chessKingDeathResolved";
      losingPlayer?: PlayerId;
      winner?: PlayerId;
      draw?: boolean;
    }
  | {
      type: "gameDraw";
    }
  | {
      type: "pureBloodRedirected";
      kingId: string;
      redirectedToUnitId: string;
      damage: number;
    }
  | {
      type: "moonRollResult";
      roll: number;
      effectId: MoonEffectId;
    }
  | {
      type: "moonEffectApplied";
      effectId: MoonEffectId;
      center?: Coord;
      centers?: Coord[];
      areaRadius?: number;
      affectedUnitIds?: string[];
      damagedUnitIds?: string[];
      swappedUnitIds?: string[];
    }
  | {
      type: "advantageThresholdDeclared";
      player: PlayerId;
      threshold: number;
    }
  | {
      type: "advantageWinTriggered";
      winner: PlayerId;
      threshold: number;
      P1living: number;
      P2living: number;
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
      provenance: { kind: "forced"; cause: "intimidatingStare" };
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
      /** Public completion only; hidden coordinates never cross this boundary. */
      type: "hiddenSetupCompleted";
      owner: PlayerId;
      ability: "vladStakes" | "hidden";
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
      rollId?: string;
      unitId: string;
      dice: number[];
      sum: number;
      center: Coord;
      area: { shape: "square"; radius: 2 };
    }
  | {
      type: "carpetStrikeAttackRolled";
      rollId?: string;
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
      sourceCell?: Coord;
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
      sourceCell?: Coord;
      abilityId?: string;
      casterId?: string;
      center: Coord;
      radius: number;
      affectedUnitIds: string[];
      revealedUnitIds: string[];
      damagedUnitIds: string[];
      damageByUnitId?: Record<string, number>;
      rollsByUnitId?: Record<string, number>;
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
