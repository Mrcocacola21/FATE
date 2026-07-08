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
import { getUnitAt } from "../../board";
import { canAttackTarget } from "../../combat";
import { resolveAoE } from "../../aoe";
import {
  ABILITY_JEBE_HAIL_OF_ARROWS,
  ABILITY_JEBE_KHANS_SHOOTER,
  getAbilitySpec,
} from "../../abilities";
import { HERO_JEBE_ID } from "../../heroes";
import { requestRoll } from "../../core";
import { evAoeResolved } from "../../core";
import { canCommitAbilityCost, commitAbilityCost } from "../abilityCosts";
import type {
  JebeHailOfArrowsAoEContext,
  JebeKhansShooterRicochetContext,
} from "../types";

interface HailPayload {
  center?: Coord;
}

interface KhansShooterPayload {
  targetId?: string;
}

function isJebe(unit: UnitState): boolean {
  return unit.heroId === HERO_JEBE_ID;
}

export function isJebeCenterOnArcherLine(
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
    const unit = getUnitAt(state, { col, row });
    if (unit && unit.owner !== caster.owner) {
      return false;
    }
    col += stepCol;
    row += stepRow;
  }

  return false;
}

export function applyJebeHailOfArrows(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (!isJebe(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as HailPayload | undefined;
  const center = payload?.center;
  if (!center || !isInsideBoard(center, state.boardSize)) {
    return { state, events: [] };
  }

  if (!isJebeCenterOnArcherLine(state, unit, center)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_JEBE_HAIL_OF_ARROWS);
  if (!spec) {
    return { state, events: [] };
  }

  const committed = commitAbilityCost(state, unit.id, spec.id);
  if (!committed.ok) return { state, events: [] };

  const updatedUnit = committed.unit;
  let nextState: GameState = committed.state;
  const events: GameEvent[] = [...committed.events];

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

  const ctx: JebeHailOfArrowsAoEContext = {
    casterId: updatedUnit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = requestRoll(
    queuedState,
    updatedUnit.owner,
    "jebeHailOfArrows_attackerRoll",
    ctx,
    updatedUnit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}

export function applyJebeKhansShooter(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isJebe(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as KhansShooterPayload | undefined;
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

  const spec = getAbilitySpec(ABILITY_JEBE_KHANS_SHOOTER);
  if (!spec) {
    return { state, events: [] };
  }

  if (!canCommitAbilityCost(state, unit.id, spec.id)) {
    return { state, events: [] };
  }

  const ctx: JebeKhansShooterRicochetContext = {
    casterId: unit.id,
    initialTargetId: target.id,
    selectedTargetIds: [target.id],
  };

  const requested = requestRoll(
    state,
    unit.owner,
    "jebeKhansShooterRicochetRoll",
    ctx,
    unit.id
  );

  return { state: requested.state, events: requested.events };
}


