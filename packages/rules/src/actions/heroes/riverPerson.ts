import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingMove,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../model";
import { isInsideBoard } from "../../model";
import { addCoord, ALL_DIRS, coordsEqual, getUnitAt } from "../../board";
import { canAttackTarget } from "../../combat";
import { canDirectlyTargetUnit } from "../../visibility";
import {
  ABILITY_RIVER_PERSON_BOATMAN,
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  getAbilitySpec,
  spendCharges,
} from "../../abilities";
import { HERO_RIVER_PERSON_ID } from "../../heroes";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { getLegalMovesForUnitModes } from "../../movement";
import { getMovementModes } from "../shared";
import { clearPendingRoll, makeAttackContext, requestRoll } from "../../core";
import { evAbilityUsed, evMoveOptionsGenerated, evUnitMoved } from "../../core";
import { linePath } from "../../path";
import type {
  RiverBoatCarryChoiceContext,
  RiverBoatDropDestinationContext,
  RiverTraLaLaDestinationChoiceContext,
  RiverTraLaLaTargetChoiceContext,
} from "../../pendingRoll/types";

const CARDINAL_DIRS: Coord[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
];

function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function sortUnitsByReadingOrder(state: GameState, ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const ua = state.units[a];
    const ub = state.units[b];
    const pa = ua?.position;
    const pb = ub?.position;
    if (!pa || !pb) return a.localeCompare(b);
    if (pa.row !== pb.row) return pa.row - pb.row;
    if (pa.col !== pb.col) return pa.col - pb.col;
    return a.localeCompare(b);
  });
}

function parseTargetId(choice: ResolveRollChoice | undefined): string | null {
  if (!choice || typeof choice !== "object") return null;
  const payload = choice as { targetId?: unknown };
  return typeof payload.targetId === "string" && payload.targetId.length > 0
    ? payload.targetId
    : null;
}

function parsePosition(choice: ResolveRollChoice | undefined): Coord | null {
  if (!choice || typeof choice !== "object") return null;
  const payload = choice as { position?: unknown };
  if (!payload.position || typeof payload.position !== "object") return null;
  const raw = payload.position as { col?: unknown; row?: unknown };
  if (typeof raw.col !== "number" || typeof raw.row !== "number") return null;
  return { col: raw.col, row: raw.row };
}

function parseCoordList(raw: unknown): Coord[] {
  if (!Array.isArray(raw)) return [];
  const coords: Coord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const col = (item as { col?: unknown }).col;
    const row = (item as { row?: unknown }).row;
    if (typeof col !== "number" || typeof row !== "number") continue;
    coords.push({ col, row });
  }
  return coords;
}

export function isRiverPerson(unit: UnitState): boolean {
  return unit.heroId === HERO_RIVER_PERSON_ID;
}

export function getRiverCarryOptions(state: GameState, riverId: string): string[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return [];
  }
  const options = Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.id === river.id) return false;
      if (unit.owner !== river.owner) return false;
      return chebyshev(unit.position, river.position!) <= 1;
    })
    .map((unit) => unit.id);
  return sortUnitsByReadingOrder(state, options);
}

export function getRiverDropOptions(
  state: GameState,
  finalPosition: Coord,
  carriedAllyId: string
): Coord[] {
  const options: Coord[] = [];
  for (const dir of ALL_DIRS) {
    const cell = addCoord(finalPosition, dir);
    if (!isInsideBoard(cell, state.boardSize)) continue;
    const occupant = getUnitAt(state, cell);
    if (occupant && occupant.isAlive && occupant.id !== carriedAllyId) {
      continue;
    }
    options.push(cell);
  }
  return options;
}

export function getRiverTraLaLaTargetOptions(
  state: GameState,
  riverId: string
): string[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return [];
  }
  const targets = Object.values(state.units)
    .filter((unit) => {
      if (!unit.isAlive || !unit.position) return false;
      if (unit.owner === river.owner) return false;
      return chebyshev(unit.position, river.position!) <= 1;
    })
    .map((unit) => unit.id);
  return sortUnitsByReadingOrder(state, targets);
}

export function getRiverTraLaLaDestinations(
  state: GameState,
  riverId: string
): Coord[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return [];
  }
  const options: Coord[] = [];
  for (const dir of CARDINAL_DIRS) {
    let cursor = addCoord(river.position, dir);
    while (isInsideBoard(cursor, state.boardSize)) {
      if (getUnitAt(state, cursor)) break;
      options.push({ ...cursor });
      cursor = addCoord(cursor, dir);
    }
  }
  return options;
}

function getRiverTraLaLaTouchedAllies(
  state: GameState,
  riverId: string,
  from: Coord,
  to: Coord
): string[] {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position) return [];
  const path = linePath(from, to);
  if (!path || path.length === 0) return [];

  const touched = new Set<string>();
  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.position) continue;
    if (unit.id === river.id) continue;
    if (unit.owner !== river.owner) continue;
    for (const step of path) {
      if (chebyshev(unit.position, step) <= 1) {
        touched.add(unit.id);
        break;
      }
    }
  }

  return sortUnitsByReadingOrder(state, Array.from(touched));
}

export function requestRiverBoatCarryChoice(
  state: GameState,
  river: UnitState,
  mode: UnitState["class"] | "normal",
  options: string[]
): ApplyResult {
  return requestRoll(
    state,
    river.owner,
    "riverBoatCarryChoice",
    {
      riverId: river.id,
      mode,
      options,
    } satisfies RiverBoatCarryChoiceContext,
    river.id
  );
}

export function filterRiverMovesByCarryDrop(
  state: GameState,
  legalMoves: Coord[],
  carriedAllyId: string
): Coord[] {
  return legalMoves.filter(
    (dest) => getRiverDropOptions(state, dest, carriedAllyId).length > 0
  );
}

export function applyRiverBoatman(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isRiverPerson(unit) || !unit.position) {
    return { state, events: [] };
  }
  const spec = getAbilitySpec(ABILITY_RIVER_PERSON_BOATMAN);
  if (!spec) {
    return { state, events: [] };
  }
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }
  if ((unit.kaladinMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }
  if ((unit.lokiMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }
  if ((unit.lokiChickenSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }

  const movedAsAction: UnitState = {
    ...spendSlots(unit, costs),
    riverBoatmanMovePending: true,
    riverBoatCarryAllyId: undefined,
  };
  const stateAfterAbility: GameState = {
    ...state,
    units: {
      ...state.units,
      [movedAsAction.id]: movedAsAction,
    },
  };
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: movedAsAction.id, abilityId: spec.id }),
  ];

  const carryOptions = getRiverCarryOptions(stateAfterAbility, movedAsAction.id);
  if (carryOptions.length > 0) {
    const requested = requestRiverBoatCarryChoice(
      stateAfterAbility,
      movedAsAction,
      "normal",
      carryOptions
    );
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  let legalTo = getLegalMovesForUnitModes(stateAfterAbility, movedAsAction.id, [
    ...getMovementModes(movedAsAction),
  ]);
  if (movedAsAction.riverBoatCarryAllyId) {
    legalTo = filterRiverMovesByCarryDrop(
      stateAfterAbility,
      legalTo,
      movedAsAction.riverBoatCarryAllyId
    );
  }
  const pendingMove: PendingMove = {
    unitId: movedAsAction.id,
    roll: undefined,
    legalTo,
    expiresTurnNumber: state.turnNumber,
    mode: "normal",
  };
  return {
    state: {
      ...stateAfterAbility,
      pendingMove,
    },
    events: [
      ...events,
      evMoveOptionsGenerated({
        unitId: movedAsAction.id,
        roll: undefined,
        legalTo,
        mode: "normal",
      }),
    ],
  };
}

export function applyRiverTraLaLa(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isRiverPerson(unit) || !unit.position) {
    return { state, events: [] };
  }
  const spec = getAbilitySpec(ABILITY_RIVER_PERSON_TRA_LA_LA);
  if (!spec) return { state, events: [] };
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const targetOptions = getRiverTraLaLaTargetOptions(state, unit.id);
  if (targetOptions.length === 0) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok) return { state, events: [] };

  const updatedRiver: UnitState = {
    ...spendSlots(spent.unit, costs),
    riverBoatCarryAllyId: undefined,
  };
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedRiver.id]: updatedRiver,
    },
  };
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedRiver.id, abilityId: spec.id }),
  ];
  const requested = requestRoll(
    nextState,
    updatedRiver.owner,
    "riverTraLaLaTargetChoice",
    {
      riverId: updatedRiver.id,
      options: targetOptions,
    } satisfies RiverTraLaLaTargetChoiceContext,
    updatedRiver.id
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function resolveRiverTraLaLaTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as RiverTraLaLaTargetChoiceContext;
  const river = state.units[ctx.riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targetId = parseTargetId(choice);
  if (!targetId) return { state, events: [] };
  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(targetId)) return { state, events: [] };

  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (target.owner === river.owner) {
    return { state, events: [] };
  }
  if (chebyshev(target.position, river.position) > 1) {
    return { state, events: [] };
  }

  const destinations = getRiverTraLaLaDestinations(state, river.id);
  if (destinations.length === 0) {
    return { state: clearPendingRoll(state), events: [] };
  }

  return requestRoll(
    clearPendingRoll(state),
    river.owner,
    "riverTraLaLaDestinationChoice",
    {
      riverId: river.id,
      targetId,
      options: destinations,
    } satisfies RiverTraLaLaDestinationChoiceContext,
    river.id
  );
}

export function resolveRiverTraLaLaDestinationChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as RiverTraLaLaDestinationChoiceContext;
  const river = state.units[ctx.riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const target = state.units[ctx.targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const destination = parsePosition(choice);
  if (!destination) return { state, events: [] };
  const allowed = parseCoordList(ctx.options).some((coord) =>
    coordsEqual(coord, destination)
  );
  if (!allowed) return { state, events: [] };
  if (getUnitAt(state, destination)) return { state, events: [] };

  const from = { ...river.position };
  const movedRiver: UnitState = {
    ...river,
    position: { ...destination },
    riverBoatCarryAllyId: undefined,
  };

  let nextState: GameState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      [movedRiver.id]: movedRiver,
    },
  });
  const events: GameEvent[] = [
    evUnitMoved({ unitId: movedRiver.id, from, to: movedRiver.position! }),
  ];

  const touchedAllies = getRiverTraLaLaTouchedAllies(
    state,
    movedRiver.id,
    from,
    movedRiver.position!
  );
  const queue = touchedAllies
    .map((allyId) => nextState.units[allyId])
    .filter((ally): ally is UnitState => !!ally && !!ally.position && ally.isAlive)
    .filter((ally) => canDirectlyTargetUnit(nextState, ally.id, target.id))
    .filter((ally) => canAttackTarget(nextState, ally, target))
    .filter((ally) => canSpendSlots(ally, { attack: true, action: true }))
    .map((ally) => ({
      attackerId: ally.id,
      defenderId: target.id,
      consumeSlots: true,
      kind: "aoe" as const,
    }));

  if (queue.length === 0) {
    return { state: nextState, events };
  }

  nextState = {
    ...nextState,
    pendingCombatQueue: queue,
  };

  const first = queue[0];
  const requested = requestRoll(
    nextState,
    nextState.units[first.attackerId].owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: first.attackerId,
      defenderId: first.defenderId,
      consumeSlots: true,
      queueKind: "aoe",
    }),
    first.attackerId
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function requestRiverBoatDropDestination(
  state: GameState,
  riverId: string,
  allyId: string,
  options: Coord[]
): ApplyResult {
  const river = state.units[riverId];
  if (!river || !river.isAlive || !river.position || !isRiverPerson(river)) {
    return { state, events: [] };
  }
  return requestRoll(
    state,
    river.owner,
    "riverBoatDropDestination",
    {
      riverId,
      allyId,
      options,
    } satisfies RiverBoatDropDestinationContext,
    river.id
  );
}

export function resolveRiverBoatDropDestination(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as RiverBoatDropDestinationContext;
  const river = state.units[ctx.riverId];
  const ally = state.units[ctx.allyId];
  if (!river || !ally || !ally.isAlive || !ally.position || !isRiverPerson(river)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const destination = parsePosition(choice);
  if (!destination) return { state, events: [] };
  const options = parseCoordList(ctx.options);
  if (!options.some((coord) => coordsEqual(coord, destination))) {
    return { state, events: [] };
  }
  const occupant = getUnitAt(state, destination);
  if (occupant && occupant.isAlive && occupant.id !== ally.id) {
    return { state, events: [] };
  }

  const moved = !coordsEqual(ally.position, destination);
  const updatedRiver: UnitState =
    river.riverBoatCarryAllyId !== undefined
      ? { ...river, riverBoatCarryAllyId: undefined }
      : river;
  const updatedAlly: UnitState = {
    ...ally,
    position: { ...destination },
  };
  const nextState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      [updatedRiver.id]: updatedRiver,
      [updatedAlly.id]: updatedAlly,
    },
  });
  const events: GameEvent[] = moved
    ? [evUnitMoved({ unitId: updatedAlly.id, from: ally.position, to: destination })]
    : [];
  return { state: nextState, events };
}

export function clearRiverTurnFlags(
  state: GameState,
  unitId: string | null
): GameState {
  if (!unitId) return state;
  const unit = state.units[unitId];
  if (!unit || !isRiverPerson(unit)) return state;
  if (!unit.riverBoatmanMovePending && !unit.riverBoatCarryAllyId) {
    return state;
  }
  const cleared: UnitState = {
    ...unit,
    riverBoatmanMovePending: false,
    riverBoatCarryAllyId: undefined,
  };
  return {
    ...state,
    units: {
      ...state.units,
      [cleared.id]: cleared,
    },
  };
}
