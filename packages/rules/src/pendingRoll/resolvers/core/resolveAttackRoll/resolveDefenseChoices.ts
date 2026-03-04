import type {
  ApplyResult,
  GameEvent,
  GameState,
  PendingRoll,
  RollKind,
  UnitState,
} from "../../../../model";
import type { RNG } from "../../../../rng";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_ODIN_MUNINN,
} from "../../../../abilities";
import { clearPendingRoll } from "../../../../core";
import { HERO_ASGORE_ID } from "../../../../heroes";
import { evBerserkerDefenseChosen } from "../../../../core";
import type { AttackRollContext } from "../../../types";
import { replacePendingRoll } from "../../../builders/buildPendingRoll";
import { continueAfterAttackResolution } from "./postResolution";
import { finalizeAttackFromContext } from "./shared";

export function resolveBerserkerDefenseChoiceRoll(
  state: GameState,
  pending: PendingRoll,
  choice: "auto" | "roll" | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  let selected = choice;
  if (selected === "auto") {
    const charges = defender.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
    if (charges !== 6) {
      selected = "roll";
    }
  }

  if (selected === "auto") {
    const resolved = finalizeAttackFromContext(state, ctx, "berserk");
    const choiceEvents: GameEvent[] = [
      evBerserkerDefenseChosen({ defenderId: defender.id, choice: "auto" }),
      ...resolved.events,
    ];
    return continueAfterAttackResolution(
      resolved.state,
      choiceEvents,
      ctx,
      rng
    );
  }

  if (selected === "roll") {
    const nextCtx: AttackRollContext = { ...ctx, berserkerChoiceMade: true };
    const defenderRollKind: RollKind =
      ctx.queueKind === "riderPath"
        ? "riderPathAttack_defenderRoll"
        : "attack_defenderRoll";

    const requested = replacePendingRoll(
      state,
      defender.owner,
      defenderRollKind,
      nextCtx,
      defender.id
    );
    const choiceEvents: GameEvent[] = [
      evBerserkerDefenseChosen({ defenderId: defender.id, choice: "roll" }),
      ...requested.events,
    ];
    return { state: requested.state, events: choiceEvents };
  }

  return { state: clearPendingRoll(state), events: [] };
}

export function resolveOdinMuninnDefenseChoiceRoll(
  state: GameState,
  pending: PendingRoll,
  choice: "auto" | "roll" | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  let selected = choice === "auto" ? "auto" : "roll";
  if (selected === "auto") {
    const charges = defender.charges?.[ABILITY_ODIN_MUNINN] ?? 0;
    if (charges !== 6) {
      selected = "roll";
    }
  }

  const finalizedCtx: AttackRollContext = {
    ...ctx,
    odinMuninnChoiceMade: true,
  };

  const resolved = finalizeAttackFromContext(
    state,
    finalizedCtx,
    selected === "auto" ? "muninn" : "none"
  );
  return continueAfterAttackResolution(
    resolved.state,
    resolved.events,
    finalizedCtx,
    rng
  );
}

export function resolveAsgoreBraveryDefenseChoiceRoll(
  state: GameState,
  pending: PendingRoll,
  choice: "auto" | "roll" | undefined,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  let selected = choice === "auto" ? "auto" : "roll";
  if (
    selected === "auto" &&
    (defender.heroId !== HERO_ASGORE_ID || !defender.asgoreBraveryAutoDefenseReady)
  ) {
    selected = "roll";
  }

  let nextState = state;
  if (selected === "auto") {
    const updatedDefender: UnitState = {
      ...defender,
      asgoreBraveryAutoDefenseReady: false,
    };
    nextState = {
      ...state,
      units: {
        ...state.units,
        [updatedDefender.id]: updatedDefender,
      },
    };
  }

  const nextCtx: AttackRollContext = {
    ...ctx,
    asgoreBraveryChoiceMade: true,
  };

  if (selected === "roll") {
    const defenderRollKind: RollKind =
      nextCtx.queueKind === "riderPath"
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
    false,
    undefined,
    false,
    true
  );
  return continueAfterAttackResolution(
    resolved.state,
    resolved.events,
    nextCtx,
    rng
  );
}
