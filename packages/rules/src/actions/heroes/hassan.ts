import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
  UnitState,
} from "../../model";
import { chebyshev } from "../../board";
import { canAttackTarget } from "../../combat";
import { canDirectlyTargetUnit } from "../../visibility";
import {
  ABILITY_HASSAN_TRUE_ENEMY,
  getAbilitySpec,
  spendCharges,
} from "../../abilities";
import { HERO_FALSE_TRAIL_TOKEN_ID, HERO_HASSAN_ID } from "../../heroes";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { requestRoll } from "../../shared/rollUtils";
import { evAbilityUsed } from "../../shared/events";
import type {
  HassanAssassinOrderSelectionContext,
  HassanTrueEnemyTargetChoiceContext,
} from "../types";

interface TrueEnemyPayload {
  forcedAttackerId?: string;
}

function isHassan(unit: UnitState): boolean {
  return unit.heroId === HERO_HASSAN_ID;
}

export function getHassanForcedAttackTargets(
  state: GameState,
  attackerId: string
): string[] {
  const attacker = state.units[attackerId];
  if (!attacker || !attacker.isAlive || !attacker.position) {
    return [];
  }

  const targets: string[] = [];
  for (const target of Object.values(state.units)) {
    if (!target || !target.isAlive || !target.position) continue;
    if (target.id === attacker.id) continue;
    if (!canDirectlyTargetUnit(state, attacker.id, target.id)) continue;
    if (!canAttackTarget(state, attacker, target, { allowFriendlyTarget: true })) {
      continue;
    }
    targets.push(target.id);
  }

  return targets.sort();
}

export function getHassanTrueEnemyCandidates(
  state: GameState,
  hassanId: string
): string[] {
  const hassan = state.units[hassanId];
  if (!hassan || !hassan.isAlive || !hassan.position || !isHassan(hassan)) {
    return [];
  }

  const candidates: string[] = [];
  for (const unit of Object.values(state.units)) {
    if (!unit || !unit.isAlive || !unit.position) continue;
    if (unit.owner === hassan.owner) continue;
    if (chebyshev(hassan.position, unit.position) > 2) continue;
    const targets = getHassanForcedAttackTargets(state, unit.id);
    if (targets.length === 0) continue;
    candidates.push(unit.id);
  }

  return candidates.sort();
}

export function applyHassanTrueEnemy(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isHassan(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as TrueEnemyPayload | undefined;
  const forcedAttackerId = payload?.forcedAttackerId;
  if (!forcedAttackerId) {
    return { state, events: [] };
  }

  const forcedAttacker = state.units[forcedAttackerId];
  if (!forcedAttacker || !forcedAttacker.isAlive || !forcedAttacker.position) {
    return { state, events: [] };
  }
  if (forcedAttacker.owner === unit.owner) {
    return { state, events: [] };
  }
  if (chebyshev(unit.position, forcedAttacker.position) > 2) {
    return { state, events: [] };
  }

  const legalForcedAttackers = getHassanTrueEnemyCandidates(state, unit.id);
  if (!legalForcedAttackers.includes(forcedAttackerId)) {
    return { state, events: [] };
  }

  const forcedTargets = getHassanForcedAttackTargets(state, forcedAttackerId);
  if (forcedTargets.length === 0) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_HASSAN_TRUE_ENEMY);
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

  const updatedHassan = spendSlots(spent.unit, costs);
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedHassan.id]: updatedHassan,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedHassan.id, abilityId: spec.id }),
  ];

  const ctx: HassanTrueEnemyTargetChoiceContext = {
    hassanId: updatedHassan.id,
    forcedAttackerId,
    options: forcedTargets,
  };
  const requested = requestRoll(
    nextState,
    updatedHassan.owner,
    "hassanTrueEnemyTargetChoice",
    ctx,
    updatedHassan.id
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function getHassanAssassinOrderEligibleUnitIds(
  state: GameState,
  owner: PlayerId,
  hassanId: string
): string[] {
  return Object.values(state.units)
    .filter(
      (unit) =>
        unit.isAlive &&
        unit.owner === owner &&
        !!unit.position &&
        unit.id !== hassanId &&
        unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
    )
    .map((unit) => unit.id)
    .sort();
}

export function requestHassanAssassinOrderSelection(
  state: GameState,
  owner: PlayerId,
  queue: PlayerId[] = []
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }

  const hassan = Object.values(state.units)
    .filter((unit) => unit.isAlive && unit.owner === owner && isHassan(unit))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!hassan) {
    return { state, events: [] };
  }

  const eligibleUnitIds = getHassanAssassinOrderEligibleUnitIds(
    state,
    owner,
    hassan.id
  );
  if (eligibleUnitIds.length < 2) {
    if (queue.length > 0) {
      const [nextOwner, ...rest] = queue;
      return requestHassanAssassinOrderSelection(state, nextOwner, rest);
    }
    return { state, events: [] };
  }

  const ctx: HassanAssassinOrderSelectionContext = {
    owner,
    hassanId: hassan.id,
    eligibleUnitIds,
    queue,
  };
  return requestRoll(
    state,
    owner,
    "hassanAssassinOrderSelection",
    ctx,
    hassan.id
  );
}

