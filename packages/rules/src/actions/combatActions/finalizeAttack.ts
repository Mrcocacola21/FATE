import type { ApplyResult, GameState, UnitState } from "../../model";
import { resolveAttack } from "../../combat";
import { spendSlots } from "../../turnEconomy";
import { clearPendingRoll, evDamageBonusApplied } from "../../core";
import { getPolkovodetsSource } from "../heroes/vlad";
import type { AttackRollContext } from "../types";

export function finalizeAttackFromContext(
  state: GameState,
  context: AttackRollContext,
  useAutoDefense: boolean
): ApplyResult {
  const rolls = {
    attackerDice: context.attackerDice ?? [],
    defenderDice: context.defenderDice ?? [],
    tieBreakAttacker: context.tieBreakAttacker ?? [],
    tieBreakDefender: context.tieBreakDefender ?? [],
  };

  const sourceId =
    context.damageBonusSourceId ?? getPolkovodetsSource(state, context.attackerId);
  const polkovodetsBonus = sourceId ? 1 : 0;
  const damageBonus = polkovodetsBonus;

  const { nextState, events } = resolveAttack(state, {
    attackerId: context.attackerId,
    defenderId: context.defenderId,
    allowFriendlyTarget: context.allowFriendlyTarget,
    defenderUseBerserkAutoDefense: useAutoDefense,
    ignoreRange: context.ignoreRange,
    ignoreStealth: context.ignoreStealth,
    revealStealthedAllies: context.revealStealthedAllies,
    revealReason: context.revealReason,
    rangedAttack: context.rangedAttack,
    damageBonus,
    damageOverride: context.damageOverride,
    ignoreBonuses: context.ignoreBonuses,
    rolls,
  });

  let updatedEvents = [...events];
  const attackEvent = events.find(
    (event) =>
      event.type === "attackResolved" &&
      event.attackerId === context.attackerId &&
      event.defenderId === context.defenderId
  );
  if (
    attackEvent &&
    attackEvent.type === "attackResolved" &&
    attackEvent.hit &&
    polkovodetsBonus > 0 &&
    !context.ignoreBonuses &&
    sourceId
  ) {
    updatedEvents.push(
      evDamageBonusApplied({
        unitId: context.attackerId,
        amount: polkovodetsBonus,
        source: "polkovodets",
        fromUnitId: sourceId,
      })
    );
  }

  const attackResolved = events.some((event) => event.type === "attackResolved");
  let updatedState = nextState;

  if (attackResolved && context.consumeSlots) {
    const attackerAfter = updatedState.units[context.attackerId];
    if (attackerAfter) {
      const updatedAttacker: UnitState = spendSlots(attackerAfter, {
        attack: true,
        action: true,
      });
      updatedState = {
        ...updatedState,
        units: {
          ...updatedState.units,
          [updatedAttacker.id]: updatedAttacker,
        },
      };
    }
  }

  if (attackResolved && context.queueKind === "aoe" && updatedState.pendingAoE) {
    const queuedAttackEvent = events.find(
      (event) =>
        event.type === "attackResolved" &&
        event.attackerId === context.attackerId &&
        event.defenderId === context.defenderId
    );
    let nextPendingAoE = updatedState.pendingAoE;

    if (queuedAttackEvent && queuedAttackEvent.type === "attackResolved") {
      if (queuedAttackEvent.damage > 0) {
        const damaged = nextPendingAoE.damagedUnitIds.includes(
          queuedAttackEvent.defenderId
        )
          ? nextPendingAoE.damagedUnitIds
          : [...nextPendingAoE.damagedUnitIds, queuedAttackEvent.defenderId];
        const damageByUnitId = {
          ...nextPendingAoE.damageByUnitId,
          [queuedAttackEvent.defenderId]: queuedAttackEvent.damage,
        };
        nextPendingAoE = {
          ...nextPendingAoE,
          damagedUnitIds: damaged,
          damageByUnitId,
        };
      }
    }

    const revealedIds = events
      .filter((event) => event.type === "stealthRevealed")
      .map((event) => (event.type === "stealthRevealed" ? event.unitId : ""))
      .filter((unitId) => unitId.length > 0);
    if (revealedIds.length > 0) {
      const merged = Array.from(
        new Set([...nextPendingAoE.revealedUnitIds, ...revealedIds])
      );
      nextPendingAoE = { ...nextPendingAoE, revealedUnitIds: merged };
    }

    if (nextPendingAoE !== updatedState.pendingAoE) {
      updatedState = { ...updatedState, pendingAoE: nextPendingAoE };
    }
  }

  return { state: clearPendingRoll(updatedState), events: updatedEvents };
}
