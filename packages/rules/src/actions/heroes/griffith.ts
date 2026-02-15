import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../model";
import { makeEmptyTurnEconomy } from "../../model";
import type { RNG } from "../../rng";
import { rollD6 } from "../../rng";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_FEMTO_DIVINE_MOVE,
  ABILITY_GRIFFITH_FEMTO_REBIRTH,
  getAbilitySpec,
} from "../../abilities";
import { HERO_FEMTO_ID, HERO_GRIFFITH_ID } from "../../heroes";
import { getUnitDefinition } from "../../units";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { clearPendingRoll, requestRoll } from "../../core";
import { evAbilityUsed, evUnitMoved } from "../../core";
import { getUnitAt } from "../../board";

export const FEMTO_HP_BONUS = 5;

export function isGriffith(unit: UnitState): boolean {
  return unit.heroId === HERO_GRIFFITH_ID;
}

export function isFemto(unit: UnitState): boolean {
  return unit.heroId === HERO_FEMTO_ID;
}

export function getFemtoMaxHp(): number {
  return getUnitDefinition("berserker").maxHp + FEMTO_HP_BONUS;
}

export function getFemtoBaseAttack(): number {
  return getUnitDefinition("berserker").baseAttack;
}

export function applyGriffithFemtoRebirth(
  unit: UnitState,
  deathPosition: Coord | null
): { unit: UnitState; events: GameEvent[]; transformed: boolean } {
  if (!isGriffith(unit) || !deathPosition) {
    return { unit, events: [], transformed: false };
  }

  const autoDefenseCharges =
    getAbilitySpec(ABILITY_BERSERK_AUTO_DEFENSE)?.maxCharges ?? 6;
  const reborn: UnitState = {
    ...unit,
    heroId: HERO_FEMTO_ID,
    figureId: HERO_FEMTO_ID,
    transformed: true,
    hp: getFemtoMaxHp(),
    attack: getFemtoBaseAttack(),
    isAlive: true,
    position: { ...deathPosition },
    turn: makeEmptyTurnEconomy(),
    movementDisabledNextTurn: false,
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthSuccessMinRoll: undefined,
    charges: {
      ...unit.charges,
      [ABILITY_BERSERK_AUTO_DEFENSE]: autoDefenseCharges,
    },
  };

  return {
    unit: reborn,
    transformed: true,
    events: [
      evAbilityUsed({
        unitId: reborn.id,
        abilityId: ABILITY_GRIFFITH_FEMTO_REBIRTH,
      }),
    ],
  };
}

function getFemtoDivineMoveOptions(
  state: GameState,
  unit: UnitState,
  roll: number
): Coord[] {
  if (!unit.position) return [];
  const origin = unit.position;
  const options: Coord[] = [];

  const canUseCell = (coord: Coord) => {
    if (coord.col === origin.col && coord.row === origin.row) {
      return false;
    }
    if (!!getUnitAt(state, coord)) {
      return false;
    }
    return true;
  };

  if (roll <= 3) {
    for (let col = 0; col < state.boardSize; col += 1) {
      for (let row = 0; row < state.boardSize; row += 1) {
        const coord = { col, row };
        const cheb = Math.max(
          Math.abs(coord.col - origin.col),
          Math.abs(coord.row - origin.row)
        );
        if (cheb > 2) continue;
        if (!canUseCell(coord)) continue;
        options.push(coord);
      }
    }
    return options;
  }

  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const coord = { col, row };
      if (!canUseCell(coord)) continue;
      options.push(coord);
    }
  }
  return options;
}

function parseCoord(raw: unknown): Coord | null {
  if (!raw || typeof raw !== "object") return null;
  const col = (raw as { col?: unknown }).col;
  const row = (raw as { row?: unknown }).row;
  if (typeof col !== "number" || typeof row !== "number") return null;
  return { col, row };
}

function parseCoordList(raw: unknown): Coord[] {
  if (!Array.isArray(raw)) return [];
  const result: Coord[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = parseCoord(item);
    if (!parsed) continue;
    const key = `${parsed.col},${parsed.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(parsed);
  }
  return result;
}

export function applyFemtoDivineMove(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isFemto(unit) || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_FEMTO_DIVINE_MOVE);
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
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  const requested = requestRoll(
    nextState,
    updatedUnit.owner,
    "femtoDivineMoveRoll",
    { unitId: updatedUnit.id },
    updatedUnit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}

export function resolveFemtoDivineMoveRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const unitId =
    typeof pending.context.unitId === "string" ? pending.context.unitId : null;
  if (!unitId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const baseState = clearPendingRoll(state);
  const unit = baseState.units[unitId];
  if (!unit || !unit.isAlive || !unit.position || !isFemto(unit)) {
    return { state: baseState, events: [] };
  }

  const roll = rollD6(rng);
  const options = getFemtoDivineMoveOptions(baseState, unit, roll);
  if (options.length === 0) {
    return { state: baseState, events: [] };
  }

  return requestRoll(
    baseState,
    unit.owner,
    "femtoDivineMoveDestination",
    { unitId: unit.id, roll, options },
    unit.id
  );
}

export function resolveFemtoDivineMoveDestinationChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const unitId =
    typeof pending.context.unitId === "string" ? pending.context.unitId : null;
  if (!unitId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && choice.type === "femtoDivineMoveDestination"
      ? choice
      : undefined;
  if (!payload?.position) {
    return { state, events: [] };
  }

  const options = parseCoordList(pending.context.options);
  const destination = parseCoord(payload.position);
  if (!destination) {
    return { state, events: [] };
  }

  const allowed = options.some(
    (coord) => coord.col === destination.col && coord.row === destination.row
  );
  if (!allowed) {
    return { state, events: [] };
  }

  const baseState = clearPendingRoll(state);
  const unit = baseState.units[unitId];
  if (!unit || !unit.isAlive || !unit.position || !isFemto(unit)) {
    return { state: baseState, events: [] };
  }

  const from = { ...unit.position };
  const movedUnit: UnitState = {
    ...unit,
    position: { ...destination },
  };
  const nextState: GameState = {
    ...baseState,
    units: {
      ...baseState.units,
      [movedUnit.id]: movedUnit,
    },
  };

  return {
    state: nextState,
    events: [
      evUnitMoved({
        unitId: movedUnit.id,
        from,
        to: movedUnit.position!,
      }),
    ],
  };
}

