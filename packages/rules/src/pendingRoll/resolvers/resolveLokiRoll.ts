import type {
  ApplyResult,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
} from "../../model";
import type { RNG } from "../../rng";
import { rollD6 } from "../../rng";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import {
  ABILITY_LOKI_ILLUSORY_DOUBLE,
  ABILITY_LOKI_LAUGHT,
  spendCharges,
  getAbilityViewsForUnit,
} from "../../abilities";
import { clearPendingRoll, requestRoll } from "../../shared/rollUtils";
import { evAbilityUsed } from "../../shared/events";
import { makeAttackContext } from "../../shared/combatCtx";
import { applyUseAbility } from "../../actions/abilityActions";
import type {
  LokiChickenTargetChoiceContext,
  LokiLaughtChoiceContext,
  LokiMindControlEnemyChoiceContext,
  LokiMindControlTargetChoiceContext,
} from "../types";
import {
  addLokiChicken,
  addLokiMoveLock,
  getLokiChickenTargetIds,
  getLokiForcedAttackTargetIds,
  getLokiMindControlEnemyIds,
  getLokiSpinCandidateIds,
  getLokiTricksterAreaTargetIds,
  isLoki,
  isLokiChicken,
  pickRandomFromIds,
} from "../../actions/heroes/loki";

const COST_AGAIN_SOME_NONSENSE = 3;
const COST_CHICKEN = 5;
const COST_MIND_CONTROL = 10;
const COST_SPIN_THE_DRUM = 12;
const COST_GREAT_LOKI_JOKE = 15;

function parseChoiceOption(
  choice: ResolveRollChoice | undefined
): "againSomeNonsense" | "chicken" | "mindControl" | "spinTheDrum" | "greatLokiJoke" | null {
  if (choice === "skip") {
    return null;
  }
  if (!choice || typeof choice !== "object" || !("type" in choice)) {
    return undefined as never;
  }
  const payload = choice as { type?: string; option?: string };
  if (payload.type !== "lokiLaughtOption") {
    return undefined as never;
  }
  switch (payload.option) {
    case "againSomeNonsense":
    case "chicken":
    case "mindControl":
    case "spinTheDrum":
    case "greatLokiJoke":
      return payload.option;
    default:
      return undefined as never;
  }
}

function spendLaughter(
  state: GameState,
  lokiId: string,
  cost: number
): {
  ok: boolean;
  state: GameState;
  loki: ReturnType<typeof getLokiUnit>;
  events: GameEvent[];
} {
  const loki = getLokiUnit(state, lokiId);
  if (!loki) {
    return { ok: false, state, loki: null, events: [] };
  }
  const spent = spendCharges(loki, ABILITY_LOKI_LAUGHT, cost);
  if (!spent.ok) {
    return { ok: false, state, loki, events: [] };
  }
  const updatedLoki = spent.unit;
  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedLoki.id]: updatedLoki,
    },
  };
  return {
    ok: true,
    state: nextState,
    loki: updatedLoki,
    events: [evAbilityUsed({ unitId: updatedLoki.id, abilityId: ABILITY_LOKI_LAUGHT })],
  };
}

function getLokiUnit(state: GameState, lokiId: string) {
  const unit = state.units[lokiId];
  if (!unit || !unit.isAlive || !unit.position || !isLoki(unit)) {
    return null;
  }
  return unit;
}

function resolveAgainSomeNonsense(
  state: GameState,
  lokiId: string,
  rng: RNG
): ApplyResult {
  const spent = spendLaughter(state, lokiId, COST_AGAIN_SOME_NONSENSE);
  if (!spent.ok || !spent.loki) {
    return { state, events: [] };
  }

  const targetIds = getLokiTricksterAreaTargetIds(spent.state, lokiId);
  if (targetIds.length === 0) {
    return { state: clearPendingRoll(spent.state), events: spent.events };
  }

  const units = { ...spent.state.units };
  for (const targetId of targetIds) {
    const target = units[targetId];
    if (!target || !target.isAlive) continue;
    const resistRoll = rollD6(rng);
    if (resistRoll >= 5) continue;
    units[targetId] = addLokiMoveLock(target, lokiId);
  }

  return {
    state: clearPendingRoll({ ...spent.state, units }),
    events: spent.events,
  };
}

function resolveChickenMenuChoice(state: GameState, lokiId: string): ApplyResult {
  const options = getLokiChickenTargetIds(state, lokiId);
  if (options.length === 0) {
    return { state, events: [] };
  }

  const spent = spendLaughter(state, lokiId, COST_CHICKEN);
  if (!spent.ok || !spent.loki) {
    return { state, events: [] };
  }

  const requested = requestRoll(
    clearPendingRoll(spent.state),
    spent.loki.owner,
    "lokiChickenTargetChoice",
    { lokiId, options } satisfies LokiChickenTargetChoiceContext,
    spent.loki.id
  );
  return { state: requested.state, events: [...spent.events, ...requested.events] };
}

function resolveMindControlMenuChoice(state: GameState, lokiId: string): ApplyResult {
  const loki = getLokiUnit(state, lokiId);
  if (!loki) {
    return { state, events: [] };
  }
  if (!canSpendSlots(loki, { action: true })) {
    return { state, events: [] };
  }

  const options = getLokiMindControlEnemyIds(state, lokiId);
  if (options.length === 0) {
    return { state, events: [] };
  }

  const spent = spendLaughter(state, lokiId, COST_MIND_CONTROL);
  if (!spent.ok || !spent.loki) {
    return { state, events: [] };
  }

  const afterAction = spendSlots(spent.loki, { action: true });
  const stateAfterAction: GameState = {
    ...spent.state,
    units: {
      ...spent.state.units,
      [afterAction.id]: afterAction,
    },
  };

  const requested = requestRoll(
    clearPendingRoll(stateAfterAction),
    afterAction.owner,
    "lokiMindControlEnemyChoice",
    { lokiId, options } satisfies LokiMindControlEnemyChoiceContext,
    afterAction.id
  );
  return { state: requested.state, events: [...spent.events, ...requested.events] };
}

function tryActivatePickedAbility(
  state: GameState,
  lokiId: string,
  pickedUnitId: string,
  abilityId: string,
  rng: RNG
): ApplyResult | null {
  const withPickedActive: GameState = {
    ...state,
    activeUnitId: pickedUnitId,
    pendingRoll: null,
  };

  const result = applyUseAbility(
    withPickedActive,
    {
      type: "useAbility",
      unitId: pickedUnitId,
      abilityId,
    },
    rng
  );

  const didActivate =
    result.events.some(
      (event) =>
        event.type === "abilityUsed" &&
        event.unitId === pickedUnitId &&
        event.abilityId === abilityId
    ) || !!result.state.pendingRoll;
  if (!didActivate) {
    return null;
  }

  const restoredState: GameState = {
    ...result.state,
    activeUnitId: lokiId,
  };
  return { state: restoredState, events: result.events };
}

function resolveSpinTheDrum(
  state: GameState,
  lokiId: string,
  rng: RNG
): ApplyResult {
  const candidates = getLokiSpinCandidateIds(state, lokiId);
  const spent = spendLaughter(state, lokiId, COST_SPIN_THE_DRUM);
  if (!spent.ok || !spent.loki) {
    return { state, events: [] };
  }

  const picked = pickRandomFromIds(candidates, () => rng.next());
  if (!picked) {
    return { state: clearPendingRoll(spent.state), events: spent.events };
  }

  const abilityViews = getAbilityViewsForUnit(
    { ...spent.state, activeUnitId: picked, pendingRoll: null },
    picked
  )
    .filter(
      (ability) =>
        ability.kind !== "passive" &&
        ability.id !== ABILITY_LOKI_LAUGHT &&
        ability.id !== ABILITY_LOKI_ILLUSORY_DOUBLE
    )
    .sort((a, b) => {
      const aScore = a.kind === "phantasm" ? 0 : 1;
      const bScore = b.kind === "phantasm" ? 0 : 1;
      if (aScore !== bScore) return aScore - bScore;
      return a.id.localeCompare(b.id);
    });

  for (const ability of abilityViews) {
    const activated = tryActivatePickedAbility(
      clearPendingRoll(spent.state),
      lokiId,
      picked,
      ability.id,
      rng
    );
    if (!activated) continue;
    return {
      state: activated.state,
      events: [...spent.events, ...activated.events],
    };
  }

  return { state: clearPendingRoll(spent.state), events: spent.events };
}

function resolveGreatLokiJoke(
  state: GameState,
  lokiId: string,
  rng: RNG
): ApplyResult {
  const spent = spendLaughter(state, lokiId, COST_GREAT_LOKI_JOKE);
  if (!spent.ok || !spent.loki) {
    return { state, events: [] };
  }

  const targetIds = getLokiTricksterAreaTargetIds(spent.state, lokiId);
  if (targetIds.length === 0) {
    return { state: clearPendingRoll(spent.state), events: spent.events };
  }

  const units = { ...spent.state.units };
  for (const targetId of targetIds) {
    const target = units[targetId];
    if (!target || !target.isAlive) continue;
    const resistRoll = rollD6(rng);
    if (resistRoll >= 5) continue;
    units[targetId] = addLokiChicken(target, lokiId);
  }

  return {
    state: clearPendingRoll({ ...spent.state, units }),
    events: spent.events,
  };
}

export function resolveLokiLaughtChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as LokiLaughtChoiceContext;
  const lokiId = ctx.lokiId;
  if (!lokiId || !getLokiUnit(state, lokiId)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const option = parseChoiceOption(choice);
  if (!option) {
    return { state, events: [] };
  }

  switch (option) {
    case "againSomeNonsense":
      return resolveAgainSomeNonsense(state, lokiId, rng);
    case "chicken":
      return resolveChickenMenuChoice(state, lokiId);
    case "mindControl":
      return resolveMindControlMenuChoice(state, lokiId);
    case "spinTheDrum":
      return resolveSpinTheDrum(state, lokiId, rng);
    case "greatLokiJoke":
      return resolveGreatLokiJoke(state, lokiId, rng);
    default:
      return { state, events: [] };
  }
}

export function resolveLokiChickenTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as LokiChickenTargetChoiceContext;
  if (!ctx.lokiId || !getLokiUnit(state, ctx.lokiId)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== "lokiChickenTarget" || !payload.targetId) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(payload.targetId)) {
    return { state, events: [] };
  }

  const target = state.units[payload.targetId];
  if (!target || !target.isAlive || target.owner === state.units[ctx.lokiId]?.owner) {
    return { state, events: [] };
  }

  const updatedTarget = addLokiChicken(target, ctx.lokiId);
  return {
    state: clearPendingRoll({
      ...state,
      units: {
        ...state.units,
        [updatedTarget.id]: updatedTarget,
      },
    }),
    events: [],
  };
}

export function resolveLokiMindControlEnemyChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as LokiMindControlEnemyChoiceContext;
  if (!ctx.lokiId || !getLokiUnit(state, ctx.lokiId)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== "lokiMindControlEnemy" || !payload.targetId) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(payload.targetId)) {
    return { state, events: [] };
  }

  const controlled = state.units[payload.targetId];
  if (!controlled || !controlled.isAlive || !controlled.position) {
    return { state, events: [] };
  }

  const targetOptions = getLokiForcedAttackTargetIds(state, controlled.id);
  if (targetOptions.length === 0) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const requested = requestRoll(
    clearPendingRoll(state),
    pending.player,
    "lokiMindControlTargetChoice",
    {
      lokiId: ctx.lokiId,
      controlledUnitId: controlled.id,
      options: targetOptions,
    } satisfies LokiMindControlTargetChoiceContext,
    controlled.id
  );
  return { state: requested.state, events: requested.events };
}

export function resolveLokiMindControlTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as LokiMindControlTargetChoiceContext;
  if (!ctx.lokiId || !getLokiUnit(state, ctx.lokiId)) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const controlled = state.units[ctx.controlledUnitId];
  if (
    !controlled ||
    !controlled.isAlive ||
    !controlled.position ||
    isLokiChicken(controlled)
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (!canSpendSlots(controlled, { attack: true, action: true })) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== "lokiMindControlTarget" || !payload.targetId) {
    return { state, events: [] };
  }

  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!options.includes(payload.targetId)) {
    return { state, events: [] };
  }

  const updatedControlled = spendSlots(controlled, { attack: true, action: true });
  const updatedState: GameState = {
    ...clearPendingRoll(state),
    units: {
      ...state.units,
      [updatedControlled.id]: updatedControlled,
    },
  };

  const requested = requestRoll(
    updatedState,
    updatedControlled.owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: updatedControlled.id,
      defenderId: payload.targetId,
      allowFriendlyTarget: true,
      consumeSlots: false,
      queueKind: "normal",
    }),
    updatedControlled.id
  );

  return { state: requested.state, events: requested.events };
}
