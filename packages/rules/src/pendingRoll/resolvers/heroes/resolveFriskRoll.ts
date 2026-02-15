import type {
  ApplyResult,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
} from "../../../model";
import type { RNG } from "../../../rng";
import { rollD6 } from "../../../rng";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import {
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  spendCharges,
} from "../../../abilities";
import { clearPendingRoll, requestRoll } from "../../../core";
import { evAbilityUsed } from "../../../core";
import { revealUnit } from "../../../stealth";
import { getUnitBaseMaxHp } from "../../../actions/shared";
import { HERO_FRISK_ID } from "../../../heroes";
import type {
  FriskGenocideChoiceContext,
  FriskKeenEyeChoiceContext,
  FriskPacifismChoiceContext,
  FriskPacifismTargetChoiceContext,
  FriskWarmWordsHealRollContext,
} from "../../types";
import {
  FRISK_GENOCIDE_KEEN_EYE_COST,
  FRISK_GENOCIDE_PRECISION_STRIKE_COST,
  FRISK_PACIFISM_HUGS_COST,
  FRISK_PACIFISM_WARM_WORDS_COST,
  canFriskUsePacifism,
  getFriskKeenEyeTargetIds,
  tryApplyFriskPowerOfFriendship,
} from "../../../actions/heroes/frisk";

function parseFriskPacifismOption(
  choice: ResolveRollChoice | undefined
):
  | "hugs"
  | "childsCry"
  | "warmWords"
  | "powerOfFriendship"
  | undefined {
  if (!choice || typeof choice !== "object" || !("type" in choice)) {
    return undefined;
  }
  const payload = choice as { type?: string; option?: string };
  if (payload.type !== "friskPacifismOption") {
    return undefined;
  }
  if (
    payload.option === "hugs" ||
    payload.option === "childsCry" ||
    payload.option === "warmWords" ||
    payload.option === "powerOfFriendship"
  ) {
    return payload.option;
  }
  return undefined;
}

function parseFriskGenocideOption(
  choice: ResolveRollChoice | undefined
): "substitution" | "keenEye" | "precisionStrike" | undefined {
  if (!choice || typeof choice !== "object" || !("type" in choice)) {
    return undefined;
  }
  const payload = choice as { type?: string; option?: string };
  if (payload.type !== "friskGenocideOption") {
    return undefined;
  }
  if (
    payload.option === "substitution" ||
    payload.option === "keenEye" ||
    payload.option === "precisionStrike"
  ) {
    return payload.option;
  }
  return undefined;
}

function getFriskUnit(state: GameState, friskId: string) {
  const frisk = state.units[friskId];
  if (
    !frisk ||
    !frisk.isAlive ||
    !frisk.position ||
    frisk.heroId !== HERO_FRISK_ID
  ) {
    return null;
  }
  return frisk;
}

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
    const options = Array.isArray(ctx.hugsOptions) ? ctx.hugsOptions : [];
    if (options.length === 0) {
      return { state, events: [] };
    }
    const spent = spendCharges(frisk, ABILITY_FRISK_PACIFISM, FRISK_PACIFISM_HUGS_COST);
    if (!spent.ok) {
      return { state, events: [] };
    }
    const stateAfterSpend: GameState = {
      ...state,
      units: {
        ...state.units,
        [frisk.id]: spent.unit,
      },
    };
    const requested = requestRoll(
      clearPendingRoll(stateAfterSpend),
      frisk.owner,
      "friskPacifismHugsTargetChoice",
      { friskId: frisk.id, options } satisfies FriskPacifismTargetChoiceContext,
      frisk.id
    );
    return {
      state: requested.state,
      events: [
        evAbilityUsed({ unitId: frisk.id, abilityId: ABILITY_FRISK_PACIFISM }),
        ...requested.events,
      ],
    };
  }

  const options = Array.isArray(ctx.warmWordsOptions) ? ctx.warmWordsOptions : [];
  if (options.length === 0) {
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
  const stateAfterSpend: GameState = {
    ...state,
    units: {
      ...state.units,
      [frisk.id]: spent.unit,
    },
  };
  const requested = requestRoll(
    clearPendingRoll(stateAfterSpend),
    frisk.owner,
    "friskWarmWordsTargetChoice",
    { friskId: frisk.id, options } satisfies FriskPacifismTargetChoiceContext,
    frisk.id
  );
  return {
    state: requested.state,
    events: [
      evAbilityUsed({ unitId: frisk.id, abilityId: ABILITY_FRISK_PACIFISM }),
      ...requested.events,
    ],
  };
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

  return {
    state: clearPendingRoll({
      ...state,
      units: {
        ...state.units,
        [target.id]: {
          ...target,
          movementDisabledNextTurn: true,
        },
      },
    }),
    events: [],
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

  const roll = rollD6(rng);
  const maxHp = getUnitBaseMaxHp(target);
  const healedHp = Math.min(maxHp, target.hp + roll);
  const healedAmount = Math.max(0, healedHp - target.hp);

  return {
    state: clearPendingRoll({
      ...state,
      units: {
        ...state.units,
        [target.id]: {
          ...target,
          hp: healedHp,
        },
      },
    }),
    events:
      healedAmount > 0
        ? [
            {
              type: "unitHealed",
              unitId: target.id,
              amount: healedAmount,
              hpAfter: healedHp,
              sourceAbilityId: ABILITY_FRISK_PACIFISM,
            },
          ]
        : [],
  };
}

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


