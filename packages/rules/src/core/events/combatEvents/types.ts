import type {
  Coord,
  GameEvent,
  MoveMode,
  PlayerId,
  RollKind,
  SearchStealthMode,
  StealthRevealReason,
} from "../../../model";

export type {
  Coord,
  MoveMode,
  PlayerId,
  RollKind,
  SearchStealthMode,
  StealthRevealReason,
};

export type RollRequestedEvent = Extract<GameEvent, { type: "rollRequested" }>;
export type InitiativeRollRequestedEvent = Extract<
  GameEvent,
  { type: "initiativeRollRequested" }
>;
export type InitiativeRolledEvent = Extract<
  GameEvent,
  { type: "initiativeRolled" }
>;
export type InitiativeResolvedEvent = Extract<
  GameEvent,
  { type: "initiativeResolved" }
>;
export type PlacementStartedEvent = Extract<
  GameEvent,
  { type: "placementStarted" }
>;
export type TurnStartedEvent = Extract<GameEvent, { type: "turnStarted" }>;
export type RoundStartedEvent = Extract<GameEvent, { type: "roundStarted" }>;
export type UnitPlacedEvent = Extract<GameEvent, { type: "unitPlaced" }>;
export type UnitMovedEvent = Extract<GameEvent, { type: "unitMoved" }>;
export type UnitDiedEvent = Extract<GameEvent, { type: "unitDied" }>;
export type StealthEnteredEvent = Extract<GameEvent, { type: "stealthEntered" }>;
export type SearchStealthEvent = Extract<GameEvent, { type: "searchStealth" }>;
export type StealthRevealedEvent = Extract<
  GameEvent,
  { type: "stealthRevealed" }
>;
export type MoveOptionsGeneratedEvent = Extract<
  GameEvent,
  { type: "moveOptionsGenerated" }
>;
export type MoveBlockedEvent = Extract<GameEvent, { type: "moveBlocked" }>;
export type BunkerEnteredEvent = Extract<GameEvent, { type: "bunkerEntered" }>;
export type BunkerEnterFailedEvent = Extract<
  GameEvent,
  { type: "bunkerEnterFailed" }
>;
export type BunkerExitedEvent = Extract<GameEvent, { type: "bunkerExited" }>;
export type AbilityUsedEvent = Extract<GameEvent, { type: "abilityUsed" }>;
export type MettatonRatingChangedEvent = Extract<
  GameEvent,
  { type: "mettatonRatingChanged" }
>;
export type UnitHealedEvent = Extract<GameEvent, { type: "unitHealed" }>;
export type DamageBonusAppliedEvent = Extract<
  GameEvent,
  { type: "damageBonusApplied" }
>;
export type BerserkerDefenseChosenEvent = Extract<
  GameEvent,
  { type: "berserkerDefenseChosen" }
>;
export type IntimidateTriggeredEvent = Extract<
  GameEvent,
  { type: "intimidateTriggered" }
>;
export type IntimidateResolvedEvent = Extract<
  GameEvent,
  { type: "intimidateResolved" }
>;
export type StakesPlacedEvent = Extract<GameEvent, { type: "stakesPlaced" }>;
export type StakeTriggeredEvent = Extract<GameEvent, { type: "stakeTriggered" }>;
export type ForestActivatedEvent = Extract<GameEvent, { type: "forestActivated" }>;
export type CarpetStrikeTriggeredEvent = Extract<
  GameEvent,
  { type: "carpetStrikeTriggered" }
>;
export type CarpetStrikeCenterEvent = Extract<
  GameEvent,
  { type: "carpetStrikeCenter" }
>;
export type CarpetStrikeAttackRolledEvent = Extract<
  GameEvent,
  { type: "carpetStrikeAttackRolled" }
>;
export type AoeResolvedEvent = Extract<GameEvent, { type: "aoeResolved" }>;
export type GameEndedEvent = Extract<GameEvent, { type: "gameEnded" }>;
export type BattleStartedEvent = Extract<GameEvent, { type: "battleStarted" }>;
