import type { ApplyResult, GameEvent, GameState } from "../../../../model";
import { clearPendingRoll, evAoeResolved, evDamageBonusApplied } from "../../../../core";
import { findAttackResolved } from "../../../utils/attackEvents";

export function finalizeElCidAoE(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
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

export function maybeBuildPolkovodetsDamageEvent(
  attackEvents: GameEvent[],
  attackerId: string,
  defenderId: string,
  damageBonus: number,
  sourceId: string | null
): GameEvent | null {
  const attackEvent = findAttackResolved(attackEvents, attackerId, defenderId);
  if (
    !attackEvent ||
    attackEvent.type !== "attackResolved" ||
    !attackEvent.hit ||
    damageBonus <= 0 ||
    !sourceId
  ) {
    return null;
  }

  return evDamageBonusApplied({
    unitId: attackerId,
    amount: damageBonus,
    source: "polkovodets",
    fromUnitId: sourceId,
  });
}

export function updatePendingAoEFromAttack(
  state: GameState,
  attackEvents: GameEvent[],
  attackerId: string,
  defenderId: string
): GameState {
  const attackEvent = findAttackResolved(attackEvents, attackerId, defenderId);
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

  const revealedIds = attackEvents
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
