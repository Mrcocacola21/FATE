import type { ApplyResult, GameEvent, GameState } from "../../model";
import { replacePendingRoll, evAoeResolved, makeAttackContext } from "../../core";

export function advanceCombatQueue(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const queue = state.pendingCombatQueue ?? [];
  if (queue.length === 0) {
    if (state.pendingAoE) {
      const aoe = state.pendingAoE;
      const nextState: GameState = { ...state, pendingAoE: null };
      return {
        state: nextState,
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
    return { state, events };
  }

  const [, ...rest] = queue;
  let nextState: GameState = { ...state, pendingCombatQueue: rest };
  let nextEvents = [...events];

  if (rest.length === 0) {
    if (nextState.pendingAoE) {
      const aoe = nextState.pendingAoE;
      nextState = { ...nextState, pendingAoE: null };
      nextEvents.push(
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
        })
      );
    }
    return { state: nextState, events: nextEvents };
  }

  const nextEntry = rest[0];
  const attacker = nextState.units[nextEntry.attackerId];
  const defender = nextState.units[nextEntry.defenderId];
  if (!attacker || !defender) {
    return advanceCombatQueue(nextState, nextEvents);
  }

  const ctx = makeAttackContext({
    attackerId: nextEntry.attackerId,
    defenderId: nextEntry.defenderId,
    ignoreRange: nextEntry.ignoreRange,
    ignoreStealth: nextEntry.ignoreStealth,
    damageBonus: nextEntry.damageBonus,
    damageBonusSourceId: nextEntry.damageBonusSourceId,
    rangedAttack: nextEntry.rangedAttack,
    damageOverride: nextEntry.damageOverride,
    ignoreBonuses: nextEntry.ignoreBonuses,
    consumeSlots: nextEntry.consumeSlots ?? false,
    queueKind: nextEntry.kind,
  });

  const rollKind =
    nextEntry.kind === "riderPath"
      ? "riderPathAttack_attackerRoll"
      : "attack_attackerRoll";
  const requested = replacePendingRoll(
    nextState,
    attacker.owner,
    rollKind,
    ctx,
    attacker.id
  );

  nextEvents = [...nextEvents, ...requested.events];
  return { state: requested.state, events: nextEvents };
}
