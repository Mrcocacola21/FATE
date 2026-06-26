import type { Coord, GamePhase, GameState, PlayerId } from "../model";
import type { RuleDeclarationId } from "../ruleDeclarations";

export type DebugChargeMode = "set" | "add" | "fill" | "clear";

export type DebugUnitStatus =
  | "isStealthed"
  | "movementDisabledNextTurn"
  | "transformed"
  | "bunker"
  | "gutsBerserkModeActive"
  | "papyrusUnbelieverActive"
  | "papyrusBoneBlue"
  | "papyrusBoneOrange"
  | "sansUnbelieverUnlocked"
  | "mettatonExUnlocked"
  | "mettatonNeoUnlocked"
  | "undyneImmortalActive"
  | "chicken";

export type DebugPresetId =
  | "empty"
  | "basic-duel"
  | "aoe-cluster"
  | "line-attack"
  | "rider-path"
  | "stake-trigger"
  | "stealth-reveal"
  | "transformation"
  | "impulse"
  | "healing-status";

export type DebugStateCommand =
  | {
      type: "debugSpawnUnit";
      heroId: string;
      owner: PlayerId;
      coord: Coord;
      options?: {
        hp?: number;
        stealthed?: boolean;
        transformed?: boolean;
        charges?: "empty" | "full";
      };
    }
  | { type: "debugRemoveUnit"; unitId: string }
  | { type: "debugMoveUnit"; unitId: string; to: Coord }
  | { type: "debugSetHp"; unitId: string; hp: number }
  | { type: "debugDirectDamage"; unitId: string; amount: number }
  | {
      type: "debugSetCharges";
      unitId: string;
      abilityId?: string;
      value?: number;
      mode: DebugChargeMode;
    }
  | {
      type: "debugSetStatus";
      unitId: string;
      status: DebugUnitStatus;
      value: boolean;
    }
  | { type: "debugSetOwner"; unitId: string; owner: PlayerId }
  | {
      type: "debugSetMarkedTarget";
      sourceUnitId: string;
      targetUnitId: string;
      value: boolean;
    }
  | { type: "debugSetTurn"; player: PlayerId; unitId?: string | null }
  | { type: "debugSetPhase"; phase: GamePhase }
  | { type: "debugResetActions"; unitId?: string }
  | { type: "debugClearPendingRoll" }
  | {
      type: "debugSetRuleDeclaration";
      ruleId: RuleDeclarationId;
      chooserPlayer?: PlayerId;
      threshold?: number;
    }
  | {
      type: "debugAddMarker";
      marker: {
        kind: "stake" | "forest";
        owner: PlayerId;
        coord: Coord;
        revealed?: boolean;
      };
    }
  | {
      type: "debugRemoveMarker";
      kind: "stake" | "forest";
      markerId?: string;
      coord?: Coord;
    }
  | { type: "debugClearMarkers" }
  | { type: "debugClearBoard" }
  | { type: "debugApplyPreset"; presetId: DebugPresetId };

export interface DebugMutationResult {
  state: GameState;
  changed: boolean;
  error?: string;
}

export interface TestRoomSnapshot {
  version: 1;
  roomMode: "test";
  exportedAt: string;
  seed: number;
  revision: number;
  diceQueue: number[];
  state: GameState;
}
