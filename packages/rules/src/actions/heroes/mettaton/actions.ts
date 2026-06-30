import type { ApplyResult, Coord, GameAction, GameState, UnitState } from "../../../model";
import { isInsideBoard } from "../../../model";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_METTATON_EX,
  ABILITY_METTATON_FINAL_CHORD,
  ABILITY_METTATON_LASER,
  ABILITY_METTATON_NEO,
  ABILITY_METTATON_POPPINS,
  setCharges,
} from "../../../abilities";
import { evAbilityUsed } from "../../../core";
import { resolveAoE } from "../../../aoe";
import {
  collectMettatonFinalChordTargetIds,
  collectMettatonLineTargetIds,
  getMettatonRating,
  hasMettatonExUnlocked,
  hasMettatonNeoUnlocked,
  isMettaton,
  isMettatonCenterOnAttackLine,
  unlockMettatonEx,
  unlockMettatonNeo,
} from "../../../mettaton";
import type { RNG } from "../../../rng";
import { parseCoord, sortUnitIdsByReadingOrder } from "./helpers";
import { requestMettatonQueuedAttacks } from "./queue";
import { buildActionBaseState } from "./state";

interface CenterPayload {
  center?: Coord;
}

interface LinePayload {
  target?: Coord;
  center?: Coord;
  line?: Coord;
}

export function applyMettatonPoppins(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (!isMettaton(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  const payload = (action.payload ?? {}) as CenterPayload;
  const center = parseCoord(payload.center);
  if (!center || !isInsideBoard(center, state.boardSize)) {
    return { state, events: [] };
  }
  if (!isMettatonCenterOnAttackLine(state, unit, center)) {
    return { state, events: [] };
  }

  const prepared = buildActionBaseState(
    state,
    unit,
    ABILITY_METTATON_POPPINS,
    3
  );
  if (!prepared) {
    return { state, events: [] };
  }

  const caster = prepared.state.units[unit.id];
  if (!caster || !caster.position) {
    return { state: prepared.state, events: prepared.events };
  }

  const aoe = resolveAoE(
    prepared.state,
    caster.id,
    center,
    {
      radius: 1,
      shape: "chebyshev",
      revealHidden: true,
      abilityId: ABILITY_METTATON_POPPINS,
      emitEvent: false,
    },
    rng
  );

  const affectedUnitIds = sortUnitIdsByReadingOrder(
    aoe.nextState,
    Array.from(new Set(aoe.affectedUnitIds))
  );

  const queued = requestMettatonQueuedAttacks(
    aoe.nextState,
    caster,
    ABILITY_METTATON_POPPINS,
    center,
    affectedUnitIds,
    { allowFriendlyTarget: true }
  );

  return {
    state: queued.state,
    events: [...prepared.events, ...aoe.events, ...queued.events],
  };
}

export function applyMettatonEx(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (
    !isMettaton(unit) ||
    !unit.isAlive ||
    hasMettatonExUnlocked(unit) ||
    getMettatonRating(unit) < 5
  ) {
    return { state, events: [] };
  }

  const unlocked = unlockMettatonEx(unit);
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unlocked.id]: unlocked,
    },
  };

  return {
    state: nextState,
    events: [
      evAbilityUsed({ unitId: unlocked.id, abilityId: ABILITY_METTATON_EX }),
    ],
  };
}

export function applyMettatonLaser(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (
    !isMettaton(unit) ||
    !unit.isAlive ||
    !unit.position ||
    !hasMettatonExUnlocked(unit)
  ) {
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
  if (!isMettatonCenterOnAttackLine(state, unit, target)) {
    return { state, events: [] };
  }

  const prepared = buildActionBaseState(state, unit, ABILITY_METTATON_LASER, 3);
  if (!prepared) {
    return { state, events: [] };
  }

  const caster = prepared.state.units[unit.id];
  if (!caster || !caster.position) {
    return { state: prepared.state, events: prepared.events };
  }

  const targets = collectMettatonLineTargetIds(prepared.state, caster, target);
  const queued = requestMettatonQueuedAttacks(
    prepared.state,
    caster,
    ABILITY_METTATON_LASER,
    target,
    targets,
    { allowFriendlyTarget: true }
  );

  return {
    state: queued.state,
    events: [...prepared.events, ...queued.events],
  };
}

export function applyMettatonNeo(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (
    !isMettaton(unit) ||
    !unit.isAlive ||
    hasMettatonNeoUnlocked(unit) ||
    getMettatonRating(unit) < 10
  ) {
    return { state, events: [] };
  }

  const unlocked = unlockMettatonNeo(unit);
  const withBerserkCounter = setCharges(
    unlocked,
    ABILITY_BERSERK_AUTO_DEFENSE,
    unlocked.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0
  );
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [withBerserkCounter.id]: withBerserkCounter,
    },
  };

  return {
    state: nextState,
    events: [
      evAbilityUsed({ unitId: withBerserkCounter.id, abilityId: ABILITY_METTATON_NEO }),
    ],
  };
}

export function applyMettatonFinalChord(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isMettaton(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  const prepared = buildActionBaseState(
    state,
    unit,
    ABILITY_METTATON_FINAL_CHORD,
    12
  );
  if (!prepared) {
    return { state, events: [] };
  }

  const caster = prepared.state.units[unit.id];
  if (!caster || !caster.position) {
    return { state: prepared.state, events: prepared.events };
  }

  const targets = collectMettatonFinalChordTargetIds(prepared.state, caster);
  const queued = requestMettatonQueuedAttacks(
    prepared.state,
    caster,
    ABILITY_METTATON_FINAL_CHORD,
    caster.position,
    targets,
    { damageOverride: 3 }
  );

  return {
    state: queued.state,
    events: [...prepared.events, ...queued.events],
  };
}
