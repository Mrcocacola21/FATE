import type { ApplyResult, GameState, PendingRoll, RollKind } from "../../../../model";
import type { RNG } from "../../../../rng";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_CHIKATILO_DECOY,
  getCharges,
} from "../../../../abilities";
import { clearPendingRoll } from "../../../../core";
import { isElCid } from "../../../../actions/shared";
import { hasMettatonBerserkerFeature } from "../../../../mettaton";
import {
  HERO_ASGORE_ID,
  HERO_CHIKATILO_ID,
  HERO_FEMTO_ID,
  HERO_FRISK_ID,
  HERO_GUTS_ID,
  HERO_PAPYRUS_ID,
} from "../../../../heroes";
import type { AttackRollContext } from "../../../types";
import { replacePendingRoll } from "../../../builders/buildPendingRoll";
import { isDoubleRoll, rollDice } from "../../../utils/rollMath";
import {
  canUseFriskSubstitution,
  finalizeAttackFromContext,
} from "./shared";
import { continueAfterAttackResolution } from "./postResolution";

export function resolveAttackAttackerRoll(
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
  let nextCtx: AttackRollContext = { ...ctx, stage };
  let workingState = state;
  let workingDefender = defender;
  let workingAttacker = attacker;

  if (stage === "tieBreak") {
    nextCtx.tieBreakAttacker = [...(ctx.tieBreakAttacker ?? []), ...dice];
  } else {
    nextCtx.attackerDice = dice;
  }

  if (
    workingDefender.heroId === HERO_FRISK_ID &&
    workingDefender.friskCleanSoulShield
  ) {
    workingDefender = {
      ...workingDefender,
      friskCleanSoulShield: false,
    };
    workingState = {
      ...workingState,
      units: {
        ...workingState.units,
        [workingDefender.id]: workingDefender,
      },
    };
    nextCtx = {
      ...nextCtx,
      friskForceMiss: true,
      friskSubstitutionChoiceMade: true,
      friskChildsCryChoiceMade: true,
      defenderDice: [],
      tieBreakDefender: [],
      stage: "initial",
    };
  }

  const canDecoy =
    workingDefender.heroId === HERO_CHIKATILO_ID &&
    getCharges(workingDefender, ABILITY_CHIKATILO_DECOY) >= 3 &&
    !nextCtx.chikatiloDecoyChoiceMade;
  if (canDecoy) {
    return replacePendingRoll(
      workingState,
      workingDefender.owner,
      "chikatiloDecoyChoice",
      nextCtx,
      workingDefender.id
    );
  }

  const resolvedCtx: AttackRollContext = {
    ...nextCtx,
    chikatiloDecoyChoiceMade: true,
  };

  if (
    !resolvedCtx.friskForceMiss &&
    canUseFriskSubstitution(workingDefender) &&
    !resolvedCtx.friskSubstitutionChoiceMade
  ) {
    return replacePendingRoll(
      workingState,
      workingDefender.owner,
      "friskSubstitutionChoice",
      resolvedCtx,
      workingDefender.id
    );
  }

  if (resolvedCtx.friskForceMiss) {
    const resolved = finalizeAttackFromContext(
      workingState,
      resolvedCtx,
      "none",
      false,
      undefined,
      false,
      true
    );
    return continueAfterAttackResolution(
      resolved.state,
      resolved.events,
      resolvedCtx,
      rng
    );
  }

  if (
    workingAttacker.heroId === HERO_FRISK_ID &&
    workingAttacker.friskPrecisionStrikeReady
  ) {
    workingAttacker = {
      ...workingAttacker,
      friskPrecisionStrikeReady: false,
    };
    workingState = {
      ...workingState,
      units: {
        ...workingState.units,
        [workingAttacker.id]: workingAttacker,
      },
    };

    const resolved = finalizeAttackFromContext(
      workingState,
      resolvedCtx,
      "none",
      true,
      Math.max(0, workingAttacker.attack * 2),
      true
    );
    return continueAfterAttackResolution(
      resolved.state,
      resolved.events,
      resolvedCtx,
      rng
    );
  }

  const isAutoHit =
    stage === "initial" && isElCid(workingAttacker) && isDoubleRoll(dice);
  if (isAutoHit) {
    const resolved = finalizeAttackFromContext(
      workingState,
      resolvedCtx,
      "none",
      true
    );
    return continueAfterAttackResolution(
      resolved.state,
      resolved.events,
      resolvedCtx,
      rng
    );
  }

  const charges = workingDefender.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;
  if (
    (workingDefender.class === "berserker" ||
      workingDefender.heroId === HERO_FEMTO_ID ||
      (workingDefender.heroId === HERO_PAPYRUS_ID &&
        workingDefender.papyrusUnbelieverActive) ||
      hasMettatonBerserkerFeature(workingDefender)) &&
    charges === 6 &&
    !resolvedCtx.berserkerChoiceMade
  ) {
    return replacePendingRoll(
      workingState,
      workingDefender.owner,
      "berserkerDefenseChoice",
      resolvedCtx,
      workingDefender.id
    );
  }

  if (
    workingDefender.heroId === HERO_ASGORE_ID &&
    workingDefender.asgoreBraveryAutoDefenseReady &&
    !resolvedCtx.asgoreBraveryChoiceMade
  ) {
    return replacePendingRoll(
      workingState,
      workingDefender.owner,
      "asgoreBraveryDefenseChoice",
      resolvedCtx,
      workingDefender.id
    );
  }

  const defenderRollKind: RollKind =
    pending.kind === "riderPathAttack_attackerRoll"
      ? "riderPathAttack_defenderRoll"
      : "attack_defenderRoll";

  return replacePendingRoll(
    workingState,
    workingDefender.owner,
    defenderRollKind,
    resolvedCtx,
    workingDefender.id
  );
}
