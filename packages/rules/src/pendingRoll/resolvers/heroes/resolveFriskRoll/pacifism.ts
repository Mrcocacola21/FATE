import type { ApplyResult, GameState, PendingRoll, ResolveRollChoice } from "../../../../model";
import type { RNG } from "../../../../rng";
import { rollD6 } from "../../../../rng";
import {
  ABILITY_FRISK_PACIFISM,
  getCharges,
  spendCharges,
} from "../../../../abilities";
import { canSpendSlots, spendSlots } from "../../../../turnEconomy";
import { clearPendingRoll, requestRoll, evAbilityUsed } from "../../../../core";
import { getUnitBaseMaxHp } from "../../../../actions/shared";
import type {
  FriskPacifismChoiceContext,
  FriskPacifismTargetChoiceContext,
  FriskWarmWordsHealRollContext,
} from "../../../types";
import {
  FRISK_PACIFISM_HUGS_COST,
  FRISK_PACIFISM_WARM_WORDS_COST,
  canFriskUsePacifism,
  tryApplyFriskPowerOfFriendship,
} from "../../../../actions/heroes/frisk";
import { getFriskUnit, parseFriskPacifismOption } from "./helpers";

export function resolveFriskPacifismChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as FriskPacifismChoiceContext;
  const frisk = getFriskUnit(state, ctx.friskId);
  if (!frisk || !canFriskUsePacifism(frisk)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const option = parseFriskPacifismOption(choice);
  if (!option) {
    return { state, events: [] };
  }

  if (option === "childsCry") {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (option === "powerOfFriendship") {
    const cleared = clearPendingRoll(state);
    const friendship = tryApplyFriskPowerOfFriendship(cleared);
    if (!friendship) {
      return { state: cleared, events: [] };
    }
    return friendship;
  }

  if (option === "hugs") {
    if (getCharges(frisk, ABILITY_FRISK_PACIFISM) < FRISK_PACIFISM_HUGS_COST) {
      return { state, events: [] };
    }
    const options = Array.isArray(ctx.hugsOptions) ? ctx.hugsOptions : [];
    if (options.length === 0) {
      return { state, events: [] };
    }
    const requested = requestRoll(
      clearPendingRoll(state),
      frisk.owner,
      "friskPacifismHugsTargetChoice",
      { friskId: frisk.id, options } satisfies FriskPacifismTargetChoiceContext,
      frisk.id
    );
    return requested;
  }

  const options = Array.isArray(ctx.warmWordsOptions) ? ctx.warmWordsOptions : [];
  if (getCharges(frisk, ABILITY_FRISK_PACIFISM) < FRISK_PACIFISM_WARM_WORDS_COST) {
    return { state, events: [] };
  }
  if (options.length === 0) {
    return { state, events: [] };
  }
  const requested = requestRoll(
    clearPendingRoll(state),
    frisk.owner,
    "friskWarmWordsTargetChoice",
    { friskId: frisk.id, options } satisfies FriskPacifismTargetChoiceContext,
    frisk.id
  );
  return requested;
}

export function resolveFriskPacifismHugsTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as FriskPacifismTargetChoiceContext;
  const frisk = getFriskUnit(state, ctx.friskId);
  if (!frisk) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== "friskPacifismHugsTarget" || !payload.targetId) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(payload.targetId)) {
    return { state, events: [] };
  }

  const target = state.units[payload.targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }

  if (!canSpendSlots(frisk, { action: true })) {
    return { state, events: [] };
  }
  const spent = spendCharges(frisk, ABILITY_FRISK_PACIFISM, FRISK_PACIFISM_HUGS_COST);
  if (!spent.ok) {
    return { state, events: [] };
  }
  const afterFrisk = spendSlots(spent.unit, { action: true });

  return {
    state: clearPendingRoll({
      ...state,
      units: {
        ...state.units,
        [afterFrisk.id]: afterFrisk,
        [target.id]: {
          ...target,
          movementDisabledNextTurn: true,
        },
      },
    }),
    events: [evAbilityUsed({ unitId: afterFrisk.id, abilityId: ABILITY_FRISK_PACIFISM })],
  };
}

export function resolveFriskWarmWordsTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as FriskPacifismTargetChoiceContext;
  const frisk = getFriskUnit(state, ctx.friskId);
  if (!frisk) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== "friskWarmWordsTarget" || !payload.targetId) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(payload.targetId)) {
    return { state, events: [] };
  }

  const target = state.units[payload.targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }

  return requestRoll(
    clearPendingRoll(state),
    frisk.owner,
    "friskWarmWordsHealRoll",
    {
      friskId: frisk.id,
      targetId: target.id,
    } satisfies FriskWarmWordsHealRollContext,
    frisk.id
  );
}

export function resolveFriskWarmWordsHealRoll(
  state: GameState,
  pending: PendingRoll,
  _choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as FriskWarmWordsHealRollContext;
  const frisk = getFriskUnit(state, ctx.friskId);
  const target = state.units[ctx.targetId];
  if (!frisk || !target || !target.isAlive || !target.position) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (!canSpendSlots(frisk, { action: true })) {
    return { state, events: [] };
  }
  const spent = spendCharges(
    frisk,
    ABILITY_FRISK_PACIFISM,
    FRISK_PACIFISM_WARM_WORDS_COST
  );
  if (!spent.ok) {
    return { state, events: [] };
  }
  const afterFrisk = spendSlots(spent.unit, { action: true });
  const roll = rollD6(rng);
  const maxHp = getUnitBaseMaxHp(target);
  const healedHp = Math.min(maxHp, target.hp + roll);
  const healedAmount = Math.max(0, healedHp - target.hp);
  const healedTarget =
    target.id === afterFrisk.id
      ? { ...afterFrisk, hp: healedHp }
      : { ...target, hp: healedHp };
  const units = {
    ...state.units,
    [afterFrisk.id]: afterFrisk,
    [healedTarget.id]: healedTarget,
  };

  return {
    state: clearPendingRoll({
      ...state,
      units,
    }),
    events: [
      evAbilityUsed({ unitId: afterFrisk.id, abilityId: ABILITY_FRISK_PACIFISM }),
      ...(healedAmount > 0
        ? [
            {
              type: "unitHealed" as const,
              unitId: target.id,
              amount: healedAmount,
              hpAfter: healedHp,
              sourceAbilityId: ABILITY_FRISK_PACIFISM,
            },
          ]
        : []),
    ],
  };
}
