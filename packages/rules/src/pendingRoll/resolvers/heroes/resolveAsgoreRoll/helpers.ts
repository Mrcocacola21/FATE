import type { ApplyResult, GameState, ResolveRollChoice, UnitState } from "../../../../model";
import { HERO_ASGORE_ID } from "../../../../heroes";
import { clearPendingRoll, makeAttackContext, requestRoll } from "../../../../core";

export function getAsgore(state: GameState, unitId: string): UnitState | null {
  const unit = state.units[unitId];
  if (
    !unit ||
    !unit.isAlive ||
    !unit.position ||
    unit.heroId !== HERO_ASGORE_ID
  ) {
    return null;
  }
  return unit;
}

export function requestAsgoreAttack(
  state: GameState,
  asgore: UnitState,
  targetId: string
): ApplyResult {
  const requested = requestRoll(
    clearPendingRoll(state),
    asgore.owner,
    "attack_attackerRoll",
    makeAttackContext({
      attackerId: asgore.id,
      defenderId: targetId,
      ignoreRange: true,
      consumeSlots: false,
      queueKind: "normal",
    }),
    asgore.id
  );
  return requested;
}

export function parseTargetChoice(
  choice: ResolveRollChoice | undefined,
  expectedType: string
): string | null {
  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; targetId?: string })
      : undefined;
  if (!payload || payload.type !== expectedType || !payload.targetId) {
    return null;
  }
  return payload.targetId;
}
