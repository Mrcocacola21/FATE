import type { ApplyResult, GameState, PendingRoll, RollKind } from "../../../../model";
import type { RNG } from "../../../../rng";
import { ABILITY_ODIN_MUNINN } from "../../../../abilities";
import { clearPendingRoll } from "../../../../core";
import { HERO_ODIN_ID } from "../../../../heroes";
import type { AttackRollContext } from "../../../types";
import { replacePendingRoll } from "../../../builders/buildPendingRoll";
import { rollDice, sumDice } from "../../../utils/rollMath";
import {
  canUseFriskChildsCry,
  finalizeAttackFromContext,
  wouldAttackHitFromContext,
} from "./shared";
import { continueAfterAttackResolution } from "./postResolution";

export function resolveAttackDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as AttackRollContext;
  const attacker = state.units[ctx.attackerId];
  const defender = state.units[ctx.defenderId];
  if (!attacker || !defender) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const stage = ctx.stage ?? "initial";
  const dice = rollDice(rng, stage === "tieBreak" ? 1 : 2);
  const nextCtx: AttackRollContext = {
    ...ctx,
    stage,
    berserkerChoiceMade: true,
    asgoreBraveryChoiceMade: true,
    chikatiloDecoyChoiceMade: true,
    friskSubstitutionChoiceMade: true,
  };

  if (stage === "tieBreak") {
    nextCtx.tieBreakDefender = [...(ctx.tieBreakDefender ?? []), ...dice];
  } else {
    nextCtx.defenderDice = dice;
  }

  const attackerTotal =
    sumDice(nextCtx.attackerDice ?? []) +
    sumDice(nextCtx.tieBreakAttacker ?? []);
  const defenderTotal =
    sumDice(nextCtx.defenderDice ?? []) +
    sumDice(nextCtx.tieBreakDefender ?? []);

  if (attackerTotal === defenderTotal) {
    nextCtx.stage = "tieBreak";
    const attackerRollKind: RollKind =
      pending.kind === "riderPathAttack_defenderRoll"
        ? "riderPathAttack_attackerRoll"
        : "attack_attackerRoll";

    return replacePendingRoll(
      state,
      attacker.owner,
      attackerRollKind,
      nextCtx,
      attacker.id
    );
  }

  if (
    wouldAttackHitFromContext(nextCtx, attacker, defender) &&
    canUseFriskChildsCry(defender) &&
    !nextCtx.friskChildsCryChoiceMade
  ) {
    return replacePendingRoll(
      state,
      defender.owner,
      "friskChildsCryChoice",
      nextCtx,
      defender.id
    );
  }

  const muninnCharges = defender.charges?.[ABILITY_ODIN_MUNINN] ?? 0;
  if (
    defender.heroId === HERO_ODIN_ID &&
    muninnCharges === 6 &&
    !nextCtx.odinMuninnChoiceMade
  ) {
    return replacePendingRoll(
      state,
      defender.owner,
      "odinMuninnDefenseChoice",
      nextCtx,
      defender.id
    );
  }

  const finalizedCtx: AttackRollContext = {
    ...nextCtx,
    odinMuninnChoiceMade: true,
  };
  const resolved = finalizeAttackFromContext(state, finalizedCtx, "none");
  return continueAfterAttackResolution(
    resolved.state,
    resolved.events,
    finalizedCtx,
    rng
  );
}
