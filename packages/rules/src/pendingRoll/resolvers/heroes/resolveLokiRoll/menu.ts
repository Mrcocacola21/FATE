import type { ApplyResult, GameState, PendingRoll, ResolveRollChoice } from "../../../../model";
import type { RNG } from "../../../../rng";
import { rollD6 } from "../../../../rng";
import { canSpendSlots, spendSlots } from "../../../../turnEconomy";
import {
  ABILITY_LOKI_ILLUSORY_DOUBLE,
  ABILITY_LOKI_LAUGHT,
  getAbilityViewsForUnit,
} from "../../../../abilities";
import { clearPendingRoll, requestRoll } from "../../../../core";
import { applyUseAbility } from "../../../../actions/abilityActions";
import type {
  LokiChickenTargetChoiceContext,
  LokiLaughtChoiceContext,
  LokiMindControlEnemyChoiceContext,
} from "../../../types";
import {
  addLokiChicken,
  addLokiMoveLock,
  getLokiChickenTargetIds,
  getLokiMindControlEnemyIds,
  getLokiSpinCandidateIds,
  getLokiTricksterAreaTargetIds,
  pickRandomFromIds,
} from "../../../../actions/heroes/loki";
import {
  COST_AGAIN_SOME_NONSENSE,
  COST_CHICKEN,
  COST_GREAT_LOKI_JOKE,
  COST_MIND_CONTROL,
  COST_SPIN_THE_DRUM,
  getLokiUnit,
  parseChoiceOption,
  spendLaughter,
} from "./helpers";

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
