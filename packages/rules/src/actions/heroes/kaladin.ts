import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  UnitState,
} from "../../model";
import { isInsideBoard } from "../../model";
import type { RNG } from "../../rng";
import { resolveAoE } from "../../aoe";
import {
  ABILITY_KALADIN_FIFTH,
  ABILITY_KALADIN_FIRST,
  getAbilitySpec,
  spendCharges,
} from "../../abilities";
import { HERO_KALADIN_ID } from "../../heroes";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { requestRoll } from "../../shared/rollUtils";
import { evAbilityUsed, evAoeResolved, evUnitHealed } from "../../shared/events";
import type { TricksterAoEContext } from "../types";
import { getUnitBaseMaxHp } from "../shared";

interface AreaPayload {
  center?: Coord;
}

function isKaladin(unit: UnitState): boolean {
  return unit.heroId === HERO_KALADIN_ID;
}

export function hasKaladinMoveLock(unit: UnitState): boolean {
  return (unit.kaladinMoveLockSources?.length ?? 0) > 0;
}

export function addKaladinMoveLock(
  unit: UnitState,
  sourceUnitId: string
): UnitState {
  const sources = Array.isArray(unit.kaladinMoveLockSources)
    ? unit.kaladinMoveLockSources
    : [];
  if (sources.includes(sourceUnitId)) {
    return unit;
  }
  return {
    ...unit,
    kaladinMoveLockSources: [...sources, sourceUnitId],
  };
}

export function clearKaladinMoveLocksForCaster(
  state: GameState,
  casterUnitId: string
): GameState {
  let changed = false;
  const units: Record<string, UnitState> = { ...state.units };
  for (const [unitId, unit] of Object.entries(state.units)) {
    const sources = Array.isArray(unit.kaladinMoveLockSources)
      ? unit.kaladinMoveLockSources
      : [];
    if (!sources.includes(casterUnitId)) continue;
    changed = true;
    const filtered = sources.filter((source) => source !== casterUnitId);
    units[unitId] = {
      ...unit,
      kaladinMoveLockSources: filtered.length > 0 ? filtered : undefined,
    };
  }
  return changed ? { ...state, units } : state;
}

export function clearInvalidKaladinMoveLocks(state: GameState): GameState {
  let changed = false;
  const units: Record<string, UnitState> = { ...state.units };

  for (const [unitId, unit] of Object.entries(state.units)) {
    const sources = Array.isArray(unit.kaladinMoveLockSources)
      ? unit.kaladinMoveLockSources
      : [];
    if (sources.length === 0) continue;

    const filtered = sources.filter((sourceId) => {
      const source = state.units[sourceId];
      return !!source && source.isAlive && source.heroId === HERO_KALADIN_ID;
    });
    if (filtered.length === sources.length) continue;

    changed = true;
    units[unitId] = {
      ...unit,
      kaladinMoveLockSources: filtered.length > 0 ? filtered : undefined,
    };
  }

  return changed ? { ...state, units } : state;
}

export function applyKaladinFirst(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isKaladin(unit)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_KALADIN_FIRST);
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

  const maxHp = getUnitBaseMaxHp(spent.unit);
  const hpAfter = Math.min(maxHp, spent.unit.hp + 2);
  const healAmount = Math.max(0, hpAfter - spent.unit.hp);
  const updatedUnit = {
    ...spendSlots(spent.unit, costs),
    hp: hpAfter,
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
  if (healAmount > 0) {
    events.push(
      evUnitHealed({
        unitId: updatedUnit.id,
        amount: healAmount,
        hpAfter,
        sourceAbilityId: spec.id,
      })
    );
  }

  return { state: nextState, events };
}

export function applyKaladinFifth(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (!isKaladin(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as AreaPayload | undefined;
  const center = payload?.center;
  if (!center || !isInsideBoard(center, state.boardSize)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_KALADIN_FIFTH);
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

  const aoeRes = resolveAoE(
    nextState,
    updatedUnit.id,
    center,
    {
      radius: 2,
      shape: "chebyshev",
      revealHidden: true,
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
        center,
        radius: 2,
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
      center,
      radius: 2,
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
    damageOverride: 2,
    ignoreBonuses: true,
    immobilizeOnHit: true,
    immobilizeSourceId: updatedUnit.id,
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
