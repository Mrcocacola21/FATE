import type { ApplyResult, Coord, GameAction, GameEvent, GameState, UnitState } from "../../../model";
import { isInsideBoard } from "../../../model";
import { getUnitAt } from "../../../board";
import { resolveAoE } from "../../../aoe";
import {
  ABILITY_KAISER_DORA,
  getAbilitySpec,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { requestRoll } from "../../../core";
import { evAbilityUsed, evAoeResolved } from "../../../core";
import type { DoraAoEContext } from "../../types";
import type { RNG } from "../../../rng";
import { isKaiser, isKaiserTransformed } from "../../shared";

export function isDoraCenterOnArcherLine(
  state: GameState,
  caster: UnitState,
  center: Coord
): boolean {
  if (!caster.position) return false;
  const from = caster.position;
  const dx = center.col - from.col;
  const dy = center.row - from.row;
  const sameRow = from.row === center.row;
  const sameCol = from.col === center.col;
  const isDiagonal = Math.abs(dx) === Math.abs(dy);
  if (!sameRow && !sameCol && !isDiagonal) {
    return false;
  }

  const stepCol = Math.sign(dx);
  const stepRow = Math.sign(dy);
  if (stepCol === 0 && stepRow === 0) {
    return false;
  }

  let col = from.col + stepCol;
  let row = from.row + stepRow;

  while (col >= 0 && col < state.boardSize && row >= 0 && row < state.boardSize) {
    if (col === center.col && row === center.row) {
      return true;
    }
    const u = getUnitAt(state, { col, row });
    if (u && u.owner !== caster.owner) {
      return false;
    }
    col += stepCol;
    row += stepRow;
  }

  return false;
}

interface DoraPayload {
  center: Coord;
}

export function applyKaiserDora(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (!isKaiser(unit)) {
    return { state, events: [] };
  }

  const payload = action.payload as DoraPayload | undefined;
  const center = payload?.center;
  if (!center || !isInsideBoard(center, state.boardSize)) {
    return { state, events: [] };
  }

  if (!isDoraCenterOnArcherLine(state, unit, center)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_KAISER_DORA);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  let updatedUnit = unit;
  if (!isKaiserTransformed(unit)) {
    const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
    const spent = spendCharges(updatedUnit, spec.id, chargeAmount);
    if (!spent.ok) {
      return { state, events: [] };
    }
    updatedUnit = spent.unit;
  }

  updatedUnit = spendSlots(updatedUnit, costs);

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
      radius: 1,
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
      abilityId: spec.id,
      center,
      radius: 1,
      affectedUnitIds,
      revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: DoraAoEContext = {
    casterId: updatedUnit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = requestRoll(
    queuedState,
    updatedUnit.owner,
    "dora_attackerRoll",
    ctx,
    updatedUnit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}
