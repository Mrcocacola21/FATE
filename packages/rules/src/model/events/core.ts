import type { Coord, MoveMode, PlayerId } from "../shared";
import type {
  DiceRoll,
  RollKind,
  SearchStealthMode,
  StealthRevealReason,
} from "../roll";

export type CoreGameEvent =
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
