import type { ApplyResult, GameEvent, GameState } from "../../../../model";
import { clearPendingRoll, evAoeResolved } from "../../../../core";

export function finalizeForestAoE(state: GameState, events: GameEvent[]): ApplyResult {
  if (!state.pendingAoE) {
    return { state: clearPendingRoll(state), events };
  }

  const aoe = state.pendingAoE;
  const nextState: GameState = { ...state, pendingAoE: null };
  return {
    state: clearPendingRoll(nextState),
    events: [
      ...events,
      evAoeResolved({
        sourceUnitId: aoe.casterId,
        abilityId: aoe.abilityId,
        casterId: aoe.casterId,
        center: aoe.center,
        radius: aoe.radius,
        affectedUnitIds: aoe.affectedUnitIds,
        revealedUnitIds: aoe.revealedUnitIds,
        damagedUnitIds: aoe.damagedUnitIds,
        damageByUnitId: aoe.damageByUnitId,
      }),
    ],
  };
}

export function applyForestMovementDisableOnHit(
  state: GameState,
  events: GameEvent[],
  targetId: string
): GameState {
  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.defenderId === targetId
  );
  if (!attackEvent || attackEvent.type !== "attackResolved" || !attackEvent.hit) {
    return state;
  }

  const hitUnit = state.units[targetId];
  if (!hitUnit) return state;
  return {
    ...state,
    units: {
      ...state.units,
      [hitUnit.id]: {
        ...hitUnit,
        movementDisabledNextTurn: true,
      },
    },
  };
}

export function updatePendingAoeFromAttack(
  state: GameState,
  events: GameEvent[],
  attackerId: string,
  defenderId: string
): GameState {
  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === attackerId &&
      e.defenderId === defenderId
  );
  if (!attackEvent || attackEvent.type !== "attackResolved" || !state.pendingAoE) {
    return state;
  }

  let nextPendingAoE = state.pendingAoE;
  if (attackEvent.damage > 0) {
    const damaged = nextPendingAoE.damagedUnitIds.includes(attackEvent.defenderId)
      ? nextPendingAoE.damagedUnitIds
      : [...nextPendingAoE.damagedUnitIds, attackEvent.defenderId];
    const damageByUnitId = {
      ...nextPendingAoE.damageByUnitId,
      [attackEvent.defenderId]: attackEvent.damage,
    };
    nextPendingAoE = {
      ...nextPendingAoE,
      damagedUnitIds: damaged,
      damageByUnitId,
    };
  }

  const revealedIds = events
    .filter((e) => e.type === "stealthRevealed")
    .map((e) => (e.type === "stealthRevealed" ? e.unitId : ""))
    .filter((id) => id.length > 0);
  if (revealedIds.length > 0) {
    const merged = Array.from(
      new Set([...nextPendingAoE.revealedUnitIds, ...revealedIds])
    );
    nextPendingAoE = { ...nextPendingAoE, revealedUnitIds: merged };
  }

  if (nextPendingAoE !== state.pendingAoE) {
    return { ...state, pendingAoE: nextPendingAoE };
  }
  return state;
}
