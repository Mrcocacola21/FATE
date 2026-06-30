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
import { getUnitAt } from "../../../board";
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
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { canAttackAllyFrom, chebyshevDistance, coordSort, isGrozny } from "./helpers";
import { applyGroznyFreeMove } from "./movement";
import type {
  TyrantAttackCellChoiceContext,
  TyrantAttackCellOption,
  TyrantAttempt,
  TyrantChainState,
  TyrantMode,
} from "./types";

function coordsEqual(a: Coord, b: Coord): boolean {
  return a.col === b.col && a.row === b.row;
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

function getAllFreeBoardCells(state: GameState, unit: UnitState): Coord[] {
  const cells: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const coord = { col, row };
      if (!isInsideBoard(coord, state.boardSize)) continue;
      if (unit.position && coordsEqual(coord, unit.position)) continue;
      if (getUnitAt(state, coord)) continue;
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
    return getAllFreeBoardCells(state, grozny);
  }
  return sortByDistanceThenCoord(
    grozny.position,
    getBerserkerMovesForRoll(state, grozny.id, 6).filter(
      (dest) =>
        !getUnitAt(state, dest) && canUnitEnterCell(state, grozny.id, dest)
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

function attemptsToOptions(
  attempts: TyrantAttempt[]
): TyrantAttackCellOption[] {
  return attempts.map((attempt) => ({
    targetId: attempt.targetId,
    position: attempt.moveTo,
    mode: attempt.mode,
  }));
}

function getTyrantChoiceOptions(
  state: GameState,
  grozny: UnitState,
  includeInvadeTime: boolean
): TyrantAttackCellOption[] {
  const normal = attemptsToOptions(findGroznyTyrantAttempts(state, grozny, "normal"));
  const invadeTime =
    includeInvadeTime && canUseGroznyInvadeTimeForTyrant(state, grozny)
      ? attemptsToOptions(findGroznyTyrantAttempts(state, grozny, "invadeTime"))
      : [];
  return [...normal, ...invadeTime];
}

function requestTyrantAttackCellChoice(
  state: GameState,
  grozny: UnitState,
  options: TyrantAttackCellOption[],
  kills: number,
  remaining: number,
  allowSkip: boolean
): ApplyResult {
  if (options.length === 0) {
    return { state, events: [] };
  }
  const context: TyrantAttackCellChoiceContext = {
    groznyId: grozny.id,
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

export function findGroznyTyrantAttempts(
  state: GameState,
  grozny: UnitState,
  mode: TyrantMode = "normal"
): TyrantAttempt[] {
  if (!grozny.position) return [];
  const baseDamage = grozny.attack;
  const reachable = getTyrantDestinations(state, grozny, mode);
  if (reachable.length === 0) return [];

  const allies = Object.values(state.units).filter(
    (unit) =>
      unit.isAlive &&
      unit.position &&
      unit.owner === grozny.owner &&
      unit.id !== grozny.id
  );

  const attempts: TyrantAttempt[] = [];
  for (const ally of allies) {
    if (ally.hp > baseDamage) continue;
    const options = reachable.filter((dest) =>
      canAttackAllyFrom(state, grozny, ally, dest)
    );
    if (options.length === 0) continue;
    attempts.push(
      ...sortByDistanceThenCoord(grozny.position, options).map((moveTo) => ({
        targetId: ally.id,
        moveTo,
        mode,
      }))
    );
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

  const options = getTyrantChoiceOptions(state, unit, true);
  return requestTyrantAttackCellChoice(state, unit, options, 0, 0, true);
}

function isTyrantChoicePayload(
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

  if (!isTyrantChoicePayload(choice)) {
    return { state, events: [] };
  }

  const pendingOption = findMatchingTyrantOption(context.options, choice);
  if (!pendingOption) {
    return { state, events: [] };
  }

  const legalOptions = getTyrantChoiceOptions(
    state,
    grozny,
    choice.mode === "invadeTime"
  );
  const selected = findMatchingTyrantOption(legalOptions, choice);
  if (!selected) {
    return { state, events: [] };
  }

  let nextState = clearPendingRoll(state);
  let workingGrozny = nextState.units[grozny.id];
  const events: GameEvent[] = [];

  if (selected.mode === "invadeTime") {
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

  const moved = applyGroznyFreeMove(nextState, workingGrozny, selected.position, rng);
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
      defenderId: selected.targetId,
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

  const requested = requestTyrantAttackCellChoice(
    nextState,
    grozny,
    options,
    kills,
    remaining,
    false
  );

  return {
    state: requested.state,
    events: [...events, ...requested.events],
    requested: true,
  };
}
