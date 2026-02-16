import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  UnitState,
} from "../../model";
import { coordsEqual, getUnitAt } from "../../board";
import { canAttackTarget } from "../../combat";
import { resolveAoE } from "../../aoe";
import { canDirectlyTargetUnit } from "../../visibility";
import {
  ABILITY_ASGORE_FIREBALL,
  ABILITY_ASGORE_FIRE_PARADE,
  ABILITY_ASGORE_SOUL_PARADE,
  TRICKSTER_AOE_RADIUS,
  getAbilitySpec,
  getCharges,
  spendCharges,
} from "../../abilities";
import { HERO_ASGORE_ID } from "../../heroes";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { makeAttackContext, requestRoll } from "../../core";
import { evAbilityUsed, evAoeResolved } from "../../core";
import type {
  AsgoreSoulParadeRollContext,
  TricksterAoEContext,
} from "../../pendingRoll/types";

interface FireballPayload {
  targetId?: string;
}

function isAsgore(unit: UnitState): boolean {
  return unit.heroId === HERO_ASGORE_ID;
}

function canUseAsClassAttack(
  state: GameState,
  attacker: UnitState,
  target: UnitState,
  unitClass: UnitState["class"]
): boolean {
  const classLikeAttacker: UnitState = {
    ...attacker,
    class: unitClass,
  };
  return canAttackTarget(state, classLikeAttacker, target);
}

function getAsgoreTargetIdsByClass(
  state: GameState,
  asgoreId: string,
  unitClass: UnitState["class"]
): string[] {
  const asgore = state.units[asgoreId];
  if (!asgore || !asgore.isAlive || !asgore.position || !isAsgore(asgore)) {
    return [];
  }

  return Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.id === asgore.id) return false;
      if (unit.owner === asgore.owner) return false;
      if (!canDirectlyTargetUnit(state, asgore.id, unit.id)) return false;
      return canUseAsClassAttack(state, asgore, unit, unitClass);
    })
    .map((unit) => unit.id)
    .sort();
}

export function getAsgorePatienceTargetIds(
  state: GameState,
  asgoreId: string
): string[] {
  return getAsgoreTargetIdsByClass(state, asgoreId, "assassin");
}

export function getAsgorePerseveranceTargetIds(
  state: GameState,
  asgoreId: string
): string[] {
  return getAsgoreTargetIdsByClass(state, asgoreId, "trickster");
}

export function getAsgoreJusticeTargetIds(
  state: GameState,
  asgoreId: string
): string[] {
  return getAsgoreTargetIdsByClass(state, asgoreId, "archer");
}

export function getAsgoreIntegrityDestinations(
  state: GameState,
  asgoreId: string
): Coord[] {
  const asgore = state.units[asgoreId];
  if (!asgore || !asgore.isAlive || !asgore.position || !isAsgore(asgore)) {
    return [];
  }

  const options: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const cell = { col, row };
      if (coordsEqual(cell, asgore.position)) continue;
      if (getUnitAt(state, cell)) continue;
      options.push(cell);
    }
  }
  return options;
}

function requestAsgoreClassAttack(
  state: GameState,
  unit: UnitState,
  targetId: string
): ApplyResult {
  const ctx = makeAttackContext({
    attackerId: unit.id,
    defenderId: targetId,
    ignoreRange: true,
    consumeSlots: false,
    queueKind: "normal",
  });
  const requested = requestRoll(
    state,
    unit.owner,
    "attack_attackerRoll",
    ctx,
    unit.id
  );
  return requested;
}

export function applyAsgoreFireball(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isAsgore(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as FireballPayload | undefined;
  const targetId = payload?.targetId;
  if (!targetId) {
    return { state, events: [] };
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }
  if (target.owner === unit.owner) {
    return { state, events: [] };
  }
  if (!canDirectlyTargetUnit(state, unit.id, target.id)) {
    return { state, events: [] };
  }
  if (!canUseAsClassAttack(state, unit, target, "archer")) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_ASGORE_FIREBALL);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(spent.unit, costs);
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  const requested = requestAsgoreClassAttack(nextState, updatedUnit, targetId);
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function applyAsgoreFireParade(
  state: GameState,
  unit: UnitState,
  rng: { next: () => number }
): ApplyResult {
  if (!isAsgore(unit) || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_ASGORE_FIRE_PARADE);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(spent.unit, costs);
  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];
  const center = updatedUnit.position;
  if (!center) {
    return { state: nextState, events };
  }

  const aoeRes = resolveAoE(
    nextState,
    updatedUnit.id,
    center,
    {
      radius: TRICKSTER_AOE_RADIUS,
      shape: "chebyshev",
      revealHidden: true,
      targetFilter: (target, caster) => target.id !== caster.id,
      abilityId: spec.id,
      emitEvent: false,
    },
    rng
  );
  nextState = aoeRes.nextState;
  events.push(...aoeRes.events);

  const affectedUnitIds = aoeRes.affectedUnitIds;
  const revealedUnitIds = aoeRes.revealedUnitIds;
  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: updatedUnit.id,
        abilityId: spec.id,
        casterId: updatedUnit.id,
        center: { ...center },
        radius: TRICKSTER_AOE_RADIUS,
        affectedUnitIds,
        revealedUnitIds,
        damagedUnitIds: [],
        damageByUnitId: {},
      })
    );
    return { state: nextState, events };
  }

  const queuedState: GameState = {
    ...nextState,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: updatedUnit.id,
      abilityId: spec.id,
      center: { ...center },
      radius: TRICKSTER_AOE_RADIUS,
      affectedUnitIds,
      revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };
  const ctx: TricksterAoEContext = {
    casterId: updatedUnit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };
  const requested = requestRoll(
    queuedState,
    updatedUnit.owner,
    "tricksterAoE_attackerRoll",
    ctx,
    updatedUnit.id
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function maybeTriggerAsgoreSoulParade(
  state: GameState,
  unitId: string
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position || !isAsgore(unit)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_ASGORE_SOUL_PARADE);
  if (!spec) {
    return { state, events: [] };
  }
  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  if (getCharges(unit, spec.id) < chargeAmount) {
    return { state, events: [] };
  }

  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = {
    ...spent.unit,
    asgorePatienceStealthActive: false,
  };
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];
  const requested = requestRoll(
    nextState,
    updatedUnit.owner,
    "asgoreSoulParadeRoll",
    { asgoreId: updatedUnit.id } satisfies AsgoreSoulParadeRollContext,
    updatedUnit.id
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function clearAsgoreTurnFlags(
  state: GameState,
  unitId: string | null
): GameState {
  if (!unitId) return state;
  const unit = state.units[unitId];
  if (!unit || !isAsgore(unit) || !unit.asgorePatienceStealthActive) {
    return state;
  }
  return {
    ...state,
    units: {
      ...state.units,
      [unit.id]: {
        ...unit,
        asgorePatienceStealthActive: false,
      },
    },
  };
}
