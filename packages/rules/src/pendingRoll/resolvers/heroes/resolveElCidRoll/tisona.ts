import type { ApplyResult, GameState, PendingRoll } from "../../../../model";
import type { RNG } from "../../../../rng";
import { clearPendingRoll } from "../../../../core";
import { isElCid } from "../../../../actions/shared";
import type { ElCidAoEContext } from "../../../types";
import { isDoubleRoll, rollDice } from "../../../utils/rollMath";
import { resolveElCidAoEAutoHit } from "./autoHit";
import { advanceElCidAoEQueue } from "./queue";
import { resolveElCidDefenderRoll } from "./defender";

export function resolveElCidTisonaAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as ElCidAoEContext;
  const caster = state.units[ctx.casterId];
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const nextCtx: ElCidAoEContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  if (isElCid(caster) && isDoubleRoll(attackerDice)) {
    return resolveElCidAoEAutoHit(state, nextCtx, []);
  }

  return advanceElCidAoEQueue(state, nextCtx, [], "elCidTisona_defenderRoll");
}

export function resolveElCidTisonaDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  return resolveElCidDefenderRoll(
    state,
    pending,
    rng,
    "elCidTisona_defenderRoll",
    "elCidTisonaAoE"
  );
}
