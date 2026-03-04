import type {
  ApplyResult,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  RollKind,
} from "../../../../model";
import type { RNG } from "../../../../rng";
import {
  ABILITY_CHIKATILO_DECOY,
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  spendCharges,
} from "../../../../abilities";
import { clearPendingRoll } from "../../../../core";
import type { AttackRollContext } from "../../../types";
import { replacePendingRoll } from "../../../builders/buildPendingRoll";
import { continueAfterAttackResolution } from "./postResolution";
import { finalizeAttackFromContext } from "./shared";

export function resolveFriskSubstitutionChoiceRoll(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  let nextState = state;
  let selected = choice === "activate" ? "activate" : "roll";
  if (selected === "activate") {
    const spent = spendCharges(defender, ABILITY_FRISK_GENOCIDE, 3);
    if (!spent.ok) {
      selected = "roll";
    } else {
      nextState = {
        ...state,
        units: {
          ...state.units,
          [defender.id]: spent.unit,
        },
      };
    }
  }

  const nextCtx: AttackRollContext = {
    ...ctx,
    friskSubstitutionChoiceMade: true,
    friskChildsCryChoiceMade: true,
  };

  if (selected !== "activate") {
    const defenderRollKind: RollKind =
      ctx.queueKind === "riderPath"
        ? "riderPathAttack_defenderRoll"
        : "attack_defenderRoll";
    return replacePendingRoll(
      nextState,
      defender.owner,
      defenderRollKind,
      nextCtx,
      defender.id
    );
  }

  const resolved = finalizeAttackFromContext(
    nextState,
    nextCtx,
    "none",
    true,
    1,
    true
  );
  return continueAfterAttackResolution(
    resolved.state,
    resolved.events,
    nextCtx,
    rng
  );
}

export function resolveFriskChildsCryChoiceRoll(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  let nextState = state;
  let selected = choice === "activate" ? "activate" : "roll";
  if (selected === "activate") {
    const spent = spendCharges(defender, ABILITY_FRISK_PACIFISM, 5);
    if (!spent.ok) {
      selected = "roll";
    } else {
      nextState = {
        ...state,
        units: {
          ...state.units,
          [defender.id]: spent.unit,
        },
      };
    }
  }

  const nextCtx: AttackRollContext = {
    ...ctx,
    friskChildsCryChoiceMade: true,
  };

  const resolved = finalizeAttackFromContext(
    nextState,
    nextCtx,
    "none",
    false,
    selected === "activate" ? 0 : undefined,
    selected === "activate"
  );
  return continueAfterAttackResolution(
    resolved.state,
    resolved.events,
    nextCtx,
    rng
  );
}

export function resolveChikatiloDecoyChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  let selection = choice === "decoy" ? "decoy" : "roll";
  let nextState: GameState = state;

  if (selection === "decoy") {
    const spent = spendCharges(defender, ABILITY_CHIKATILO_DECOY, 3);
    if (!spent.ok) {
      selection = "roll";
    } else {
      const updatedDefender = spent.unit;
      nextState = {
        ...state,
        units: {
          ...state.units,
          [updatedDefender.id]: updatedDefender,
        },
      };
    }
  }

  const nextCtx: AttackRollContext = {
    ...ctx,
    chikatiloDecoyChoiceMade: true,
  };

  if (selection !== "decoy") {
    const defenderRollKind: RollKind =
      ctx.queueKind === "riderPath"
        ? "riderPathAttack_defenderRoll"
        : "attack_defenderRoll";

    const requested = replacePendingRoll(
      nextState,
      defender.owner,
      defenderRollKind,
      nextCtx,
      defender.id
    );
    return { state: requested.state, events: requested.events };
  }

  const resolved = finalizeAttackFromContext(
    nextState,
    nextCtx,
    "none",
    true,
    1,
    true
  );
  return continueAfterAttackResolution(
    resolved.state,
    resolved.events,
    nextCtx,
    rng
  );
}
