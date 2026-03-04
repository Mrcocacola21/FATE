import type { ApplyResult, GameEvent, GameState, PendingRoll, ResolveRollChoice } from "../../../../model";
import type { RNG } from "../../../../rng";
import { canSpendSlots, spendSlots } from "../../../../turnEconomy";
import {
  ABILITY_FRISK_GENOCIDE,
  spendCharges,
} from "../../../../abilities";
import { clearPendingRoll, requestRoll, evAbilityUsed } from "../../../../core";
import { revealUnit } from "../../../../stealth";
import type {
  FriskGenocideChoiceContext,
  FriskKeenEyeChoiceContext,
} from "../../../types";
import {
  FRISK_GENOCIDE_KEEN_EYE_COST,
  FRISK_GENOCIDE_PRECISION_STRIKE_COST,
  getFriskKeenEyeTargetIds,
} from "../../../../actions/heroes/frisk";
import { getFriskUnit, parseFriskGenocideOption } from "./helpers";

export function resolveFriskGenocideChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as FriskGenocideChoiceContext;
  const frisk = getFriskUnit(state, ctx.friskId);
  if (!frisk) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const option = parseFriskGenocideOption(choice);
  if (!option) {
    return { state, events: [] };
  }

  if (option === "substitution") {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (option === "keenEye") {
    if (frisk.isStealthed) {
      return { state, events: [] };
    }
    if (!canSpendSlots(frisk, { stealth: true })) {
      return { state, events: [] };
    }
    const options = getFriskKeenEyeTargetIds(state, frisk.id);
    if (options.length === 0) {
      return { state, events: [] };
    }
    return requestRoll(
      clearPendingRoll(state),
      frisk.owner,
      "friskKeenEyeChoice",
      { friskId: frisk.id, options } satisfies FriskKeenEyeChoiceContext,
      frisk.id
    );
  }

  const spent = spendCharges(
    frisk,
    ABILITY_FRISK_GENOCIDE,
    FRISK_GENOCIDE_PRECISION_STRIKE_COST
  );
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updated = {
    ...spent.unit,
    friskPrecisionStrikeReady: true,
  };
  return {
    state: clearPendingRoll({
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    }),
    events: [evAbilityUsed({ unitId: updated.id, abilityId: ABILITY_FRISK_GENOCIDE })],
  };
}

export function resolveFriskKeenEyeChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as FriskKeenEyeChoiceContext;
  const frisk = getFriskUnit(state, ctx.friskId);
  if (!frisk) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (choice === "skip" || choice === "roll") {
    return requestRoll(
      clearPendingRoll(state),
      frisk.owner,
      "enterStealth",
      { unitId: frisk.id },
      frisk.id
    );
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== "friskKeenEyeTarget" || !payload.targetId) {
    return { state, events: [] };
  }
  if (!options.includes(payload.targetId)) {
    return { state, events: [] };
  }

  if (frisk.isStealthed || !canSpendSlots(frisk, { stealth: true })) {
    return { state, events: [] };
  }
  const spent = spendCharges(frisk, ABILITY_FRISK_GENOCIDE, FRISK_GENOCIDE_KEEN_EYE_COST);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const target = state.units[payload.targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }

  const afterFrisk = spendSlots(spent.unit, { stealth: true });
  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [afterFrisk.id]: afterFrisk,
    },
  };
  let events: GameEvent[] = [
    evAbilityUsed({ unitId: afterFrisk.id, abilityId: ABILITY_FRISK_GENOCIDE }),
  ];

  if (target.isStealthed) {
    const revealed = revealUnit(
      nextState,
      target.id,
      "search",
      rng,
      afterFrisk.id
    );
    nextState = revealed.state;
    events = [...events, ...revealed.events];
  }

  return { state: clearPendingRoll(nextState), events };
}
