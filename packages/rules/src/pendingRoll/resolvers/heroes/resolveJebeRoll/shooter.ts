import type { ApplyResult, GameState, PendingRoll, ResolveRollChoice } from "../../../../model";
import type { RNG } from "../../../../rng";
import { rollD6 } from "../../../../rng";
import { clearPendingRoll } from "../../../../core";
import { ABILITY_JEBE_KHANS_SHOOTER } from "../../../../abilities";
import { canAttackTarget } from "../../../../combat";
import { commitAbilityCost } from "../../../../actions/abilityCosts";
import type {
  JebeKhansShooterRicochetContext,
  JebeKhansShooterTargetChoiceContext,
} from "../../../types";
import { requestJebeKhansShooterAttack } from "../../core/resolveAttackRoll";

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

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
  const caster = state.units[casterId];
  const target = state.units[initialTargetId];
  if (
    !caster ||
    !caster.isAlive ||
    !caster.position ||
    !target ||
    !target.isAlive ||
    !target.position ||
    target.owner === caster.owner ||
    !canAttackTarget(state, caster, target)
  ) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const committed = commitAbilityCost(
    state,
    casterId,
    ABILITY_JEBE_KHANS_SHOOTER
  );
  if (!committed.ok) return { state, events: [] };

  const ricochets = rollD6(rng);
  const totalAttacks = 1 + ricochets;
  return requestJebeKhansShooterAttack(
    clearPendingRoll(committed.state),
    committed.events,
    casterId,
    initialTargetId,
    totalAttacks,
    {
      totalAttacks,
      selectedTargetIds: [initialTargetId],
      ricochetRoll: ricochets,
    }
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
    remainingAttacks,
    {
      totalAttacks:
        typeof ctx.totalAttacks === "number" ? ctx.totalAttacks : undefined,
      selectedTargetIds: [...stringList(ctx.selectedTargetIds), selected],
      ricochetRoll:
        typeof ctx.ricochetRoll === "number" ? ctx.ricochetRoll : undefined,
    }
  );
}
