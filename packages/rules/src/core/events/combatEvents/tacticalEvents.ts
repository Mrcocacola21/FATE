import { EVENT_VISIBILITY, movementVisibility } from "../../../model/events/visibility";
import type { GameState } from "../../../model";
import { HERO_VLAD_TEPES_ID } from "../../../heroes";
import { ABILITY_VLAD_INTIMIDATE } from "../../../abilities/constants";
import type {
  AoeResolvedEvent,
  CarpetStrikeAttackRolledEvent,
  CarpetStrikeCenterEvent,
  CarpetStrikeTriggeredEvent,
  Coord,
  ForestActivatedEvent,
  IntimidateResolvedEvent,
  IntimidateTriggeredEvent,
  PlayerId,
  StakeTriggeredEvent,
  StakesPlacedEvent,
} from "./types";

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

export function evIntimidateResolved(
  state: GameState,
  params: {
    attackerId: string;
    defenderId?: string;
    from: Coord;
    to: Coord;
  },
): IntimidateResolvedEvent {
  const source = params.defenderId ? state.units[params.defenderId] : undefined;
  const isVlad = source?.heroId === HERO_VLAD_TEPES_ID;
  return {
    type: "intimidateResolved",
    provenance: { kind: "forced", cause: "intimidatingStare" },
    ...(isVlad ? { abilityId: ABILITY_VLAD_INTIMIDATE } : {}),
    [EVENT_VISIBILITY]: {
      ...movementVisibility(state, params.attackerId, params.from, params.to),
      abilityRecipients:
        isVlad && source?.position
          ? movementVisibility(state, source.id, source.position).recipients
          : [],
    },
    attackerId: params.attackerId,
    from: { ...params.from },
    to: { ...params.to },
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
    markerPos: { ...params.markerPos },
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
    center: { ...params.center },
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
    center: { ...params.center },
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
    center: { ...params.center },
    radius: params.radius,
    affectedUnitIds: params.affectedUnitIds,
    revealedUnitIds: params.revealedUnitIds,
    damagedUnitIds: params.damagedUnitIds,
    damageByUnitId: params.damageByUnitId,
  };
}
