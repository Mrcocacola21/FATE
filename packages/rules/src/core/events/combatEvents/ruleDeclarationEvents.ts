import type {
  CourtEffectId,
  CourtSide,
  MoonEffectId,
  RuleDeclarationId,
} from "../../../ruleDeclarations/types";
import type { Coord, GameEvent, PlayerId } from "../../../model";

type EventOf<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;

export function evRuleDeclarationSelected(params: {
  ruleId: RuleDeclarationId;
  chooserPlayer: PlayerId;
}): EventOf<"ruleDeclarationSelected"> {
  return {
    type: "ruleDeclarationSelected",
    ruleId: params.ruleId,
    chooserPlayer: params.chooserPlayer,
  };
}

export function evRuleDeclarationSetupCompleted(params: {
  ruleId: RuleDeclarationId;
}): EventOf<"ruleDeclarationSetupCompleted"> {
  return {
    type: "ruleDeclarationSetupCompleted",
    ruleId: params.ruleId,
  };
}

export function evCourtRolesAssigned(params: {
  attackerPlayer: PlayerId;
  defenderPlayer: PlayerId;
}): EventOf<"courtRolesAssigned"> {
  return {
    type: "courtRolesAssigned",
    attackerPlayer: params.attackerPlayer,
    defenderPlayer: params.defenderPlayer,
  };
}

export function evCourtRolesSwapped(params: {
  attackerPlayer: PlayerId;
  defenderPlayer: PlayerId;
}): EventOf<"courtRolesSwapped"> {
  return {
    type: "courtRolesSwapped",
    attackerPlayer: params.attackerPlayer,
    defenderPlayer: params.defenderPlayer,
  };
}

export function evCourtRollResult(params: {
  side: CourtSide;
  player: PlayerId;
  roll: number;
  effectId: CourtEffectId;
}): EventOf<"courtRollResult"> {
  return {
    type: "courtRollResult",
    side: params.side,
    player: params.player,
    roll: params.roll,
    effectId: params.effectId,
  };
}

export function evCourtEffectApplied(params: {
  effectId: CourtEffectId;
  player: PlayerId;
  unitId?: string;
  targetId?: string;
  abilityId?: string;
  position?: Coord;
}): EventOf<"courtEffectApplied"> {
  return {
    type: "courtEffectApplied",
    effectId: params.effectId,
    player: params.player,
    unitId: params.unitId,
    targetId: params.targetId,
    abilityId: params.abilityId,
    position: params.position,
  };
}

export function evChessKingSelected(params: {
  player: PlayerId;
  unitId: string;
}): EventOf<"chessKingSelected"> {
  return {
    type: "chessKingSelected",
    player: params.player,
    unitId: params.unitId,
  };
}

export function evChessKingDeathResolved(params: {
  losingPlayer?: PlayerId;
  winner?: PlayerId;
  draw?: boolean;
}): EventOf<"chessKingDeathResolved"> {
  return {
    type: "chessKingDeathResolved",
    losingPlayer: params.losingPlayer,
    winner: params.winner,
    draw: params.draw,
  };
}

export function evGameDraw(): EventOf<"gameDraw"> {
  return { type: "gameDraw" };
}

export function evPureBloodRedirected(params: {
  kingId: string;
  redirectedToUnitId: string;
  damage: number;
}): EventOf<"pureBloodRedirected"> {
  return {
    type: "pureBloodRedirected",
    kingId: params.kingId,
    redirectedToUnitId: params.redirectedToUnitId,
    damage: params.damage,
  };
}

export function evMoonRollResult(params: {
  roll: number;
  effectId: MoonEffectId;
}): EventOf<"moonRollResult"> {
  return {
    type: "moonRollResult",
    roll: params.roll,
    effectId: params.effectId,
  };
}

export function evMoonEffectApplied(params: {
  effectId: MoonEffectId;
  center?: Coord;
  centers?: Coord[];
  areaRadius?: number;
  affectedUnitIds?: string[];
  damagedUnitIds?: string[];
  swappedUnitIds?: string[];
}): EventOf<"moonEffectApplied"> {
  return {
    type: "moonEffectApplied",
    effectId: params.effectId,
    center: params.center,
    centers: params.centers,
    areaRadius: params.areaRadius,
    affectedUnitIds: params.affectedUnitIds,
    damagedUnitIds: params.damagedUnitIds,
    swappedUnitIds: params.swappedUnitIds,
  };
}

export function evAdvantageThresholdDeclared(params: {
  player: PlayerId;
  threshold: number;
}): EventOf<"advantageThresholdDeclared"> {
  return {
    type: "advantageThresholdDeclared",
    player: params.player,
    threshold: params.threshold,
  };
}

export function evAdvantageWinTriggered(params: {
  winner: PlayerId;
  threshold: number;
  P1living: number;
  P2living: number;
}): EventOf<"advantageWinTriggered"> {
  return {
    type: "advantageWinTriggered",
    winner: params.winner,
    threshold: params.threshold,
    P1living: params.P1living,
    P2living: params.P2living,
  };
}
