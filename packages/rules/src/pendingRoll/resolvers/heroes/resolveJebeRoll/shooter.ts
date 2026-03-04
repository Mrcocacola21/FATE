import type { ApplyResult, GameState, PendingRoll, ResolveRollChoice } from "../../../../model";
import type { RNG } from "../../../../rng";
import { rollD6 } from "../../../../rng";
import { clearPendingRoll } from "../../../../core";
import type {
  JebeKhansShooterRicochetContext,
  JebeKhansShooterTargetChoiceContext,
} from "../../../types";
import { requestJebeKhansShooterAttack } from "../../core/resolveAttackRoll";

export function resolveJebeKhansShooterRicochetRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as JebeKhansShooterRicochetContext;
  const casterId = ctx.casterId;
  const initialTargetId = ctx.initialTargetId;
  if (!casterId || !initialTargetId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const ricochets = rollD6(rng);
  const totalAttacks = 1 + ricochets;
  return requestJebeKhansShooterAttack(
    clearPendingRoll(state),
    [],
    casterId,
    initialTargetId,
    totalAttacks
  );
}

export function resolveJebeKhansShooterTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as unknown as JebeKhansShooterTargetChoiceContext;
  const casterId = ctx.casterId;
  const remainingAttacks = ctx.remainingAttacks;
  const options = Array.isArray(ctx.options) ? ctx.options : [];
  if (!casterId || typeof remainingAttacks !== "number" || remainingAttacks <= 0) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const selected =
    choice &&
    typeof choice === "object" &&
    "type" in choice &&
    (choice as { type?: string }).type === "jebeKhansShooterTarget"
      ? (choice as { targetId?: string }).targetId
      : undefined;
  if (!selected) {
    return { state, events: [] };
  }

  if (!options.includes(selected)) {
    return { state, events: [] };
  }

  return requestJebeKhansShooterAttack(
    clearPendingRoll(state),
    [],
    casterId,
    selected,
    remainingAttacks
  );
}
