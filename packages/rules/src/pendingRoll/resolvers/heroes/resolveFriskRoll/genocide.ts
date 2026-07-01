import type { ApplyResult, GameEvent, GameState, PendingRoll, ResolveRollChoice } from "../../../../model";
import type { RNG } from "../../../../rng";
import { ABILITY_FRISK_GENOCIDE } from "../../../../abilities";
import { clearPendingRoll, makeAttackContext, requestRoll } from "../../../../core";
import {
  canCommitAbilityCost,
  commitAbilityCost,
} from "../../../../actions/abilityCosts";
import { getLegalAttackTargets } from "../../../../legal";
import { revealUnit } from "../../../../stealth";
import type {
  FriskGenocideChoiceContext,
  FriskKeenEyeChoiceContext,
  FriskPrecisionStrikeTargetChoiceContext,
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
    if (
      !canCommitAbilityCost(state, frisk.id, ABILITY_FRISK_GENOCIDE, {
        costs: { action: true },
        chargeAmount: FRISK_GENOCIDE_KEEN_EYE_COST,
      })
    ) {
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

  if (
    !canCommitAbilityCost(state, frisk.id, ABILITY_FRISK_GENOCIDE, {
      costs: { attack: true, action: true },
      chargeAmount: FRISK_GENOCIDE_PRECISION_STRIKE_COST,
    })
  ) {
    return { state, events: [] };
  }
  const options = getLegalAttackTargets(state, frisk.id);
  if (options.length === 0) {
    return { state, events: [] };
  }
  return requestRoll(
    clearPendingRoll(state),
    frisk.owner,
    "friskPrecisionStrikeTargetChoice",
    { friskId: frisk.id, options } satisfies FriskPrecisionStrikeTargetChoiceContext,
    frisk.id
  );
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

  if (frisk.isStealthed) {
    return { state, events: [] };
  }

  const target = state.units[payload.targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }

  const committed = commitAbilityCost(state, frisk.id, ABILITY_FRISK_GENOCIDE, {
    costs: { action: true },
    chargeAmount: FRISK_GENOCIDE_KEEN_EYE_COST,
  });
  if (!committed.ok) return { state, events: [] };
  const afterFrisk = committed.unit;
  let nextState: GameState = committed.state;
  let events: GameEvent[] = committed.events;

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

export function resolveFriskPrecisionStrikeTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as FriskPrecisionStrikeTargetChoiceContext;
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
  if (!payload || payload.type !== "friskPrecisionStrikeTarget" || !payload.targetId) {
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

  const committed = commitAbilityCost(state, frisk.id, ABILITY_FRISK_GENOCIDE, {
    costs: {},
    chargeAmount: FRISK_GENOCIDE_PRECISION_STRIKE_COST,
  });
  if (!committed.ok) return { state, events: [] };

  const updated = {
    ...committed.unit,
    friskPrecisionStrikeReady: true,
  };
  const stateAfterSpend: GameState = {
    ...clearPendingRoll(committed.state),
    units: {
      ...committed.state.units,
      [updated.id]: updated,
    },
  };
  const requested = requestRoll(
    stateAfterSpend,
    updated.owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: updated.id,
      defenderId: target.id,
      consumeSlots: true,
      queueKind: "normal",
    }),
    updated.id
  );

  return {
    state: requested.state,
    events: [...committed.events, ...requested.events],
  };
}
