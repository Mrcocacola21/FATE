import type { ApplyResult, GameAction, GameEvent, GameState, UnitState, Coord } from "../../model";
import { isInsideBoard } from "../../model";
import type { RNG } from "../../rng";
import { resolveAoE } from "../../aoe";
import { canAttackTarget } from "../../combat";
import { chebyshev } from "../../board";
import {
  ABILITY_EL_SID_COMPEADOR_TISONA,
  ABILITY_EL_SID_COMPEADOR_KOLADA,
  ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
  getAbilitySpec,
  getCharges,
  spendCharges,
} from "../../abilities";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { requestRoll } from "../../shared/rollUtils";
import { evAbilityUsed, evAoeResolved } from "../../shared/events";
import { isElCid } from "../shared";
import { makeAttackContext } from "../../shared/combatCtx";
import type { ElCidAoEContext } from "../types";

interface LinePayload {
  target?: Coord;
}

interface DuelistPayload {
  targetId?: string;
}

function isSameRowOrCol(a: Coord, b: Coord): boolean {
  return a.row === b.row || a.col === b.col;
}

function collectLineTargets(
  state: GameState,
  caster: UnitState,
  target: Coord
): string[] {
  const casterPos = caster.position;
  if (!casterPos) return [];
  if (!isSameRowOrCol(casterPos, target)) return [];

  const isRow = casterPos.row === target.row;
  const isCol = casterPos.col === target.col;
  const dirCol = isRow ? Math.sign(target.col - casterPos.col) : 0;
  const dirRow = isCol ? Math.sign(target.row - casterPos.row) : 0;
  if (dirCol === 0 && dirRow === 0) return [];

  const affected: string[] = [];
  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.position) continue;
    if (unit.id === caster.id) continue;
    if (isRow && unit.position.row === casterPos.row) {
      if ((unit.position.col - casterPos.col) * dirCol > 0) {
        affected.push(unit.id);
      }
      continue;
    }
    if (isCol && unit.position.col === casterPos.col) {
      if ((unit.position.row - casterPos.row) * dirRow > 0) {
        affected.push(unit.id);
      }
    }
  }

  return affected;
}

function collectRadiusTargets(state: GameState, caster: UnitState): string[] {
  if (!caster.position) return [];
  const origin = caster.position;
  const affected: string[] = [];
  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.position) continue;
    if (unit.id === caster.id) continue;
    if (chebyshev(origin, unit.position) <= 1) {
      affected.push(unit.id);
    }
  }
  return affected;
}

export function applyElCidTisona(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (!isElCid(unit)) {
    return { state, events: [] };
  }
  if (!unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as LinePayload | undefined;
  const target = payload?.target;
  if (!target || !isInsideBoard(target, state.boardSize)) {
    return { state, events: [] };
  }
  if (!isSameRowOrCol(unit.position, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_EL_SID_COMPEADOR_TISONA);
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

  const affectedUnitIds = collectLineTargets(nextState, updatedUnit, target);
  const revealedUnitIds: string[] = [];

  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: updatedUnit.id,
        abilityId: spec.id,
        casterId: updatedUnit.id,
        center: { ...target },
        radius: 0,
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
      center: { ...target },
      radius: 0,
      affectedUnitIds,
      revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: ElCidAoEContext = {
    casterId: updatedUnit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = requestRoll(
    queuedState,
    updatedUnit.owner,
    "elCidTisona_attackerRoll",
    ctx,
    updatedUnit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}

export function applyElCidDemonDuelist(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isElCid(unit)) {
    return { state, events: [] };
  }
  if (!unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as DuelistPayload | undefined;
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

  if (!canAttackTarget(state, unit, target)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST);
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

  const ctx = {
    ...makeAttackContext({
      attackerId: updatedUnit.id,
      defenderId: targetId,
      consumeSlots: false,
      queueKind: "normal",
    }),
    elCidDuelist: {
      attackerId: updatedUnit.id,
      targetId,
    },
  };

  const requested = requestRoll(
    nextState,
    updatedUnit.owner,
    "attack_attackerRoll",
    ctx,
    updatedUnit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}

export function maybeTriggerElCidKolada(
  state: GameState,
  unitId: string,
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  const center = unit.position;
  if (!isElCid(unit)) {
    return { state, events: [] };
  }

  const charges = getCharges(unit, ABILITY_EL_SID_COMPEADOR_KOLADA);
  if (charges < 3) {
    return { state, events: [] };
  }

  const spent = spendCharges(unit, ABILITY_EL_SID_COMPEADOR_KOLADA, 3);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit = spent.unit;
  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_EL_SID_COMPEADOR_KOLADA }),
  ];

  const aoeRes = resolveAoE(
    nextState,
    updatedUnit.id,
    center,
    {
      radius: 1,
      shape: "chebyshev",
      revealHidden: false,
      targetFilter: (u, caster) => u.id !== caster.id,
      abilityId: ABILITY_EL_SID_COMPEADOR_KOLADA,
      emitEvent: false,
    },
    rng
  );

  nextState = aoeRes.nextState;
  if (aoeRes.events.length > 0) {
    events.push(...aoeRes.events);
  }

  const affectedUnitIds =
    aoeRes.affectedUnitIds.length > 0
      ? aoeRes.affectedUnitIds
      : collectRadiusTargets(nextState, updatedUnit);

  const revealedUnitIds = aoeRes.revealedUnitIds ?? [];

  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: updatedUnit.id,
        abilityId: ABILITY_EL_SID_COMPEADOR_KOLADA,
        casterId: updatedUnit.id,
        center: { ...center },
        radius: 1,
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
      abilityId: ABILITY_EL_SID_COMPEADOR_KOLADA,
      center: { ...center },
      radius: 1,
      affectedUnitIds,
      revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: ElCidAoEContext = {
    casterId: updatedUnit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = requestRoll(
    queuedState,
    updatedUnit.owner,
    "elCidKolada_attackerRoll",
    ctx,
    updatedUnit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}
