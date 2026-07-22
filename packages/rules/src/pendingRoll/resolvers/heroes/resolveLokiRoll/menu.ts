import type { ApplyResult, GameState, PendingRoll, ResolveRollChoice } from "../../../../model";
import type { RNG } from "../../../../rng";
import { canCommitAbilityCost } from "../../../../actions/abilityCosts";
import {
  ABILITY_LOKI_ILLUSORY_DOUBLE,
  ABILITY_LOKI_LAUGHT,
  getAbilityViewsForUnit,
} from "../../../../abilities";
import { clearPendingRoll, requestRoll } from "../../../../core";
import { applyUseAbility } from "../../../../actions/abilityActions";
import { applyTricksterAoEAfterUse } from "../../../../actions/abilityActions/tricksterAoE";
import type {
  LokiChickenTargetChoiceContext,
  LokiLaughtChoiceContext,
  LokiMindControlEnemyChoiceContext,
  LokiSpinAbilityChoiceContext,
} from "../../../types";
import {
  getLokiChickenTargetIds,
  getLokiMindControlEnemyIds,
  getLokiSpinCandidateIds,
  getLokiTricksterAreaTargetIds,
} from "../../../../actions/heroes/loki/targets";
import { pickRandomFromIds } from "../../../../actions/heroes/loki/utils";
import {
  COST_AGAIN_SOME_NONSENSE,
  COST_CHICKEN,
  COST_GREAT_LOKI_JOKE,
  COST_MIND_CONTROL,
  COST_SPIN_THE_DRUM,
  getLokiUnit,
  type LokiLaughtChoiceOption,
  parseChoiceOption,
  spendLaughter,
} from "./helpers";

function resolveAgainSomeNonsense(
  state: GameState,
  lokiId: string,
  rng: RNG
): ApplyResult {
  const targetIds = getLokiTricksterAreaTargetIds(state, lokiId);
  if (targetIds.length === 0) {
    return { state, events: [] };
  }
  const spent = spendLaughter(state, lokiId, COST_AGAIN_SOME_NONSENSE);
  if (!spent.ok || !spent.loki) {
    return { state, events: [] };
  }

  const queued = applyTricksterAoEAfterUse(
    clearPendingRoll(spent.state),
    spent.loki,
    spent.loki.position!,
    ABILITY_LOKI_LAUGHT,
    rng,
    {
      damageOverride: 0,
      ignoreBonuses: true,
      preserveAttackerStealth: true,
      lokiStatusOnHit: "entangled",
      lokiStatusSourceId: lokiId,
    }
  );
  return { state: queued.state, events: [...spent.events, ...queued.events] };
}

function resolveChickenMenuChoice(state: GameState, lokiId: string): ApplyResult {
  const loki = getLokiUnit(state, lokiId);
  if (
    !loki ||
    !canCommitAbilityCost(state, loki.id, ABILITY_LOKI_LAUGHT, {
      costs: { action: true },
      chargeAmount: COST_CHICKEN,
    })
  ) {
    return { state, events: [] };
  }

  const options = getLokiChickenTargetIds(state, lokiId);
  if (options.length === 0) {
    return { state, events: [] };
  }

  const requested = requestRoll(
    clearPendingRoll(state),
    loki.owner,
    "lokiChickenTargetChoice",
    { lokiId, options } satisfies LokiChickenTargetChoiceContext,
    loki.id
  );
  return requested;
}

function resolveMindControlMenuChoice(state: GameState, lokiId: string): ApplyResult {
  const loki = getLokiUnit(state, lokiId);
  if (
    !loki ||
    !canCommitAbilityCost(state, loki.id, ABILITY_LOKI_LAUGHT, {
      costs: { action: true },
      chargeAmount: COST_MIND_CONTROL,
    })
  ) {
    return { state, events: [] };
  }

  const options = getLokiMindControlEnemyIds(state, lokiId);
  if (options.length === 0) {
    return { state, events: [] };
  }

  const requested = requestRoll(
    clearPendingRoll(state),
    loki.owner,
    "lokiMindControlEnemyChoice",
    { lokiId, options } satisfies LokiMindControlEnemyChoiceContext,
    loki.id
  );
  return requested;
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
  if (candidates.length === 0) {
    return { state, events: [] };
  }
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
        ability.isAvailable &&
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

  for (const ability of abilityViews.filter((item) => item.kind === "phantasm")) {
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

  const fallbackOptions = abilityViews
    .filter((ability) => ability.kind === "active")
    .map((ability) => ability.id);
  if (fallbackOptions.length === 0) {
    return { state: clearPendingRoll(spent.state), events: spent.events };
  }
  const requested = requestRoll(
    clearPendingRoll(spent.state),
    spent.loki.owner,
    "lokiSpinAbilityChoice",
    {
      lokiId,
      selectedUnitId: picked,
      options: fallbackOptions,
    } satisfies LokiSpinAbilityChoiceContext,
    picked
  );
  return { state: requested.state, events: [...spent.events, ...requested.events] };
}

export function resolveLokiSpinAbilityChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as LokiSpinAbilityChoiceContext;
  const loki = getLokiUnit(state, ctx.lokiId);
  const picked = state.units[ctx.selectedUnitId];
  if (!loki || !picked || !picked.isAlive || picked.owner !== loki.owner) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (choice === "skip") {
    return { state: clearPendingRoll(state), events: [] };
  }
  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; abilityId?: string })
      : undefined;
  if (
    !payload ||
    payload.type !== "lokiSpinAbility" ||
    !payload.abilityId ||
    !ctx.options.includes(payload.abilityId)
  ) {
    return { state, events: [] };
  }
  const currentView = getAbilityViewsForUnit(
    { ...state, activeUnitId: picked.id, pendingRoll: null },
    picked.id
  ).find(
    (ability) =>
      ability.id === payload.abilityId &&
      ability.kind === "active" &&
      ability.isAvailable
  );
  if (!currentView) {
    return { state, events: [] };
  }
  return (
    tryActivatePickedAbility(
      clearPendingRoll(state),
      loki.id,
      picked.id,
      currentView.id,
      rng
    ) ?? { state, events: [] }
  );
}

function resolveGreatLokiJoke(
  state: GameState,
  lokiId: string,
  rng: RNG
): ApplyResult {
  const targetIds = getLokiTricksterAreaTargetIds(state, lokiId);
  if (targetIds.length === 0) {
    return { state, events: [] };
  }
  const spent = spendLaughter(state, lokiId, COST_GREAT_LOKI_JOKE);
  if (!spent.ok || !spent.loki) {
    return { state, events: [] };
  }

  const queued = applyTricksterAoEAfterUse(
    clearPendingRoll(spent.state),
    spent.loki,
    spent.loki.position!,
    ABILITY_LOKI_LAUGHT,
    rng,
    {
      damageOverride: 0,
      ignoreBonuses: true,
      lokiStatusOnHit: "chicken",
      lokiStatusSourceId: lokiId,
    }
  );
  return { state: queued.state, events: [...spent.events, ...queued.events] };
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

  return resolveLokiLaughtOption(state, lokiId, option, rng);
}

export function resolveLokiLaughtOption(
  state: GameState,
  lokiId: string,
  option: LokiLaughtChoiceOption,
  rng: RNG
): ApplyResult {
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
