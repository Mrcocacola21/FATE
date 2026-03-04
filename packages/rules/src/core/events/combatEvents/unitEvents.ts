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
