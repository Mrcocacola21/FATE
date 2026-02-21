import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  UnitState,
} from "../../model";
import { isInsideBoard } from "../../model";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_METTATON_EX,
  ABILITY_METTATON_FINAL_CHORD,
  ABILITY_METTATON_LASER,
  ABILITY_METTATON_NEO,
  ABILITY_METTATON_POPPINS,
  getAbilitySpec,
  setCharges,
} from "../../abilities";
import { resolveAoE } from "../../aoe";
import {
  addMettatonRating,
  buildMettatonRatingChangedEvent,
  collectMettatonFinalChordTargetIds,
  collectMettatonLineTargetIds,
  getMettatonRating,
  hasMettatonExUnlocked,
  hasMettatonNeoUnlocked,
  hasMettatonStagePhenomenon,
  isMettaton,
  isMettatonCenterOnAttackLine,
  spendMettatonRating,
  unlockMettatonEx,
  unlockMettatonNeo,
} from "../../mettaton";
import { requestRoll } from "../../core";
import { evAbilityUsed, evAoeResolved } from "../../core";
import type { TricksterAoEContext } from "../types";
import type { RNG } from "../../rng";

interface CenterPayload {
  center?: Coord;
}

interface LinePayload {
  target?: Coord;
  center?: Coord;
  line?: Coord;
}

function parseCoord(value: unknown): Coord | null {
  if (!value || typeof value !== "object") return null;
  const col = (value as { col?: unknown }).col;
  const row = (value as { row?: unknown }).row;
  if (typeof col !== "number" || typeof row !== "number") return null;
  return { col, row };
}

function sortUnitIdsByReadingOrder(state: GameState, unitIds: string[]): string[] {
  return [...unitIds].sort((a, b) => {
    const unitA = state.units[a];
    const unitB = state.units[b];
    const posA = unitA?.position;
    const posB = unitB?.position;
    if (!posA || !posB) {
      return a.localeCompare(b);
    }
    if (posA.row !== posB.row) return posA.row - posB.row;
    if (posA.col !== posB.col) return posA.col - posB.col;
    return a.localeCompare(b);
  });
}

function applyMettatonRatingSpend(
  state: GameState,
  unitId: string,
  amount: number
): { state: GameState; events: GameEvent[]; ok: boolean } {
  const unit = state.units[unitId];
  if (!unit || !isMettaton(unit)) {
    return { state, events: [], ok: false };
  }
  const spent = spendMettatonRating(unit, amount);
  if (!spent.ok) {
    return { state, events: [], ok: false };
  }
  if (spent.spent <= 0) {
    return { state, events: [], ok: true };
  }
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unit.id]: spent.unit,
    },
  };
  return {
    state: nextState,
    events: [
      buildMettatonRatingChangedEvent({
        unitId: unit.id,
        delta: -spent.spent,
        now: getMettatonRating(spent.unit),
        reason: "abilitySpend",
      }),
    ],
    ok: true,
  };
}

function applyMettatonStagePhenomenonBonus(
  state: GameState,
  unitId: string
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !isMettaton(unit) || !hasMettatonStagePhenomenon(unit)) {
    return { state, events: [] };
  }
  const gained = addMettatonRating(unit, 1);
  if (gained.applied <= 0) {
    return { state, events: [] };
  }
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unit.id]: gained.unit,
    },
  };
  return {
    state: nextState,
    events: [
      buildMettatonRatingChangedEvent({
        unitId: unit.id,
        delta: gained.applied,
        now: getMettatonRating(gained.unit),
        reason: "stagePhenomenon",
      }),
    ],
  };
}

function requestMettatonQueuedAttacks(
  state: GameState,
  caster: UnitState,
  abilityId: string,
  center: Coord,
  affectedUnitIds: string[],
  options?: {
    allowFriendlyTarget?: boolean;
    damageOverride?: number;
    ignoreBonuses?: boolean;
  }
): ApplyResult {
  if (affectedUnitIds.length === 0) {
    return {
      state,
      events: [
        evAoeResolved({
          sourceUnitId: caster.id,
          abilityId,
          casterId: caster.id,
          center,
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
    ...state,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: caster.id,
      abilityId,
      center,
      radius: 0,
      affectedUnitIds,
      revealedUnitIds: [],
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: TricksterAoEContext = {
    casterId: caster.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
    allowFriendlyTarget: options?.allowFriendlyTarget ?? false,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
    damageOverride: options?.damageOverride,
    ignoreBonuses: options?.ignoreBonuses,
  };

  const requested = requestRoll(
    queuedState,
    caster.owner,
    "tricksterAoE_attackerRoll",
    ctx,
    caster.id
  );
  return { state: requested.state, events: requested.events };
}

function buildActionBaseState(
  state: GameState,
  unit: UnitState,
  abilityId: string,
  ratingCost: number
): { state: GameState; events: GameEvent[] } | null {
  const spec = getAbilitySpec(abilityId);
  if (!spec) return null;
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return null;
  }

  const spent = applyMettatonRatingSpend(state, unit.id, ratingCost);
  if (!spent.ok) {
    return null;
  }
  const afterSpend = spent.state.units[unit.id];
  if (!afterSpend) return null;

  const updatedUnit = spendSlots(afterSpend, costs);
  const afterSlotState: GameState = {
    ...spent.state,
    units: {
      ...spent.state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const stageBonus = applyMettatonStagePhenomenonBonus(afterSlotState, updatedUnit.id);

  return {
    state: stageBonus.state,
    events: [
      evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
      ...spent.events,
      ...stageBonus.events,
    ],
  };
}

export function applyMettatonStagePhenomenonOnAttackAction(
  state: GameState,
  attackerId: string
): { state: GameState; events: GameEvent[] } {
  return applyMettatonStagePhenomenonBonus(state, attackerId);
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
  if (!isMettaton(unit) || !unit.isAlive || hasMettatonExUnlocked(unit)) {
    return { state, events: [] };
  }

  const spent = applyMettatonRatingSpend(state, unit.id, 5);
  if (!spent.ok) {
    return { state, events: [] };
  }
  const afterSpend = spent.state.units[unit.id];
  if (!afterSpend) {
    return { state: spent.state, events: spent.events };
  }

  const unlocked = unlockMettatonEx(afterSpend);
  const nextState: GameState = {
    ...spent.state,
    units: {
      ...spent.state.units,
      [unlocked.id]: unlocked,
    },
  };

  return {
    state: nextState,
    events: [
      evAbilityUsed({ unitId: unlocked.id, abilityId: ABILITY_METTATON_EX }),
      ...spent.events,
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
  if (!isMettaton(unit) || !unit.isAlive || hasMettatonNeoUnlocked(unit)) {
    return { state, events: [] };
  }

  const spent = applyMettatonRatingSpend(state, unit.id, 10);
  if (!spent.ok) {
    return { state, events: [] };
  }
  const afterSpend = spent.state.units[unit.id];
  if (!afterSpend) {
    return { state: spent.state, events: spent.events };
  }

  const unlocked = unlockMettatonNeo(afterSpend);
  const withBerserkCounter = setCharges(
    unlocked,
    ABILITY_BERSERK_AUTO_DEFENSE,
    unlocked.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0
  );
  const nextState: GameState = {
    ...spent.state,
    units: {
      ...spent.state.units,
      [withBerserkCounter.id]: withBerserkCounter,
    },
  };

  return {
    state: nextState,
    events: [
      evAbilityUsed({ unitId: withBerserkCounter.id, abilityId: ABILITY_METTATON_NEO }),
      ...spent.events,
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

