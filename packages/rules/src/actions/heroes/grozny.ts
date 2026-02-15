import type { ApplyResult, GameAction, GameEvent, GameState, UnitState } from "../../model";
import { isInsideBoard } from "../../model";
import type { Coord } from "../../model";
import { coordsEqual, getUnitAt } from "../../board";
import { canAttackTarget } from "../../combat";
import { getBerserkerMovesForRoll } from "../../movement";
import { canUnitEnterCell } from "../../visibility";
import { ABILITY_GROZNY_INVADE_TIME, ABILITY_GROZNY_TYRANT, getAbilitySpec, spendCharges } from "../../abilities";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { applyStakeTriggerIfAny } from "../../core";
import { evAbilityUsed, evStealthRevealed, evUnitMoved } from "../../core";
import { clearPendingRoll, requestRoll } from "../../core";
import { makeAttackContext } from "../../core";
import { getUnitBaseMaxHp } from "../shared";
import type { AttackRollContext } from "../types";
import type { RNG } from "../../rng";
import { HERO_GROZNY_ID } from "../../heroes";

type TyrantAttempt = { targetId: string; moveTo: Coord };

export type TyrantChainState = {
  groznyId: string;
  kills: number;
  remaining: number;
};

function isGrozny(unit: UnitState): boolean {
  return unit.heroId === HERO_GROZNY_ID;
}

function coordSort(a: Coord, b: Coord): number {
  if (a.col !== b.col) return a.col - b.col;
  return a.row - b.row;
}

function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

function canAttackAllyFrom(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
  from: Coord
): boolean {
  const attackerAt: UnitState = { ...attacker, position: from };
  const fakeDefender: UnitState = {
    ...defender,
    owner: attacker.owner === "P1" ? "P2" : "P1",
    isStealthed: false,
  };
  return canAttackTarget(state, attackerAt, fakeDefender);
}

export function findGroznyTyrantAttempt(
  state: GameState,
  grozny: UnitState
): TyrantAttempt | null {
  if (!grozny.position) return null;
  const baseDamage = grozny.attack;
  const reachable = getBerserkerMovesForRoll(state, grozny.id, 6).filter(
    (dest) => !getUnitAt(state, dest) && canUnitEnterCell(state, grozny.id, dest)
  );
  if (reachable.length === 0) return null;

  const allies = Object.values(state.units).filter(
    (unit) =>
      unit.isAlive &&
      unit.position &&
      unit.owner === grozny.owner &&
      unit.id !== grozny.id
  );

  for (const ally of allies) {
    if (ally.hp > baseDamage) continue;
    const options = reachable.filter((dest) =>
      canAttackAllyFrom(state, grozny, ally, dest)
    );
    if (options.length === 0) continue;
    const scored = options.map((coord) => ({
      coord,
      dist: chebyshevDistance(grozny.position!, coord),
    }));
    scored.sort((a, b) => {
      if (a.dist !== b.dist) return a.dist - b.dist;
      return coordSort(a.coord, b.coord);
    });
    return { targetId: ally.id, moveTo: scored[0].coord };
  }

  return null;
}

function revealAdjacentStealthedEnemies(
  state: GameState,
  mover: UnitState
): { state: GameState; events: GameEvent[] } {
  if (!mover.position) return { state, events: [] };
  const moverOwner = mover.owner;
  const moverPos = mover.position;
  let nextState = state;
  const events: GameEvent[] = [];

  for (const other of Object.values(nextState.units)) {
    if (!other.isAlive || !other.position) continue;
    if (other.owner === moverOwner) continue;
    if (!other.isStealthed) continue;

    const dist = chebyshevDistance(other.position, moverPos);
    if (dist > 1) continue;

    const revealed: UnitState = {
      ...other,
      isStealthed: false,
      stealthTurnsLeft: 0,
    };
    const updatedLastKnown = {
      ...nextState.lastKnownPositions,
      P1: { ...(nextState.lastKnownPositions?.P1 ?? {}) },
      P2: { ...(nextState.lastKnownPositions?.P2 ?? {}) },
    };
    delete updatedLastKnown.P1[revealed.id];
    delete updatedLastKnown.P2[revealed.id];

    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [revealed.id]: revealed,
      },
      knowledge: {
        ...nextState.knowledge,
        [moverOwner]: {
          ...(nextState.knowledge?.[moverOwner] ?? {}),
          [revealed.id]: true,
        },
      },
      lastKnownPositions: updatedLastKnown,
    };

    events.push(
      evStealthRevealed({
        unitId: revealed.id,
        reason: "adjacency",
        revealerId: mover.id,
      })
    );
  }

  return { state: nextState, events };
}

export function applyGroznyFreeMove(
  state: GameState,
  unit: UnitState,
  to: Coord,
  rng: RNG
): { state: GameState; events: GameEvent[]; unit: UnitState } {
  if (!unit.position || coordsEqual(unit.position, to)) {
    return { state, events: [], unit };
  }

  const from = unit.position;
  let movedUnit: UnitState = {
    ...unit,
    position: { ...to },
  };

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [movedUnit.id]: movedUnit,
    },
  };

  const events: GameEvent[] = [
    evUnitMoved({ unitId: movedUnit.id, from, to: movedUnit.position! }),
  ];

  const stakeResult = applyStakeTriggerIfAny(
    nextState,
    movedUnit,
    movedUnit.position!,
    rng
  );
  if (stakeResult.triggered) {
    nextState = stakeResult.state;
    movedUnit = stakeResult.unit;
    events.push(...stakeResult.events);
  }

  if (!movedUnit.isAlive || !movedUnit.position) {
    return { state: nextState, events, unit: movedUnit };
  }

  const revealResult = revealAdjacentStealthedEnemies(nextState, movedUnit);
  nextState = revealResult.state;
  events.push(...revealResult.events);

  return { state: nextState, events, unit: movedUnit };
}

export function applyGroznyInvadeTime(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (!isGrozny(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as { to?: Coord; target?: Coord } | undefined;
  const dest = payload?.to ?? payload?.target;
  if (!dest || !isInsideBoard(dest, state.boardSize)) {
    return { state, events: [] };
  }
  if (coordsEqual(dest, unit.position)) {
    return { state, events: [] };
  }
  if (getUnitAt(state, dest)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_GROZNY_INVADE_TIME);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok || !spent.unit) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(spent.unit, costs);
  const baseState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const moved = applyGroznyFreeMove(baseState, updatedUnit, dest, rng);
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
    ...moved.events,
  ];

  return { state: moved.state, events };
}

export function maybeTriggerGroznyTyrant(
  state: GameState,
  unitId: string,
  rng: RNG
): ApplyResult {
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

  const attempt = findGroznyTyrantAttempt(state, unit);
  if (!attempt) {
    return { state, events: [] };
  }

  const moved = applyGroznyFreeMove(state, unit, attempt.moveTo, rng);
  let nextState = moved.state;
  const movedUnit = moved.unit;
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: movedUnit.id, abilityId: ABILITY_GROZNY_TYRANT }),
    ...moved.events,
  ];

  if (!movedUnit.isAlive || !movedUnit.position) {
    return { state: nextState, events };
  }

  const ctx: AttackRollContext = {
    ...makeAttackContext({
      attackerId: movedUnit.id,
      defenderId: attempt.targetId,
      consumeSlots: false,
      queueKind: "normal",
      ignoreRange: true,
    }),
    tyrant: {
      groznyId: movedUnit.id,
      kills: 0,
      remaining: 0,
    } as TyrantChainState,
  };

  const requested = requestRoll(
    clearPendingRoll(nextState),
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

  const attempt = findGroznyTyrantAttempt(nextState, grozny);
  if (!attempt) {
    return { state: nextState, events, requested: false };
  }

  const moved = applyGroznyFreeMove(nextState, grozny, attempt.moveTo, rng);
  nextState = moved.state;
  let nextEvents = [...events, ...moved.events];
  const movedUnit = moved.unit;
  if (!movedUnit.isAlive || !movedUnit.position) {
    return { state: nextState, events: nextEvents, requested: false };
  }

  const ctx: AttackRollContext = {
    ...makeAttackContext({
      attackerId: movedUnit.id,
      defenderId: attempt.targetId,
      consumeSlots: false,
      queueKind: "normal",
      ignoreRange: true,
    }),
    tyrant: {
      groznyId: movedUnit.id,
      kills,
      remaining: remaining - 1,
    } as TyrantChainState,
  };

  const requested = requestRoll(
    clearPendingRoll(nextState),
    movedUnit.owner,
    "attack_attackerRoll",
    ctx,
    movedUnit.id
  );

  nextEvents = [...nextEvents, ...requested.events];
  return { state: requested.state, events: nextEvents, requested: true };
}

