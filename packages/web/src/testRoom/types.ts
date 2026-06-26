import type {
  Coord,
  GamePhase,
  PlayerId,
  RuleDeclarationId,
  TestRoomSnapshot,
} from "rules";

export type TestRoomCommand =
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
      mode: "set" | "add" | "fill" | "clear";
    }
  | {
      type: "debugSetStatus";
      unitId: string;
      status:
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
  | {
      type: "debugApplyPreset";
      presetId:
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
    }
  | { type: "debugSetDiceQueue"; values: number[] }
  | { type: "debugClearDiceQueue" }
  | { type: "debugSimulateStartTurn"; unitId: string }
  | { type: "debugTriggerRuleRoundEnd"; rolls?: number[] }
  | { type: "debugDeleteRoom" }
  | { type: "debugExportSnapshot" }
  | { type: "debugImportSnapshot"; snapshot: TestRoomSnapshot };
