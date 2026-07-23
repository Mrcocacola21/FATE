import type { GameEvent, GameState, ResolveRollChoice } from "../../../../model";
import { isLoki } from "../../../../actions/heroes/loki/effects";
import { commitAbilityCost } from "../../../../actions/abilityCosts";
import { ABILITY_LOKI_LAUGHT } from "../../../../abilities";
import {
  LOKI_LAUGHT_OPTION_COSTS,
  type LokiLaughtOption,
} from "../../../../actions/heroes/loki/constants";

export const COST_AGAIN_SOME_NONSENSE = LOKI_LAUGHT_OPTION_COSTS.againSomeNonsense;
export const COST_CHICKEN = LOKI_LAUGHT_OPTION_COSTS.chicken;
export const COST_MIND_CONTROL = LOKI_LAUGHT_OPTION_COSTS.mindControl;
export const COST_SPIN_THE_DRUM = LOKI_LAUGHT_OPTION_COSTS.spinTheDrum;
export const COST_GREAT_LOKI_JOKE = LOKI_LAUGHT_OPTION_COSTS.greatLokiJoke;

export type LokiLaughtChoiceOption = LokiLaughtOption;

export function parseChoiceOption(
  choice: ResolveRollChoice | undefined,
): LokiLaughtChoiceOption | null {
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

export function getLokiUnit(state: GameState, lokiId: string) {
  const unit = state.units[lokiId];
  if (!unit || !unit.isAlive || !unit.position || !isLoki(unit)) {
    return null;
  }
  return unit;
}

export function spendLaughter(
  state: GameState,
  lokiId: string,
  cost: number,
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
  const committed = commitAbilityCost(state, loki.id, ABILITY_LOKI_LAUGHT, {
    costs: { action: true },
    chargeAmount: cost,
  });
  if (!committed.ok) {
    return { ok: false, state, loki, events: [] };
  }
  return {
    ok: true,
    state: committed.state,
    loki: committed.unit,
    events: committed.events,
  };
}
