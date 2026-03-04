import type {
  BattleStartedEvent,
  GameEndedEvent,
  InitiativeResolvedEvent,
  InitiativeRolledEvent,
  InitiativeRollRequestedEvent,
  PlacementStartedEvent,
  PlayerId,
  RollKind,
  RollRequestedEvent,
  RoundStartedEvent,
  TurnStartedEvent,
} from "./types";

export function evRollRequested(params: {
  rollId: string;
  kind: RollKind;
  player: PlayerId;
  actorUnitId?: string;
}): RollRequestedEvent {
  return {
    type: "rollRequested",
    rollId: params.rollId,
    kind: params.kind,
    player: params.player,
    actorUnitId: params.actorUnitId,
  };
}

export function evInitiativeRollRequested(params: {
  rollId: string;
  player: PlayerId;
}): InitiativeRollRequestedEvent {
  return {
    type: "initiativeRollRequested",
    rollId: params.rollId,
    player: params.player,
  };
}

export function evInitiativeRolled(params: {
  player: PlayerId;
  dice: number[];
  sum: number;
}): InitiativeRolledEvent {
  return {
    type: "initiativeRolled",
    player: params.player,
    dice: params.dice,
    sum: params.sum,
  };
}

export function evInitiativeResolved(params: {
  winner: PlayerId;
  P1sum: number;
  P2sum: number;
}): InitiativeResolvedEvent {
  return {
    type: "initiativeResolved",
    winner: params.winner,
    P1sum: params.P1sum,
    P2sum: params.P2sum,
  };
}

export function evPlacementStarted(params: {
  placementFirstPlayer: PlayerId;
}): PlacementStartedEvent {
  return {
    type: "placementStarted",
    placementFirstPlayer: params.placementFirstPlayer,
  };
}

export function evTurnStarted(params: {
  player: PlayerId;
  turnNumber: number;
}): TurnStartedEvent {
  return {
    type: "turnStarted",
    player: params.player,
    turnNumber: params.turnNumber,
  };
}

export function evRoundStarted(params: {
  roundNumber: number;
}): RoundStartedEvent {
  return {
    type: "roundStarted",
    roundNumber: params.roundNumber,
  };
}

export function evGameEnded(params: {
  winner: PlayerId;
}): GameEndedEvent {
  return {
    type: "gameEnded",
    winner: params.winner,
  };
}

export function evBattleStarted(params: {
  startingUnitId: string;
  startingPlayer: PlayerId;
}): BattleStartedEvent {
  return {
    type: "battleStarted",
    startingUnitId: params.startingUnitId,
    startingPlayer: params.startingPlayer,
  };
}
