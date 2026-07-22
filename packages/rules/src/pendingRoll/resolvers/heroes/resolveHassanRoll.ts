import type {
  ApplyResult,
  GameState,
  PendingRoll,
  PlayerId,
  ResolveRollChoice,
} from "../../../model";
import {
  ABILITY_HASSAN_ASSASIN_ORDER,
  ABILITY_HASSAN_TRUE_ENEMY,
} from "../../../abilities";
import { clearPendingRoll, evAbilityUsed, requestRoll } from "../../../core";
import { makeAttackContext } from "../../builders/buildPendingRoll";
import { commitAbilityCost } from "../../../actions/abilityCosts";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import {
  canControlledAttackTarget,
} from "../../../actions/controlledAttack";
import type {
  HassanAssassinOrderSelectionContext,
  HassanTrueEnemyTargetChoiceContext,
} from "../../types";
import { getStealthSuccessMinRoll } from "../../../stealth";
import {
  requestHassanAssassinOrderSelection,
} from "../../../actions/heroes/hassan";
import {
  activateVladForest,
  requestVladStakesPlacement,
} from "../../../actions/heroes/vlad";
import { isHassan, isVlad, isKaiser } from "../../../actions/shared";
import { exitBunkerForUnit } from "../../../actions/heroes/kaiser";

const ASSASSIN_ORDER_MIN_STEALTH = 5;

function requestBattleStartVladFlowIfNeeded(state: GameState): ApplyResult {
  const vladOwners = Array.from(
    new Set(
      Object.values(state.units)
        .filter((unit) => unit.isAlive && isVlad(unit))
        .map((unit) => unit.owner)
    )
  ).sort() as PlayerId[];

  if (vladOwners.length === 0) {
    return { state, events: [] };
  }

  const [firstOwner, ...queue] = vladOwners;
  const ownedStakes = state.stakeMarkers.filter(
    (marker) => marker.owner === firstOwner
  ).length;
  const vlad = Object.values(state.units).find(
    (unit) => unit.isAlive && unit.owner === firstOwner && isVlad(unit)
  );
  if (ownedStakes >= 9 && vlad) {
    return activateVladForest(state, vlad.id, firstOwner);
  }

  return requestVladStakesPlacement(state, firstOwner, "battleStart", queue);
}

function requestForcedAttack(
  state: GameState,
  attackerId: string,
  targetId: string,
  controllerPlayerId: PlayerId
): ApplyResult {
  const attacker = state.units[attackerId];
  const target = state.units[targetId];
  if (
    !attacker ||
    !attacker.isAlive ||
    !attacker.position ||
    !target ||
    !target.isAlive ||
    !target.position
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (!canSpendSlots(attacker, { attack: true, action: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (
    !canControlledAttackTarget(
      state,
      attacker.id,
      controllerPlayerId,
      target.id
    )
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }

  let nextState = clearPendingRoll(state);
  let nextAttacker = spendSlots(attacker, { attack: true, action: true });
  nextState = {
    ...nextState,
    units: {
      ...nextState.units,
      [nextAttacker.id]: nextAttacker,
    },
  };
  let events: ReturnType<typeof requestRoll>["events"] = [];
  if (isKaiser(nextAttacker) && nextAttacker.bunker?.active) {
    const exited = exitBunkerForUnit(nextState, nextAttacker, "attacked");
    nextState = exited.state;
    nextAttacker = exited.unit;
    events = [...events, ...exited.events];
  }

  const requested = requestRoll(
    nextState,
    nextAttacker.owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: nextAttacker.id,
      defenderId: target.id,
      allowFriendlyTarget: true,
      consumeSlots: false,
      queueKind: "normal",
    }),
    nextAttacker.id
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function resolveHassanTrueEnemyTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as HassanTrueEnemyTargetChoiceContext;
  const forcedAttackerId = ctx.forcedAttackerId;
  const hassanId = ctx.hassanId;
  if (!forcedAttackerId || !hassanId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== "hassanTrueEnemyTarget" || !payload.targetId) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(payload.targetId)) {
    return { state, events: [] };
  }

  const hassan = state.units[hassanId];
  const attacker = state.units[forcedAttackerId];
  const target = state.units[payload.targetId];
  if (
    !hassan ||
    !hassan.isAlive ||
    !hassan.position ||
    !attacker ||
    !attacker.isAlive ||
    !attacker.position ||
    !target ||
    !target.isAlive ||
    !target.position
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (
    !canControlledAttackTarget(
      state,
      attacker.id,
      hassan.owner,
      target.id
    )
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const committed = commitAbilityCost(state, hassan.id, ABILITY_HASSAN_TRUE_ENEMY);
  if (!committed.ok) return { state, events: [] };
  const forced = requestForcedAttack(
    committed.state,
    forcedAttackerId,
    payload.targetId,
    hassan.owner
  );
  return {
    state: forced.state,
    events: [
      ...committed.events,
      {
        type: "controlledAttackDeclared" as const,
        controllerUnitId: hassan.id,
        controlledUnitId: forcedAttackerId,
        targetId: payload.targetId,
        abilityId: ABILITY_HASSAN_TRUE_ENEMY,
      },
      ...forced.events,
    ],
  };
}

export function resolveHassanAssassinOrderSelection(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as HassanAssassinOrderSelectionContext;
  const owner = ctx.owner;
  const hassanId = ctx.hassanId;
  if (!owner || !hassanId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const hassan = state.units[hassanId];
  if (
    !hassan ||
    !hassan.isAlive ||
    !isHassan(hassan) ||
    hassan.owner !== owner
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; unitIds?: string[] })
      : undefined;
  if (
    !payload ||
    payload.type !== "hassanAssassinOrderPick" ||
    !Array.isArray(payload.unitIds)
  ) {
    return { state, events: [] };
  }

  const unique = Array.from(new Set(payload.unitIds));
  if (unique.length !== 2) {
    return { state, events: [] };
  }

  const eligible = Array.isArray(ctx.eligibleUnitIds) ? ctx.eligibleUnitIds : [];
  const eligibleSet = new Set(eligible);
  if (!unique.every((unitId) => eligibleSet.has(unitId))) {
    return { state, events: [] };
  }

  const units = { ...state.units };
  for (const unitId of unique) {
    const unit = units[unitId];
    if (!unit || !unit.isAlive || unit.owner !== owner || unit.id === hassanId) {
      return { state, events: [] };
    }
    const current = getStealthSuccessMinRoll(unit);
    const nextMin =
      current === null
        ? ASSASSIN_ORDER_MIN_STEALTH
        : Math.min(current, ASSASSIN_ORDER_MIN_STEALTH);
    units[unitId] = {
      ...unit,
      stealthSuccessMinRoll: nextMin,
    };
  }

  const cleared: GameState = clearPendingRoll({ ...state, units });
  const events = [
    evAbilityUsed({
      unitId: hassan.id,
      abilityId: ABILITY_HASSAN_ASSASIN_ORDER,
    }),
  ];
  const queue = Array.isArray(ctx.queue) ? ctx.queue : [];
  if (queue.length > 0) {
    const [nextOwner, ...rest] = queue;
    const requested = requestHassanAssassinOrderSelection(cleared, nextOwner, rest);
    return {
      state: requested.state,
      events: [...events, ...requested.events],
    };
  }

  const vladFlow = requestBattleStartVladFlowIfNeeded(cleared);
  if (vladFlow.state !== cleared || vladFlow.events.length > 0) {
    return {
      state: vladFlow.state,
      events: [...events, ...vladFlow.events],
    };
  }
  return { state: cleared, events };
}



