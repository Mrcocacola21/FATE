import type { ApplyResult, GameEvent, GameState, UnitState } from "../../../model";
import { getUnitAt } from "../../../board";
import { getBerserkerMovesForRoll } from "../../../movement";
import { canUnitEnterCell } from "../../../visibility";
import { ABILITY_GROZNY_TYRANT } from "../../../abilities";
import { clearPendingRoll, makeAttackContext, requestRoll } from "../../../core";
import { evAbilityUsed } from "../../../core";
import { getUnitBaseMaxHp } from "../../shared";
import type { AttackRollContext } from "../../types";
import type { RNG } from "../../../rng";
import { canAttackAllyFrom, chebyshevDistance, coordSort, isGrozny } from "./helpers";
import { applyGroznyFreeMove } from "./movement";
import type { TyrantAttempt, TyrantChainState } from "./types";

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
