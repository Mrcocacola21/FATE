import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../../model";
import { isInsideBoard } from "../../../model";
import { getBerserkerMovesForRoll } from "../../../movement";
import { canUnitEnterCell } from "../../../visibility";
import {
  ABILITY_GROZNY_INVADE_TIME,
  ABILITY_GROZNY_TYRANT,
  getAbilitySpec,
  getCharges,
  spendCharges,
} from "../../../abilities";
import { clearPendingRoll, makeAttackContext, requestRoll } from "../../../core";
import { evAbilityUsed } from "../../../core";
import { getUnitBaseMaxHp } from "../../shared";
import type { AttackRollContext } from "../../types";
import type { RNG } from "../../../rng";
import { canSpendSlots, resetTurnEconomy, spendSlots } from "../../../turnEconomy";
import { canAttackAllyFrom, chebyshevDistance, coordSort, isGrozny } from "./helpers";
import { applyGroznyFreeMove } from "./movement";
import type {
  TyrantAllyChoiceContext,
  TyrantAttackCellChoiceContext,
  TyrantAttackCellOption,
  TyrantAttempt,
  TyrantChainState,
  TyrantMode,
  TyrantOptionChoiceContext,
} from "./types";

function coordsEqual(a: Coord, b: Coord): boolean {
  return a.col === b.col && a.row === b.row;
}

function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

function scoreByCurrentPosition(current: Coord, coord: Coord) {
  return {
    coord,
    dist: chebyshevDistance(current, coord),
  };
}

function sortByDistanceThenCoord(current: Coord, coords: Coord[]): Coord[] {
  return coords
    .map((coord) => scoreByCurrentPosition(current, coord))
    .sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      return coordSort(a.coord, b.coord);
    })
    .map((entry) => entry.coord);
}

function uniqueCoords(coords: Coord[]): Coord[] {
  const seen = new Set<string>();
  const result: Coord[] = [];
  for (const coord of coords) {
    const key = coordKey(coord);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(coord);
  }
  return result;
}

function getAllEnterableBoardCells(state: GameState, unit: UnitState): Coord[] {
  const cells: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const coord = { col, row };
      if (!isInsideBoard(coord, state.boardSize)) continue;
      if (unit.position && coordsEqual(coord, unit.position)) continue;
      if (!canUnitEnterCell(state, unit.id, coord)) continue;
      cells.push(coord);
    }
  }
  return unit.position ? sortByDistanceThenCoord(unit.position, cells) : cells;
}

function getTyrantDestinations(
  state: GameState,
  grozny: UnitState,
  mode: TyrantMode
): Coord[] {
  if (!grozny.position) return [];
  if (mode === "invadeTime") {
    return getAllEnterableBoardCells(state, grozny);
  }
  return sortByDistanceThenCoord(
    grozny.position,
    getBerserkerMovesForRoll(state, grozny.id, 6).filter((dest) =>
      canUnitEnterCell(state, grozny.id, dest)
    )
  );
}

function canUseGroznyInvadeTimeForTyrant(
  state: GameState,
  grozny: UnitState
): boolean {
  const spec = getAbilitySpec(ABILITY_GROZNY_INVADE_TIME);
  if (!spec) return false;
  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  if (getCharges(grozny, spec.id) < chargeAmount) return false;
  return canSpendSlots(grozny, spec.actionCost?.consumes ?? {});
}

function getStartTurnEconomyForAvailability(unit: UnitState): UnitState {
  let reset = resetTurnEconomy(unit);
  if (reset.movementDisabledNextTurn) {
    reset = {
      ...reset,
      movementDisabledNextTurn: false,
      turn: {
        ...reset.turn,
        moveUsed: true,
      },
      hasMovedThisTurn: true,
    };
  }
  return reset;
}

function withUnit(state: GameState, unit: UnitState): GameState {
  return {
    ...state,
    units: {
      ...state.units,
      [unit.id]: unit,
    },
  };
}

export function getGroznyAttackOriginCells(
  state: GameState,
  groznyId: string,
  targetUnitId: string,
  mode: TyrantMode
): Coord[] {
  const grozny = state.units[groznyId];
  const ally = state.units[targetUnitId];
  if (!grozny || !ally || !isGrozny(grozny)) return [];
  if (!grozny.isAlive || !grozny.position) return [];
  if (!ally.isAlive || !ally.position) return [];
  if (ally.owner !== grozny.owner || ally.id === grozny.id) return [];
  if (ally.hp > grozny.attack) return [];
  if (mode === "invadeTime" && !canUseGroznyInvadeTimeForTyrant(state, grozny)) {
    return [];
  }

  const reachable = getTyrantDestinations(state, grozny, mode);
  const options = reachable.filter((dest) =>
    canAttackAllyFrom(state, grozny, ally, dest)
  );
  return uniqueCoords(sortByDistanceThenCoord(grozny.position, options));
}

export function getGroznyFinishableAllies(
  state: GameState,
  groznyId: string,
  mode: TyrantMode
): UnitState[] {
  const grozny = state.units[groznyId];
  if (!grozny || !isGrozny(grozny) || !grozny.isAlive || !grozny.position) {
    return [];
  }

  return Object.values(state.units)
    .filter(
      (unit) =>
        unit.isAlive &&
        !!unit.position &&
        unit.owner === grozny.owner &&
        unit.id !== grozny.id &&
        unit.hp <= grozny.attack &&
        getGroznyAttackOriginCells(state, grozny.id, unit.id, mode).length > 0
    )
    .sort((a, b) => {
      const distA = a.position
        ? chebyshevDistance(grozny.position!, a.position)
        : Number.MAX_SAFE_INTEGER;
      const distB = b.position
        ? chebyshevDistance(grozny.position!, b.position)
        : Number.MAX_SAFE_INTEGER;
      if (distA !== distB) return distA - distB;
      if (a.position && b.position) {
        const coordCompare = coordSort(a.position, b.position);
        if (coordCompare !== 0) return coordCompare;
      }
      return a.id.localeCompare(b.id);
    });
}

function attemptsToOptions(
  attempts: TyrantAttempt[]
): TyrantAttackCellOption[] {
  return attempts.map((attempt) => ({
    targetId: attempt.targetId,
    position: attempt.moveTo,
    mode: attempt.mode,
  }));
}

function getTyrantModes(
  state: GameState,
  grozny: UnitState,
  includeInvadeTime: boolean
): TyrantMode[] {
  const modes: TyrantMode[] = [];
  if (findGroznyTyrantAttempts(state, grozny, "normal").length > 0) {
    modes.push("normal");
  }
  if (
    includeInvadeTime &&
    canUseGroznyInvadeTimeForTyrant(state, grozny) &&
    findGroznyTyrantAttempts(state, grozny, "invadeTime").length > 0
  ) {
    modes.push("invadeTime");
  }
  return modes;
}

function getTyrantChoiceOptions(
  state: GameState,
  grozny: UnitState,
  includeInvadeTime: boolean
): TyrantAttackCellOption[] {
  const options: TyrantAttackCellOption[] = [];
  for (const mode of getTyrantModes(state, grozny, includeInvadeTime)) {
    options.push(...attemptsToOptions(findGroznyTyrantAttempts(state, grozny, mode)));
  }
  return options;
}

function requestTyrantOptionChoice(
  state: GameState,
  grozny: UnitState,
  options: TyrantMode[],
  kills: number,
  remaining: number,
  allowSkip: boolean
): ApplyResult {
  if (options.length === 0) {
    return { state, events: [] };
  }
  const context: TyrantOptionChoiceContext = {
    groznyId: grozny.id,
    options,
    kills,
    remaining,
    allowSkip,
  };
  return requestRoll(
    clearPendingRoll(state),
    grozny.owner,
    "groznyTyrantOptionChoice",
    context,
    grozny.id
  );
}

function requestTyrantAllyChoice(
  state: GameState,
  grozny: UnitState,
  mode: TyrantMode,
  options: string[],
  kills: number,
  remaining: number,
  allowSkip: boolean
): ApplyResult {
  if (options.length === 0) {
    return { state, events: [] };
  }
  const context: TyrantAllyChoiceContext = {
    groznyId: grozny.id,
    mode,
    options,
    kills,
    remaining,
    allowSkip,
  };
  return requestRoll(
    clearPendingRoll(state),
    grozny.owner,
    "groznyTyrantAllyChoice",
    context,
    grozny.id
  );
}

function requestTyrantAttackCellChoice(
  state: GameState,
  grozny: UnitState,
  mode: TyrantMode,
  targetId: string,
  cells: Coord[],
  kills: number,
  remaining: number,
  allowSkip: boolean
): ApplyResult {
  if (cells.length === 0) {
    return { state, events: [] };
  }
  const options = cells.map((position) => ({
    targetId,
    position,
    mode,
  }));
  const context: TyrantAttackCellChoiceContext = {
    groznyId: grozny.id,
    mode,
    targetId,
    options,
    kills,
    remaining,
    allowSkip,
  };
  return requestRoll(
    clearPendingRoll(state),
    grozny.owner,
    "groznyTyrantAttackCellChoice",
    context,
    grozny.id
  );
}

function continueTyrantFlow(
  state: GameState,
  grozny: UnitState,
  params: {
    mode?: TyrantMode;
    targetId?: string;
    kills: number;
    remaining: number;
    allowSkip: boolean;
    includeInvadeTime: boolean;
  }
): ApplyResult {
  const currentGrozny = state.units[grozny.id];
  if (!currentGrozny || !isGrozny(currentGrozny) || !currentGrozny.isAlive || !currentGrozny.position) {
    return { state, events: [] };
  }

  let mode = params.mode;
  if (!mode) {
    const modes = getTyrantModes(state, currentGrozny, params.includeInvadeTime);
    if (modes.length === 0) {
      return { state, events: [] };
    }
    if (params.allowSkip || modes.length > 1) {
      return requestTyrantOptionChoice(
        state,
        currentGrozny,
        modes,
        params.kills,
        params.remaining,
        params.allowSkip
      );
    }
    mode = modes[0];
  }

  const allies = getGroznyFinishableAllies(state, currentGrozny.id, mode);
  if (allies.length === 0) {
    return { state, events: [] };
  }

  let targetId = params.targetId;
  if (!targetId) {
    if (allies.length > 1) {
      return requestTyrantAllyChoice(
        state,
        currentGrozny,
        mode,
        allies.map((ally) => ally.id),
        params.kills,
        params.remaining,
        params.allowSkip
      );
    }
    targetId = allies[0].id;
  }

  if (!allies.some((ally) => ally.id === targetId)) {
    return { state, events: [] };
  }

  const cells = getGroznyAttackOriginCells(state, currentGrozny.id, targetId, mode);
  if (cells.length === 0) {
    return { state, events: [] };
  }

  return requestTyrantAttackCellChoice(
    state,
    currentGrozny,
    mode,
    targetId,
    cells,
    params.kills,
    params.remaining,
    params.allowSkip
  );
}

export function findGroznyTyrantAttempts(
  state: GameState,
  grozny: UnitState,
  mode: TyrantMode = "normal"
): TyrantAttempt[] {
  if (!grozny.position) return [];
  const attempts: TyrantAttempt[] = [];
  for (const ally of getGroznyFinishableAllies(state, grozny.id, mode)) {
    for (const moveTo of getGroznyAttackOriginCells(state, grozny.id, ally.id, mode)) {
      attempts.push({
        targetId: ally.id,
        moveTo,
        mode,
      });
    }
  }
  return attempts;
}

export function findGroznyTyrantAttempt(
  state: GameState,
  grozny: UnitState
): TyrantAttempt | null {
  return findGroznyTyrantAttempts(state, grozny, "normal")[0] ?? null;
}

export function maybeTriggerGroznyTyrant(
  state: GameState,
  unitId: string,
  rng: RNG
): ApplyResult {
  void rng;
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  if (!isGrozny(unit)) {
    return { state, events: [] };
  }
  if (state.pendingRoll) {
    return { state, events: [] };
  }

  const availabilityUnit = getStartTurnEconomyForAvailability(unit);
  const availabilityState = withUnit(state, availabilityUnit);
  const modes = getTyrantModes(availabilityState, availabilityUnit, true);
  if (modes.length === 0) {
    return { state, events: [] };
  }

  return requestTyrantOptionChoice(state, unit, modes, 0, 0, true);
}

function isTyrantOptionPayload(
  choice: ResolveRollChoice | undefined
): choice is { type: "groznyTyrantOption"; mode: TyrantMode } {
  return (
    typeof choice === "object" &&
    choice !== null &&
    (choice as { type?: unknown }).type === "groznyTyrantOption" &&
    ((choice as { mode?: unknown }).mode === "normal" ||
      (choice as { mode?: unknown }).mode === "invadeTime")
  );
}

function isTyrantAllyPayload(
  choice: ResolveRollChoice | undefined
): choice is { type: "groznyTyrantAlly"; targetId: string } {
  return (
    typeof choice === "object" &&
    choice !== null &&
    (choice as { type?: unknown }).type === "groznyTyrantAlly" &&
    typeof (choice as { targetId?: unknown }).targetId === "string"
  );
}

function isTyrantCellPayload(
  choice: ResolveRollChoice | undefined
): choice is {
  type: "groznyTyrantAttackCell";
  mode: TyrantMode;
  targetId: string;
  position: Coord;
} {
  return (
    typeof choice === "object" &&
    choice !== null &&
    (choice as { type?: unknown }).type === "groznyTyrantAttackCell" &&
    ((choice as { mode?: unknown }).mode === "normal" ||
      (choice as { mode?: unknown }).mode === "invadeTime") &&
    typeof (choice as { targetId?: unknown }).targetId === "string" &&
    typeof (choice as { position?: { col?: unknown } }).position?.col ===
      "number" &&
    typeof (choice as { position?: { row?: unknown } }).position?.row ===
      "number"
  );
}

function findMatchingTyrantOption(
  options: TyrantAttackCellOption[],
  choice: {
    mode: TyrantMode;
    targetId: string;
    position: Coord;
  }
): TyrantAttackCellOption | undefined {
  return options.find(
    (option) =>
      option.mode === choice.mode &&
      option.targetId === choice.targetId &&
      coordsEqual(option.position, choice.position)
  );
}

export function resolveGroznyTyrantOptionChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  void rng;
  const context = pending.context as TyrantOptionChoiceContext;
  const grozny = state.units[context.groznyId];
  if (!grozny || !isGrozny(grozny) || !grozny.isAlive || !grozny.position) {
    return { state, events: [] };
  }

  if (choice === "skip" && context.allowSkip) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!isTyrantOptionPayload(choice) || !context.options.includes(choice.mode)) {
    return { state, events: [] };
  }

  if (!getTyrantModes(state, grozny, choice.mode === "invadeTime").includes(choice.mode)) {
    return { state, events: [] };
  }

  return continueTyrantFlow(clearPendingRoll(state), grozny, {
    mode: choice.mode,
    kills: context.kills,
    remaining: context.remaining,
    allowSkip: context.allowSkip,
    includeInvadeTime: choice.mode === "invadeTime",
  });
}

export function resolveGroznyTyrantAllyChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  void rng;
  const context = pending.context as TyrantAllyChoiceContext;
  const grozny = state.units[context.groznyId];
  if (!grozny || !isGrozny(grozny) || !grozny.isAlive || !grozny.position) {
    return { state, events: [] };
  }

  if (choice === "skip" && context.allowSkip) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!isTyrantAllyPayload(choice) || !context.options.includes(choice.targetId)) {
    return { state, events: [] };
  }

  if (
    !getGroznyFinishableAllies(state, grozny.id, context.mode).some(
      (ally) => ally.id === choice.targetId
    )
  ) {
    return { state, events: [] };
  }

  return continueTyrantFlow(clearPendingRoll(state), grozny, {
    mode: context.mode,
    targetId: choice.targetId,
    kills: context.kills,
    remaining: context.remaining,
    allowSkip: context.allowSkip,
    includeInvadeTime: context.mode === "invadeTime",
  });
}

export function resolveGroznyTyrantAttackCellChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const context = pending.context as TyrantAttackCellChoiceContext;
  const grozny = state.units[context.groznyId];
  if (!grozny || !isGrozny(grozny) || !grozny.isAlive || !grozny.position) {
    return { state, events: [] };
  }

  if (choice === "skip" && context.allowSkip) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!isTyrantCellPayload(choice)) {
    return { state, events: [] };
  }

  if (choice.mode !== context.mode || choice.targetId !== context.targetId) {
    return { state, events: [] };
  }

  const pendingOption = findMatchingTyrantOption(context.options, choice);
  if (!pendingOption) {
    return { state, events: [] };
  }

  const legalCells = getGroznyAttackOriginCells(
    state,
    grozny.id,
    choice.targetId,
    choice.mode
  );
  const selected = legalCells.find((cell) => coordsEqual(cell, choice.position));
  if (!selected) {
    return { state, events: [] };
  }

  let workingGrozny = grozny;
  if (choice.mode === "invadeTime") {
    const spec = getAbilitySpec(ABILITY_GROZNY_INVADE_TIME);
    if (!spec) {
      return { state, events: [] };
    }
    const costs = spec.actionCost?.consumes ?? {};
    if (!canSpendSlots(workingGrozny, costs)) {
      return { state, events: [] };
    }
    const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
    const spent = spendCharges(workingGrozny, spec.id, chargeAmount);
    if (!spent.ok || !spent.unit) {
      return { state, events: [] };
    }
  }

  let nextState = clearPendingRoll(state);
  workingGrozny = nextState.units[grozny.id];
  const events: GameEvent[] = [];

  if (choice.mode === "invadeTime") {
    const spec = getAbilitySpec(ABILITY_GROZNY_INVADE_TIME);
    if (!spec) {
      return { state, events: [] };
    }
    const costs = spec.actionCost?.consumes ?? {};
    const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
    const spent = spendCharges(workingGrozny, spec.id, chargeAmount);
    if (!spent.ok || !spent.unit) {
      return { state, events: [] };
    }
    workingGrozny = spendSlots(spent.unit, costs);
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [workingGrozny.id]: workingGrozny,
      },
    };
    events.push(evAbilityUsed({ unitId: workingGrozny.id, abilityId: spec.id }));
  }

  const moved = applyGroznyFreeMove(nextState, workingGrozny, selected, rng);
  nextState = moved.state;
  const movedUnit = moved.unit;
  events.push(
    evAbilityUsed({ unitId: movedUnit.id, abilityId: ABILITY_GROZNY_TYRANT }),
    ...moved.events
  );

  if (!movedUnit.isAlive || !movedUnit.position) {
    return { state: nextState, events };
  }

  const ctx: AttackRollContext = {
    ...makeAttackContext({
      attackerId: movedUnit.id,
      defenderId: choice.targetId,
      consumeSlots: false,
      queueKind: "normal",
      ignoreRange: true,
    }),
    tyrant: {
      groznyId: movedUnit.id,
      kills: context.kills,
      remaining: Math.max(0, context.remaining - 1),
    } as TyrantChainState,
  };

  const requested = requestRoll(
    nextState,
    movedUnit.owner,
    "attack_attackerRoll",
    ctx,
    movedUnit.id
  );

  return {
    state: requested.state,
    events: [...events, ...requested.events],
  };
}

export function handleGroznyTyrantAfterAttack(
  state: GameState,
  events: GameEvent[],
  context: AttackRollContext,
  rng: RNG
): { state: GameState; events: GameEvent[]; requested: boolean } {
  void rng;
  const tyrant = context.tyrant as TyrantChainState | undefined;
  if (!tyrant) {
    return { state, events, requested: false };
  }

  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === context.attackerId &&
      event.defenderId === context.defenderId
  );
  if (!attackEvent || attackEvent.type !== "attackResolved") {
    return { state, events, requested: false };
  }

  let nextState = state;
  let kills = tyrant.kills;
  let remaining = tyrant.remaining;

  const attacker = nextState.units[context.attackerId];
  if (!attacker) {
    return { state: nextState, events, requested: false };
  }

  if (attackEvent.hit && attackEvent.defenderHpAfter <= 0) {
    const maxHp = getUnitBaseMaxHp(attacker);
    const healed = Math.min(maxHp, attacker.hp + attackEvent.damage);
    const boosted: UnitState = {
      ...attacker,
      attack: attacker.attack + 1,
      hp: healed,
    };
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [boosted.id]: boosted,
      },
    };

    kills += 1;
    remaining += 1;
    if (kills >= 2) {
      remaining += 1;
    }
  }

  if (remaining <= 0) {
    return { state: nextState, events, requested: false };
  }

  const grozny = nextState.units[context.attackerId];
  if (!grozny || !grozny.isAlive || !grozny.position) {
    return { state: nextState, events, requested: false };
  }

  const options = getTyrantChoiceOptions(nextState, grozny, false);
  if (options.length === 0) {
    return { state: nextState, events, requested: false };
  }

  const requested = continueTyrantFlow(nextState, grozny, {
    kills,
    remaining,
    allowSkip: false,
    includeInvadeTime: false,
  });

  return {
    state: requested.state,
    events: [...events, ...requested.events],
    requested: requested.state !== nextState || requested.events.length > 0,
  };
}
