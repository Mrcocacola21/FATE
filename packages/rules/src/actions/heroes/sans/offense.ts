import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  UnitState,
} from "../../../model";
import { isInsideBoard } from "../../../model";
import { resolveAoE } from "../../../aoe";
import {
  ABILITY_SANS_BADASS_JOKE,
  ABILITY_SANS_GASTER_BLASTER,
  TRICKSTER_AOE_RADIUS,
  getAbilitySpec,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { evAbilityUsed, evAoeResolved, requestRoll } from "../../../core";
import type { TricksterAoEContext } from "../../../pendingRoll/types";
import {
  collectSansLineTargetIds,
  isSans,
  isSansCenterOnAttackLine,
} from "../../../sans";
import {
  LinePayload,
  parseCoord,
  requestSansQueuedAttacks,
  sortUnitIdsByReadingOrder,
} from "./helpers";

export function applySansGasterBlaster(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isSans(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  const payload = (action.payload ?? {}) as LinePayload;
  const target =
    parseCoord(payload.target) ??
    parseCoord(payload.line) ??
    parseCoord(payload.center);
  if (!target || !isInsideBoard(target, state.boardSize)) {
    return { state, events: [] };
  }
  if (!isSansCenterOnAttackLine(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_SANS_GASTER_BLASTER);
  if (!spec) return { state, events: [] };
  const chargeCost = spec.chargesPerUse ?? spec.chargeCost ?? 2;
  const spent = spendCharges(unit, spec.id, chargeCost);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit = spent.unit;
  const updatedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const targets = collectSansLineTargetIds(updatedState, updatedUnit, target);
  const queued = requestSansQueuedAttacks(
    updatedState,
    updatedUnit,
    ABILITY_SANS_GASTER_BLASTER,
    target,
    targets,
    { allowFriendlyTarget: true }
  );

  return {
    state: queued.state,
    events: [
      evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_SANS_GASTER_BLASTER }),
      ...queued.events,
    ],
  };
}

export function applySansBadassJoke(
  state: GameState,
  unit: UnitState,
  rng: { next: () => number }
): ApplyResult {
  if (!isSans(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_SANS_BADASS_JOKE);
  if (!spec) return { state, events: [] };

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }
  const chargeCost = spec.chargesPerUse ?? spec.chargeCost ?? 3;
  const spent = spendCharges(unit, spec.id, chargeCost);
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
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_SANS_BADASS_JOKE }),
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
      targetFilter: (target, caster) => target.owner !== caster.owner,
      abilityId: spec.id,
      emitEvent: false,
    },
    rng
  );
  nextState = aoeRes.nextState;
  events.push(...aoeRes.events);

  const affectedUnitIds = sortUnitIdsByReadingOrder(
    nextState,
    Array.from(new Set(aoeRes.affectedUnitIds))
  );
  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: updatedUnit.id,
        abilityId: spec.id,
        casterId: updatedUnit.id,
        center: { ...center },
        radius: TRICKSTER_AOE_RADIUS,
        affectedUnitIds,
        revealedUnitIds: aoeRes.revealedUnitIds,
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
      revealedUnitIds: aoeRes.revealedUnitIds,
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
