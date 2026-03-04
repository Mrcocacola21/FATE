import type { Coord, MoveMode, PlayerId } from "./shared";
import type { SearchStealthMode } from "./roll";

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
      type: "rollInitiative";
    }
  | {
      type: "chooseArena";
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
