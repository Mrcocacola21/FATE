import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  UnitState,
} from "../../model";
import { isInsideBoard } from "../../model";
import { canDirectlyTargetUnit } from "../../visibility";
import {
  ABILITY_UNDYNE_ENERGY_SPEAR,
  ABILITY_UNDYNE_SPEAR_THROW,
  getAbilitySpec,
  spendCharges,
} from "../../abilities";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { evAbilityUsed, evAoeResolved, requestRoll } from "../../core";
import type { TricksterAoEContext } from "../../pendingRoll/types";
import {
  collectUndyneEnergySpearTargetIds,
  hasUndyneImmortalActive,
  isUndyne,
  isUndyneLineAxis,
  type UndyneLineAxis,
} from "../../undyne";
import {
  applyUndyneImmortalEndTurnDrain,
  applyUndyneImmortalFromDeaths,
  canUseShooterLikeAttack,
  parseCoord,
  requestUndyneSpearRain,
  requestUndyneThrowAttack,
} from "./undyneHelpers";

interface ThrowSpearPayload {
  targetId?: string;
}

interface EnergySpearPayload {
  target?: Coord;
  line?: Coord;
  center?: Coord;
  axis?: UndyneLineAxis;
}

export function applyUndyneSpearThrow(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isUndyne(unit) || !unit.position || !unit.isAlive) {
    return { state, events: [] };
  }

  const payload = action.payload as ThrowSpearPayload | undefined;
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
  if (!canUseShooterLikeAttack(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_UNDYNE_SPEAR_THROW);
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
  const events = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_UNDYNE_SPEAR_THROW }),
  ];

  const requested = hasUndyneImmortalActive(updatedUnit)
    ? requestUndyneSpearRain(nextState, updatedUnit, targetId)
    : requestUndyneThrowAttack(nextState, updatedUnit, targetId);
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function applyUndyneEnergySpear(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isUndyne(unit) || !unit.position || !unit.isAlive) {
    return { state, events: [] };
  }

  const payload = (action.payload ?? {}) as EnergySpearPayload;
  const target =
    parseCoord(payload.target) ??
    parseCoord(payload.line) ??
    parseCoord(payload.center);
  const axis: UndyneLineAxis = isUndyneLineAxis(payload.axis)
    ? payload.axis
    : "row";
  if (!target || !isInsideBoard(target, state.boardSize)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_UNDYNE_ENERGY_SPEAR);
  if (!spec) {
    return { state, events: [] };
  }

  const chargeCost = hasUndyneImmortalActive(unit)
    ? 0
    : spec.chargesPerUse ?? spec.chargeCost ?? 2;
  const spent = spendCharges(unit, spec.id, chargeCost);
  if (!spent.ok) {
    return { state, events: [] };
  }
  const updatedUnit = spent.unit;
  const baseState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const affectedUnitIds = collectUndyneEnergySpearTargetIds(
    baseState,
    updatedUnit.id,
    axis,
    target
  );

  if (affectedUnitIds.length === 0) {
    return {
      state: baseState,
      events: [
        evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_UNDYNE_ENERGY_SPEAR }),
        evAoeResolved({
          sourceUnitId: updatedUnit.id,
          abilityId: ABILITY_UNDYNE_ENERGY_SPEAR,
          casterId: updatedUnit.id,
          center: target,
          radius: 0,
          affectedUnitIds: [],
          revealedUnitIds: [],
          damagedUnitIds: [],
          damageByUnitId: {},
        }),
      ],
    };
  }

  const queuedState: GameState = {
    ...baseState,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: updatedUnit.id,
      abilityId: ABILITY_UNDYNE_ENERGY_SPEAR,
      center: target,
      radius: 0,
      affectedUnitIds,
      revealedUnitIds: [],
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };
  const ctx: TricksterAoEContext = {
    casterId: updatedUnit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
    allowFriendlyTarget: true,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
    damageOverride: 1,
    ignoreBonuses: true,
  };
  const requested = requestRoll(
    queuedState,
    updatedUnit.owner,
    "tricksterAoE_attackerRoll",
    ctx,
    updatedUnit.id
  );

  return {
    state: requested.state,
    events: [
      evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_UNDYNE_ENERGY_SPEAR }),
      ...requested.events,
    ],
  };
}

export function applyUndynePostAction(
  prevState: GameState,
  action: GameAction,
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  let nextState = state;
  let nextEvents = [...events];

  const drain = applyUndyneImmortalEndTurnDrain(nextState, prevState, action);
  nextState = drain.state;
  nextEvents = [...nextEvents, ...drain.events];

  const immortal = applyUndyneImmortalFromDeaths(nextState, prevState, nextEvents);
  nextState = immortal.state;
  nextEvents = [...nextEvents, ...immortal.events];

  return { state: nextState, events: nextEvents };
}
