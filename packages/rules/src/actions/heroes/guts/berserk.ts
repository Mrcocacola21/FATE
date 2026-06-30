import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../../model";
import { canAttackTarget } from "../../../combat";
import { canDirectlyTargetUnit } from "../../../visibility";
import { resolveAoE } from "../../../aoe";
import {
  ABILITY_GUTS_BERSERK_MODE,
  ABILITY_GUTS_EXIT_BERSERK,
  getAbilitySpec,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { clearPendingRoll, makeAttackContext, requestRoll, evAbilityUsed } from "../../../core";
import type { GutsBerserkAttackChoiceContext, TricksterAoEContext } from "../../types";
import { applyGriffithFemtoRebirth } from "../../../shared/griffith";
import { isGuts } from "./helpers";

function chebyshev(a: NonNullable<UnitState["position"]>, b: NonNullable<UnitState["position"]>): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function sortTargetIdsByBoardOrder(state: GameState, ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const unitA = state.units[a];
    const unitB = state.units[b];
    const posA = unitA?.position;
    const posB = unitB?.position;
    if (posA && posB) {
      if (posA.row !== posB.row) return posA.row - posB.row;
      if (posA.col !== posB.col) return posA.col - posB.col;
    }
    return a.localeCompare(b);
  });
}

function getGutsBerserkSingleTargetIds(
  state: GameState,
  unit: UnitState
): string[] {
  if (!isGuts(unit) || !unit.gutsBerserkModeActive || !unit.position) return [];
  const ids = Object.values(state.units)
    .filter((target) => target.owner !== unit.owner)
    .filter((target) => canAttackTarget(state, unit, target))
    .map((target) => target.id);
  return sortTargetIdsByBoardOrder(state, ids);
}

function getGutsBerserkAoETargetIds(
  state: GameState,
  unit: UnitState
): string[] {
  if (!isGuts(unit) || !unit.gutsBerserkModeActive || !unit.position) return [];
  const ids = Object.values(state.units)
    .filter((target) => target.id !== unit.id)
    .filter((target) => target.isAlive && !!target.position)
    .filter((target) => chebyshev(unit.position!, target.position!) <= 1)
    .filter((target) => canDirectlyTargetUnit(state, unit.id, target.id))
    .map((target) => target.id);
  return sortTargetIdsByBoardOrder(state, ids);
}

function parseGutsBerserkAttackMode(
  choice: ResolveRollChoice | undefined
): { mode: "single" | "aoe"; targetId: string } | null {
  if (!choice || typeof choice !== "object" || !("type" in choice)) {
    return null;
  }
  const payload = choice as {
    type?: string;
    mode?: unknown;
    targetId?: unknown;
  };
  if (payload.type !== "gutsBerserkAttackMode") return null;
  if (payload.mode !== "single" && payload.mode !== "aoe") return null;
  if (typeof payload.targetId !== "string" || payload.targetId.length === 0) {
    return null;
  }
  return { mode: payload.mode, targetId: payload.targetId };
}

function startGutsBerserkAoE(state: GameState, unit: UnitState): ApplyResult {
  if (!unit.position || !canSpendSlots(unit, { attack: true, action: true })) {
    return { state, events: [] };
  }

  const origin = unit.position;
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
  const target = state.units[action.defenderId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }
  if (!canSpendSlots(unit, { attack: true, action: true })) {
    return { state, events: [] };
  }

  const singleTargetOptions = getGutsBerserkSingleTargetIds(state, unit);
  const aoeTargetIds = getGutsBerserkAoETargetIds(state, unit);
  const canUseSingle = singleTargetOptions.includes(target.id);
  const canUseAoe = aoeTargetIds.includes(target.id);
  if (!canUseSingle && !canUseAoe) {
    return { state, events: [] };
  }

  return requestRoll(
    state,
    unit.owner,
    "gutsBerserkAttackChoice",
    {
      gutsId: unit.id,
      targetId: target.id,
      singleTargetOptions,
      aoeTargetIds,
    } satisfies GutsBerserkAttackChoiceContext,
    unit.id
  );
}

export function resolveGutsBerserkAttackChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as GutsBerserkAttackChoiceContext;
  const guts = state.units[ctx.gutsId];
  if (!guts || !guts.isAlive || !guts.position || !isGuts(guts)) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (!guts.gutsBerserkModeActive) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload = parseGutsBerserkAttackMode(choice);
  if (!payload) {
    return { state, events: [] };
  }
  if (!canSpendSlots(guts, { attack: true, action: true })) {
    return { state, events: [] };
  }

  const target = state.units[payload.targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }

  if (payload.mode === "single") {
    const singleTargetOptions = getGutsBerserkSingleTargetIds(state, guts);
    if (!singleTargetOptions.includes(payload.targetId)) {
      return { state, events: [] };
    }
    const requested = requestRoll(
      clearPendingRoll(state),
      guts.owner,
      "attack_attackerRoll",
      makeAttackContext({
        attackerId: guts.id,
        defenderId: target.id,
        consumeSlots: true,
        queueKind: "normal",
      }),
      guts.id
    );
    return requested;
  }

  const aoeTargetIds = getGutsBerserkAoETargetIds(state, guts);
  if (!aoeTargetIds.includes(payload.targetId)) {
    return { state, events: [] };
  }
  return startGutsBerserkAoE(clearPendingRoll(state), guts);
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
