import type {
  ApplyResult,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../model";
import type { RNG } from "../../rng";
import { coordsEqual } from "../../board";
import { getLegalAttackTargets } from "../../legal";
import { linePath } from "../../path";
import { maybeRequestForestMoveCheck } from "./forest";
import type { MongolChargeAllyAttackTargetContext } from "../../pendingRoll/types";
import type { MoveActionInternal } from "./types";
import { resolveReactionChoice } from "./reactions";

export function applyMongolChargeMove(
  state: GameState,
  unit: UnitState,
  action: MoveActionInternal,
  _rng: RNG,
): ApplyResult {
  const from = unit.position;
  if (!from) {
    return { state, events: [] };
  }

  const pending = state.pendingMove;
  const pendingValid =
    pending && pending.unitId === unit.id && pending.expiresTurnNumber === state.turnNumber;
  if (!pendingValid) {
    return { state, events: [] };
  }

  const isLegal = pending.legalTo.some((c) => coordsEqual(c, action.to));
  if (!isLegal) {
    return { state, events: [] };
  }

  const intendedLine = linePath(from, action.to);
  if (!intendedLine) {
    return { state, events: [] };
  }

  const bypassForestCheck = action.__forestBypass === true;
  if (!bypassForestCheck) {
    const forestCheck = maybeRequestForestMoveCheck(
      state,
      unit,
      from,
      action.to,
      intendedLine,
      pending.legalTo,
    );
    if (forestCheck) {
      return forestCheck;
    }
  }

  return {
    state: {
      ...state,
      units: { ...state.units, [unit.id]: { ...unit, genghisKhanMongolChargeActive: false } },
      pendingMove: null,
      pendingReactionMovement: {
        source: "genghis",
        controllerUnitId: unit.id,
        path: intendedLine,
        stepIndex: 0,
        stepReached: false,
        stopped: false,
        processedReactorIds: [],
        touchedReactorIds: [],
        reactionQueue: [],
      },
    },
    events: [],
  };
}

export function resolveMongolChargeAllyAttackTarget(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
): ApplyResult {
  if (!choice || typeof choice !== "object" || choice.type !== "mongolChargeAllyAttackTarget") {
    return { state, events: [] };
  }

  const context = pending.context as MongolChargeAllyAttackTargetContext;
  const targets = getLegalAttackTargets(state, context.sourceUnitId);
  if (!context.legalTargetIds.includes(choice.targetId) || !targets.includes(choice.targetId))
    return { state, events: [] };
  const controller = state.units[context.controllerUnitId];
  if (!controller?.position) return { state, events: [] };
  // Migrate an already-pending legacy target choice without discarding allies.
  const remaining = [
    ...(context.queuedAttacks ?? []).map((entry) => entry.attackerId),
    ...(context.remainingAllyIds ?? []),
  ].filter((id, index, ids) => id !== context.sourceUnitId && ids.indexOf(id) === index);
  const migrated: GameState = {
    ...state,
    pendingReactionMovement: {
      source: "genghis",
      controllerUnitId: controller.id,
      path: [controller.position],
      stepIndex: 0,
      stepReached: true,
      stopped: false,
      processedReactorIds: [context.sourceUnitId, ...remaining],
      touchedReactorIds: [context.sourceUnitId],
      reactionQueue: [
        { reactorUnitId: context.sourceUnitId, targetUnitIds: targets },
        ...remaining.map((reactorUnitId) => ({
          reactorUnitId,
          targetUnitIds: getLegalAttackTargets(state, reactorUnitId),
        })),
      ],
    },
  };
  return resolveReactionChoice(
    migrated,
    { ...pending, context: { ...pending.context, reactorUnitId: context.sourceUnitId } },
    { type: "resolveReactionChoice", choice: "attack", targetId: choice.targetId },
  );
}
