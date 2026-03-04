import type {
  ApplyResult,
  GameEvent,
  GameState,
  UnitState,
} from "../../../../model";
import type { RNG } from "../../../../rng";
import { resolveAttack } from "../../../../combat";
import {
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  getCharges,
} from "../../../../abilities";
import { spendSlots } from "../../../../turnEconomy";
import { clearPendingRoll } from "../../../../core";
import { getPolkovodetsSource } from "../../../../actions/heroes/vlad";
import { handleGroznyTyrantAfterAttack } from "../../../../actions/heroes/grozny";
import {
  HERO_ASGORE_ID,
  HERO_FEMTO_ID,
  HERO_FRISK_ID,
  HERO_GUTS_ID,
  HERO_ODIN_ID,
  HERO_SANS_ID,
  HERO_UNDYNE_ID,
} from "../../../../heroes";
import { evDamageBonusApplied } from "../../../../core";
import type { AttackRollContext } from "../../../types";
import { sumDice } from "../../../utils/rollMath";

export function finalizeAttackFromContext(
  state: GameState,
  context: AttackRollContext,
  autoDefenseMode: "none" | "berserk" | "muninn" = "none",
  autoHit: boolean = false,
  damageOverride?: number,
  ignoreBonuses: boolean = false,
  forceMiss: boolean = false
): ApplyResult {
  const resolvedDamageOverride =
    damageOverride !== undefined ? damageOverride : context.damageOverride;
  const resolvedIgnoreBonuses = ignoreBonuses || context.ignoreBonuses === true;
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
    defenderUseBerserkAutoDefense: autoDefenseMode === "berserk",
    defenderUseMuninnAutoDefense: autoDefenseMode === "muninn",
    ignoreRange: context.ignoreRange,
    ignoreStealth: context.ignoreStealth,
    revealStealthedAllies: context.revealStealthedAllies,
    revealReason: context.revealReason,
    rangedAttack: context.rangedAttack,
    damageBonus,
    damageOverride: resolvedDamageOverride,
    ignoreBonuses: resolvedIgnoreBonuses,
    autoHit,
    forceMiss,
    rolls,
  });

  let updatedEvents = [...events];
  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === context.attackerId &&
      e.defenderId === context.defenderId
  );
  if (
    attackEvent &&
    attackEvent.type === "attackResolved" &&
    attackEvent.hit &&
    polkovodetsBonus > 0 &&
    !resolvedIgnoreBonuses &&
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

  const attackResolved = events.some((e) => e.type === "attackResolved");
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
    const attackEventForAoe = events.find(
      (e) =>
        e.type === "attackResolved" &&
        e.attackerId === context.attackerId &&
        e.defenderId === context.defenderId
    );
    let nextPendingAoE = updatedState.pendingAoE;
    if (attackEventForAoe && attackEventForAoe.type === "attackResolved") {
      const shouldRecord = attackEventForAoe.damage > 0;
      if (shouldRecord) {
        const damaged = nextPendingAoE.damagedUnitIds.includes(
          attackEventForAoe.defenderId
        )
          ? nextPendingAoE.damagedUnitIds
          : [...nextPendingAoE.damagedUnitIds, attackEventForAoe.defenderId];
        const damageByUnitId = {
          ...nextPendingAoE.damageByUnitId,
          [attackEventForAoe.defenderId]: attackEventForAoe.damage,
        };
        nextPendingAoE = {
          ...nextPendingAoE,
          damagedUnitIds: damaged,
          damageByUnitId,
        };
      }
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

    if (nextPendingAoE !== updatedState.pendingAoE) {
      updatedState = { ...updatedState, pendingAoE: nextPendingAoE };
    }
  }

  return { state: clearPendingRoll(updatedState), events: updatedEvents };
}

export function handleTyrantIfNeeded(
  state: GameState,
  events: GameEvent[],
  context: AttackRollContext,
  rng: RNG
): { state: GameState; events: GameEvent[]; requested: boolean } {
  return handleGroznyTyrantAfterAttack(state, events, context, rng);
}

export function canUseFriskSubstitution(defender: UnitState): boolean {
  return (
    defender.heroId === HERO_FRISK_ID &&
    getCharges(defender, ABILITY_FRISK_GENOCIDE) >= 3
  );
}

export function canUseFriskChildsCry(defender: UnitState): boolean {
  return (
    defender.heroId === HERO_FRISK_ID &&
    !defender.friskPacifismDisabled &&
    getCharges(defender, ABILITY_FRISK_PACIFISM) >= 5
  );
}

export function wouldAttackHitFromContext(
  ctx: AttackRollContext,
  attacker: UnitState,
  defender: UnitState
): boolean {
  if (ctx.friskForceMiss) return false;

  const attackerTotal =
    sumDice(ctx.attackerDice ?? []) + sumDice(ctx.tieBreakAttacker ?? []);
  const defenderTotal =
    sumDice(ctx.defenderDice ?? []) + sumDice(ctx.tieBreakDefender ?? []);

  let hit = attackerTotal > defenderTotal;
  const attackerDice = ctx.attackerDice ?? [];
  const defenderDice = ctx.defenderDice ?? [];
  const attackerDouble =
    attackerDice.length >= 2 && attackerDice[0] === attackerDice[1];
  const defenderDouble =
    defenderDice.length >= 2 && defenderDice[0] === defenderDice[1];

  if (
    (defender.class === "spearman" ||
      defender.heroId === HERO_ASGORE_ID ||
      defender.heroId === HERO_FEMTO_ID ||
      defender.heroId === HERO_ODIN_ID ||
      defender.heroId === HERO_SANS_ID ||
      defender.heroId === HERO_UNDYNE_ID) &&
    defenderDouble
  ) {
    hit = false;
  }
  if (
    (attacker.class === "knight" ||
      attacker.heroId === HERO_ODIN_ID ||
      attacker.heroId === HERO_GUTS_ID) &&
    attackerDouble
  ) {
    hit = true;
  }
  return hit;
}
