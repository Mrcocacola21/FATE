import type {
  Coord,
  GameEvent,
  MoveMode,
  PlayerId,
  RollKind,
  SearchStealthMode,
  StealthRevealReason,
} from "../model";

type RollRequestedEvent = Extract<GameEvent, { type: "rollRequested" }>;
type InitiativeRollRequestedEvent = Extract<
  GameEvent,
  { type: "initiativeRollRequested" }
>;
type InitiativeRolledEvent = Extract<GameEvent, { type: "initiativeRolled" }>;
type InitiativeResolvedEvent = Extract<
  GameEvent,
  { type: "initiativeResolved" }
>;
type PlacementStartedEvent = Extract<
  GameEvent,
  { type: "placementStarted" }
>;
type TurnStartedEvent = Extract<GameEvent, { type: "turnStarted" }>;
type RoundStartedEvent = Extract<GameEvent, { type: "roundStarted" }>;
type UnitPlacedEvent = Extract<GameEvent, { type: "unitPlaced" }>;
type UnitMovedEvent = Extract<GameEvent, { type: "unitMoved" }>;
type UnitDiedEvent = Extract<GameEvent, { type: "unitDied" }>;
type StealthEnteredEvent = Extract<GameEvent, { type: "stealthEntered" }>;
type SearchStealthEvent = Extract<GameEvent, { type: "searchStealth" }>;
type StealthRevealedEvent = Extract<GameEvent, { type: "stealthRevealed" }>;
type MoveOptionsGeneratedEvent = Extract<
  GameEvent,
  { type: "moveOptionsGenerated" }
>;
type MoveBlockedEvent = Extract<GameEvent, { type: "moveBlocked" }>;
type BunkerEnteredEvent = Extract<GameEvent, { type: "bunkerEntered" }>;
type BunkerEnterFailedEvent = Extract<
  GameEvent,
  { type: "bunkerEnterFailed" }
>;
type BunkerExitedEvent = Extract<GameEvent, { type: "bunkerExited" }>;
type AbilityUsedEvent = Extract<GameEvent, { type: "abilityUsed" }>;
type DamageBonusAppliedEvent = Extract<
  GameEvent,
  { type: "damageBonusApplied" }
>;
type BerserkerDefenseChosenEvent = Extract<
  GameEvent,
  { type: "berserkerDefenseChosen" }
>;
type IntimidateTriggeredEvent = Extract<
  GameEvent,
  { type: "intimidateTriggered" }
>;
type IntimidateResolvedEvent = Extract<
  GameEvent,
  { type: "intimidateResolved" }
>;
type StakesPlacedEvent = Extract<GameEvent, { type: "stakesPlaced" }>;
type StakeTriggeredEvent = Extract<GameEvent, { type: "stakeTriggered" }>;
type ForestActivatedEvent = Extract<GameEvent, { type: "forestActivated" }>;
type CarpetStrikeTriggeredEvent = Extract<
  GameEvent,
  { type: "carpetStrikeTriggered" }
>;
type CarpetStrikeCenterEvent = Extract<
  GameEvent,
  { type: "carpetStrikeCenter" }
>;
type CarpetStrikeAttackRolledEvent = Extract<
  GameEvent,
  { type: "carpetStrikeAttackRolled" }
>;
type AoeResolvedEvent = Extract<GameEvent, { type: "aoeResolved" }>;
type GameEndedEvent = Extract<GameEvent, { type: "gameEnded" }>;
type BattleStartedEvent = Extract<GameEvent, { type: "battleStarted" }>;

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

export function evUnitPlaced(params: {
  unitId: string;
  position: Coord;
}): UnitPlacedEvent {
  return {
    type: "unitPlaced",
    unitId: params.unitId,
    position: params.position,
  };
}

export function evUnitMoved(params: {
  unitId: string;
  from: Coord;
  to: Coord;
}): UnitMovedEvent {
  return {
    type: "unitMoved",
    unitId: params.unitId,
    from: params.from,
    to: params.to,
  };
}

export function evUnitDied(params: {
  unitId: string;
  killerId: string | null;
}): UnitDiedEvent {
  return {
    type: "unitDied",
    unitId: params.unitId,
    killerId: params.killerId,
  };
}

export function evStealthEntered(params: {
  unitId: string;
  success: boolean;
  roll?: number;
}): StealthEnteredEvent {
  if (params.roll === undefined) {
    return {
      type: "stealthEntered",
      unitId: params.unitId,
      success: params.success,
    };
  }
  return {
    type: "stealthEntered",
    unitId: params.unitId,
    success: params.success,
    roll: params.roll,
  };
}

export function evSearchStealth(params: {
  unitId: string;
  mode: SearchStealthMode;
  rolls: { targetId: string; roll: number; success: boolean }[];
}): SearchStealthEvent {
  return {
    type: "searchStealth",
    unitId: params.unitId,
    mode: params.mode,
    rolls: params.rolls,
  };
}

export function evStealthRevealed(params: {
  unitId: string;
  reason: StealthRevealReason;
  revealerId?: string;
}): StealthRevealedEvent {
  return {
    type: "stealthRevealed",
    unitId: params.unitId,
    reason: params.reason,
    revealerId: params.revealerId,
  };
}

export function evMoveOptionsGenerated(params: {
  unitId: string;
  roll: number | undefined;
  legalTo: Coord[];
  mode?: MoveMode;
  modes?: MoveMode[];
}): MoveOptionsGeneratedEvent {
  const event: MoveOptionsGeneratedEvent = {
    type: "moveOptionsGenerated",
    unitId: params.unitId,
    roll: params.roll,
    legalTo: params.legalTo,
  };
  if (params.mode !== undefined) {
    event.mode = params.mode;
  }
  if (params.modes !== undefined) {
    event.modes = params.modes;
  }
  return event;
}

export function evMoveBlocked(params: {
  unitId: string;
  reason: "noLegalDestinations";
}): MoveBlockedEvent {
  return {
    type: "moveBlocked",
    unitId: params.unitId,
    reason: params.reason,
  };
}

export function evBunkerEntered(params: {
  unitId: string;
  roll: number;
}): BunkerEnteredEvent {
  return {
    type: "bunkerEntered",
    unitId: params.unitId,
    roll: params.roll,
  };
}

export function evBunkerEnterFailed(params: {
  unitId: string;
  roll: number;
}): BunkerEnterFailedEvent {
  return {
    type: "bunkerEnterFailed",
    unitId: params.unitId,
    roll: params.roll,
  };
}

export function evBunkerExited(params: {
  unitId: string;
  reason: "timerExpired" | "attacked" | "transformed";
}): BunkerExitedEvent {
  return {
    type: "bunkerExited",
    unitId: params.unitId,
    reason: params.reason,
  };
}

export function evAbilityUsed(params: {
  unitId: string;
  abilityId: string;
}): AbilityUsedEvent {
  return {
    type: "abilityUsed",
    unitId: params.unitId,
    abilityId: params.abilityId,
  };
}

export function evDamageBonusApplied(params: {
  unitId: string;
  amount: number;
  source: "polkovodets";
  fromUnitId: string;
}): DamageBonusAppliedEvent {
  return {
    type: "damageBonusApplied",
    unitId: params.unitId,
    amount: params.amount,
    source: params.source,
    fromUnitId: params.fromUnitId,
  };
}

export function evBerserkerDefenseChosen(params: {
  defenderId: string;
  choice: "auto" | "roll";
}): BerserkerDefenseChosenEvent {
  return {
    type: "berserkerDefenseChosen",
    defenderId: params.defenderId,
    choice: params.choice,
  };
}

export function evIntimidateTriggered(params: {
  defenderId: string;
  attackerId: string;
  options: Coord[];
}): IntimidateTriggeredEvent {
  return {
    type: "intimidateTriggered",
    defenderId: params.defenderId,
    attackerId: params.attackerId,
    options: params.options,
  };
}

export function evIntimidateResolved(params: {
  attackerId: string;
  from: Coord;
  to: Coord;
}): IntimidateResolvedEvent {
  return {
    type: "intimidateResolved",
    attackerId: params.attackerId,
    from: params.from,
    to: params.to,
  };
}

export function evStakesPlaced(params: {
  owner: PlayerId;
  positions: Coord[];
  hiddenFromOpponent: boolean;
}): StakesPlacedEvent {
  return {
    type: "stakesPlaced",
    owner: params.owner,
    positions: params.positions,
    hiddenFromOpponent: params.hiddenFromOpponent,
  };
}

export function evStakeTriggered(params: {
  markerPos: Coord;
  unitId: string;
  damage: number;
  stopped: boolean;
  stakeIdsRevealed: string[];
}): StakeTriggeredEvent {
  return {
    type: "stakeTriggered",
    markerPos: params.markerPos,
    unitId: params.unitId,
    damage: params.damage,
    stopped: params.stopped,
    stakeIdsRevealed: params.stakeIdsRevealed,
  };
}

export function evForestActivated(params: {
  vladId: string;
  stakesConsumed: number;
}): ForestActivatedEvent {
  return {
    type: "forestActivated",
    vladId: params.vladId,
    stakesConsumed: params.stakesConsumed,
  };
}

export function evCarpetStrikeTriggered(params: {
  unitId: string;
}): CarpetStrikeTriggeredEvent {
  return {
    type: "carpetStrikeTriggered",
    unitId: params.unitId,
  };
}

export function evCarpetStrikeCenter(params: {
  unitId: string;
  dice: number[];
  sum: number;
  center: Coord;
  area: { shape: "square"; radius: 2 };
}): CarpetStrikeCenterEvent {
  return {
    type: "carpetStrikeCenter",
    unitId: params.unitId,
    dice: params.dice,
    sum: params.sum,
    center: params.center,
    area: params.area,
  };
}

export function evCarpetStrikeAttackRolled(params: {
  unitId: string;
  dice: number[];
  sum: number;
  center: Coord;
  affectedUnitIds: string[];
}): CarpetStrikeAttackRolledEvent {
  return {
    type: "carpetStrikeAttackRolled",
    unitId: params.unitId,
    dice: params.dice,
    sum: params.sum,
    center: params.center,
    affectedUnitIds: params.affectedUnitIds,
  };
}

export function evAoeResolved(params: {
  sourceUnitId: string;
  abilityId?: string;
  casterId?: string;
  center: Coord;
  radius: number;
  affectedUnitIds: string[];
  revealedUnitIds: string[];
  damagedUnitIds: string[];
  damageByUnitId?: Record<string, number>;
}): AoeResolvedEvent {
  return {
    type: "aoeResolved",
    sourceUnitId: params.sourceUnitId,
    abilityId: params.abilityId,
    casterId: params.casterId,
    center: params.center,
    radius: params.radius,
    affectedUnitIds: params.affectedUnitIds,
    revealedUnitIds: params.revealedUnitIds,
    damagedUnitIds: params.damagedUnitIds,
    damageByUnitId: params.damageByUnitId,
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
