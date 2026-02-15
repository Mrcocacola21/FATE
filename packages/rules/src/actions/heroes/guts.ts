import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  UnitState,
} from "../../model";
import { canAttackTarget } from "../../combat";
import { resolveAoE } from "../../aoe";
import {
  ABILITY_GUTS_ARBALET,
  ABILITY_GUTS_BERSERK_MODE,
  ABILITY_GUTS_CANNON,
  ABILITY_GUTS_EXIT_BERSERK,
  getAbilitySpec,
  spendCharges,
} from "../../abilities";
import { HERO_GUTS_ID } from "../../heroes";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { requestRoll } from "../../shared/rollUtils";
import { makeAttackContext } from "../../shared/combatCtx";
import { evAbilityUsed } from "../../shared/events";
import type { TricksterAoEContext } from "../types";
import { applyGriffithFemtoRebirth } from "../../shared/griffith";

interface TargetPayload {
  targetId?: string;
}

function isGuts(unit: UnitState): boolean {
  return unit.heroId === HERO_GUTS_ID;
}

function canUseArcherLikeAttack(
  state: GameState,
  attacker: UnitState,
  target: UnitState
): boolean {
  const archerLikeAttacker: UnitState = {
    ...attacker,
    class: "archer",
  };
  return canAttackTarget(state, archerLikeAttacker, target);
}

function requestGutsRangedAttack(
  state: GameState,
  unit: UnitState,
  targetId: string,
  options?: {
    damageOverride?: number;
    ignoreBonuses?: boolean;
  }
): ApplyResult {
  const ctx = makeAttackContext({
    attackerId: unit.id,
    defenderId: targetId,
    ignoreRange: true,
    consumeSlots: false,
    queueKind: "normal",
    rangedAttack: true,
    damageOverride: options?.damageOverride,
    ignoreBonuses: options?.ignoreBonuses,
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

export function applyGutsArbalet(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isGuts(unit) || !unit.position) {
    return { state, events: [] };
  }
  const payload = action.payload as TargetPayload | undefined;
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
  if (!canUseArcherLikeAttack(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_GUTS_ARBALET);
  if (!spec) {
    return { state, events: [] };
  }
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(unit, costs);
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

  const requested = requestGutsRangedAttack(nextState, updatedUnit, targetId, {
    damageOverride: 1,
    ignoreBonuses: true,
  });
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function applyGutsCannon(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isGuts(unit) || !unit.position) {
    return { state, events: [] };
  }
  const payload = action.payload as TargetPayload | undefined;
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
  if (!canUseArcherLikeAttack(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_GUTS_CANNON);
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

  const requested = requestGutsRangedAttack(nextState, updatedUnit, targetId);
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function applyGutsBerserkMode(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isGuts(unit) || unit.gutsBerserkModeActive || unit.gutsBerserkExitUsed) {
    return { state, events: [] };
  }
  const spec = getAbilitySpec(ABILITY_GUTS_BERSERK_MODE);
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

  const updatedUnit: UnitState = {
    ...spendSlots(spent.unit, costs),
    gutsBerserkModeActive: true,
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
  return { state: nextState, events };
}

export function applyGutsExitBerserk(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (
    !isGuts(unit) ||
    !unit.gutsBerserkModeActive ||
    unit.gutsBerserkExitUsed
  ) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_GUTS_EXIT_BERSERK);
  if (!spec) {
    return { state, events: [] };
  }
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = {
    ...spendSlots(unit, costs),
    gutsBerserkModeActive: false,
    gutsBerserkExitUsed: true,
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
  return { state: nextState, events };
}

export function applyGutsBerserkAttack(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "attack" }>
): ApplyResult {
  if (!isGuts(unit) || !unit.gutsBerserkModeActive || !unit.position) {
    return { state, events: [] };
  }
  const origin = unit.position;
  const target = state.units[action.defenderId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }
  if (!canAttackTarget(state, unit, target)) {
    return { state, events: [] };
  }
  if (!canSpendSlots(unit, { attack: true, action: true })) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(unit, { attack: true, action: true });
  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const aoeRes = resolveAoE(
    nextState,
    updatedUnit.id,
    origin,
    {
      radius: 1,
      shape: "chebyshev",
      revealHidden: true,
      targetFilter: (targetUnit, caster) => targetUnit.id !== caster.id,
      abilityId: ABILITY_GUTS_BERSERK_MODE,
      emitEvent: false,
    },
    { next: () => 0.5 }
  );

  nextState = aoeRes.nextState;
  const events: GameEvent[] = [...aoeRes.events];
  const affectedUnitIds = aoeRes.affectedUnitIds;
  const revealedUnitIds = aoeRes.revealedUnitIds;
  if (affectedUnitIds.length === 0) {
    return { state: nextState, events };
  }

  const queuedState: GameState = {
    ...nextState,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: updatedUnit.id,
      abilityId: ABILITY_GUTS_BERSERK_MODE,
      center: { ...origin },
      radius: 1,
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

export function applyGutsEndTurnDrain(
  state: GameState,
  unitId: string | null
): ApplyResult {
  if (!unitId) {
    return { state, events: [] };
  }
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.gutsBerserkModeActive) {
    return { state, events: [] };
  }

  const hpAfter = Math.max(0, unit.hp - 1);
  const deathPosition = unit.position ? { ...unit.position } : null;
  let updatedUnit: UnitState = {
    ...unit,
    hp: hpAfter,
  };
  const events: GameEvent[] = [];
  if (hpAfter <= 0) {
    updatedUnit = {
      ...updatedUnit,
      isAlive: false,
      position: null,
    };
    events.push({
      type: "unitDied",
      unitId: updatedUnit.id,
      killerId: null,
    });
    const rebirth = applyGriffithFemtoRebirth(updatedUnit, deathPosition);
    if (rebirth.transformed) {
      updatedUnit = rebirth.unit;
      events.push(...rebirth.events);
    }
  }

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  return { state: nextState, events };
}
