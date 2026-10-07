import { EVENT_VISIBILITY, movementVisibility } from "../../../model/events/visibility";
import type { GameState } from "../../../model";
import type { MovementProvenance, PlayerId } from "../../../model";
import type {
  AbilityUsedEvent,
  BerserkerDefenseChosenEvent,
  Coord,
  DamageBonusAppliedEvent,
  MettatonRatingChangedEvent,
  UnitDiedEvent,
  UnitHealedEvent,
  UnitMovedEvent,
  UnitPlacedEvent,
} from "./types";

export function evUnitPlaced(state: GameState, params: {
  unitId: string;
  position: Coord;
}): UnitPlacedEvent {
  return {
    type: "unitPlaced",
    [EVENT_VISIBILITY]: movementVisibility(state, params.unitId, params.position),
    unitId: params.unitId,
    position: params.position,
  };
}

export function evUnitMoved(state: GameState, params: {
  unitId: string;
  from: Coord;
  to: Coord;
  provenance: MovementProvenance;
}): UnitMovedEvent {
  return {
    type: "unitMoved",
    [EVENT_VISIBILITY]: movementVisibility(state, params.unitId, params.from, params.to),
    unitId: params.unitId,
    from: { ...params.from },
    to: { ...params.to },
    provenance: { ...params.provenance },
  };
}

export function evUnitDied(state: GameState, params: {
  unitId: string;
  killerId: string | null;
}): UnitDiedEvent {
  return {
    type: "unitDied",
    unitId: params.unitId,
    killerId: params.killerId,
    deathCell: state.units[params.unitId]?.position ? { ...state.units[params.unitId].position! } : null,
    [EVENT_VISIBILITY]: {
      recipients: [],
      deathCellRecipients: state.units[params.unitId]?.position
        ? movementVisibility(state, params.unitId, state.units[params.unitId].position!).recipients : [],
    },
  };
}

export function evAbilityUsed(params: {
  unitId: string;
  abilityId: string;
  abilityUseId?: string;
  recipients?: readonly (PlayerId | "spectator")[];
}): AbilityUsedEvent {
  return {
    type: "abilityUsed",
    unitId: params.unitId,
    abilityId: params.abilityId,
    abilityUseId: params.abilityUseId,
    ...(params.recipients ? { [EVENT_VISIBILITY]: { recipients: params.recipients, abilityRecipients: params.recipients } } : {}),
  };
}

export function evMettatonRatingChanged(params: {
  unitId: string;
  delta: number;
  now: number;
  reason:
    | "attackHit"
    | "defenseSuccess"
    | "defenseRoll"
    | "stagePhenomenon"
    | "abilitySpend";
}): MettatonRatingChangedEvent {
  return {
    type: "mettatonRatingChanged",
    unitId: params.unitId,
    delta: params.delta,
    now: params.now,
    reason: params.reason,
  };
}

export function evUnitHealed(params: {
  unitId: string;
  amount: number;
  hpAfter: number;
  sourceAbilityId?: string;
}): UnitHealedEvent {
  return {
    type: "unitHealed",
    unitId: params.unitId,
    amount: params.amount,
    hpAfter: params.hpAfter,
    sourceAbilityId: params.sourceAbilityId,
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
