import {
  ABILITY_RIVER_PERSON_BOAT,
  getAbilitySpec,
} from "../abilities";
import type {
  ApplyResult,
  GameAction,
  GameState,
  UnitState,
} from "../model";
import { applyPapyrusBonePunish } from "./heroes/papyrus/state";
import { isPapyrusBoneStatusActive } from "./heroes/papyrus/helpers";
import { applySansBoneFieldPunish } from "./heroes/sans/effects";

function hasActiveOrangeBone(state: GameState, unit: UnitState): boolean {
  const sansStatus = unit.sansBoneFieldStatus;
  if (
    sansStatus?.kind === "orange" &&
    sansStatus.turnNumber === state.turnNumber
  ) {
    return true;
  }

  return (
    unit.papyrusBoneStatus?.kind === "orange" &&
    isPapyrusBoneStatusActive(state, unit.papyrusBoneStatus)
  );
}

function getDeclaredActor(
  state: GameState,
  action: GameAction
): UnitState | undefined {
  if (action.type === "attack") return state.units[action.attackerId];
  if (
    action.type === "move" ||
    action.type === "requestMoveOptions" ||
    action.type === "enterStealth" ||
    action.type === "searchStealth" ||
    action.type === "useAbility" ||
    action.type === "unitStartTurn"
  ) {
    return state.units[action.unitId];
  }
  if (action.type === "endTurn" && state.activeUnitId) {
    return state.units[state.activeUnitId];
  }
  return undefined;
}

function isMovementAbility(action: Extract<GameAction, { type: "useAbility" }>) {
  if (action.abilityId === ABILITY_RIVER_PERSON_BOAT) return true;
  return getAbilitySpec(action.abilityId)?.actionCost?.consumes?.move === true;
}

/**
 * Commands listed here have passed their ordinary handler validation before
 * the penalty is committed. Movement previews and pending-roll continuations
 * are deliberately excluded.
 */
export function canStartOrangeBoneNonMove(
  state: GameState,
  action: GameAction
): boolean {
  const actor = getDeclaredActor(state, action);
  if (
    !actor ||
    !actor.isAlive ||
    actor.id !== state.activeUnitId ||
    actor.orangeBoneFirstMoveSatisfied ||
    actor.orangeBonePenaltyAppliedThisTurn ||
    !hasActiveOrangeBone(state, actor)
  ) {
    return false;
  }

  switch (action.type) {
    case "attack":
    case "enterStealth":
    case "endTurn":
      return true;
    case "searchStealth":
      return action.mode === "action";
    case "useAbility":
      return !isMovementAbility(action);
    default:
      return false;
  }
}

export function applyOrangeBoneNonMovePenalty(
  state: GameState,
  action: GameAction
): ApplyResult {
  const actor = getDeclaredActor(state, action);
  if (!actor || !hasActiveOrangeBone(state, actor)) {
    return { state, events: [] };
  }

  const sansStatus = actor.sansBoneFieldStatus;
  if (
    sansStatus?.kind === "orange" &&
    sansStatus.turnNumber === state.turnNumber
  ) {
    return applySansBoneFieldPunish(
      state,
      actor.id,
      "orange",
      "nonMoveFirst",
      state.turnNumber
    );
  }

  return applyPapyrusBonePunish(
    state,
    actor.id,
    "orange",
    "nonMoveFirst"
  );
}

export function markOrangeBoneMoveFirstSatisfied(
  previousState: GameState,
  result: ApplyResult
): ApplyResult {
  const actorId = previousState.activeUnitId;
  if (!actorId) return result;

  const before = previousState.units[actorId];
  const after = result.state.units[actorId];
  if (
    !before ||
    !after ||
    before.turn.moveUsed ||
    !after.turn.moveUsed ||
    after.orangeBonePenaltyAppliedThisTurn ||
    after.hasSpentMeaningfulTurnAction ||
    !hasActiveOrangeBone(result.state, after)
  ) {
    return result;
  }

  const updated: UnitState = {
    ...after,
    orangeBoneFirstMoveSatisfied: true,
    hasSpentMeaningfulTurnAction: true,
  };
  return {
    ...result,
    state: {
      ...result.state,
      units: {
        ...result.state.units,
        [updated.id]: updated,
      },
    },
  };
}
