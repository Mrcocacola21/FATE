import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  MoveMode,
  UnitState,
} from "../../model";
import type { RNG } from "../../rng";
import { coordsEqual } from "../../board";
import { linePath } from "../../path";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { findStakeStopOnPath, applyStakeTriggerIfAny, evUnitMoved } from "../../core";
import { getMovementModes, unitHasMovementMode } from "../shared";
import { hasMettatonRiderMovement, hasMettatonRiderPathFeature } from "../../mettaton";
import { getLegalMovesForUnitModes } from "../../movement";
import { isRiverPerson } from "../heroes/riverPerson";
import { maybeRequestForestMoveCheck } from "./forest";
import { applyMongolChargeMove } from "./mongolCharge";
import {
  maybeHandleLechyGuideTraveler,
  maybeHandleRiverCarryDrop,
  maybeRequestRiderPathAttacks,
} from "./postMove";
import type { MoveActionInternal } from "./types";
import { markCourtGlobalMoveUsed } from "../../ruleDeclarations";

export function applyMove(
  state: GameState,
  action: Extract<GameAction, { type: "move" }>,
  rng: RNG
): ApplyResult {
  const moveAction = action as MoveActionInternal;
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[moveAction.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state, events: [] };
  }

  if ((unit.kaladinMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }
  if ((unit.lokiMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }

  const from = unit.position;
  const isMongolCharge = unit.genghisKhanMongolChargeActive === true;
  const hasDecreeMove = unit.genghisKhanDecreeMovePending === true;
  const isChicken = (unit.lokiChickenSources?.length ?? 0) > 0;

  if (
    !canSpendSlots(unit, { move: true }) &&
    !hasDecreeMove &&
    !isMongolCharge
  ) {
    return { state, events: [] };
  }

  let legalMoves: Coord[] = [];
  const pending = state.pendingMove;
  const pendingValid = Boolean(
    pending &&
      pending.unitId === unit.id &&
      pending.expiresTurnNumber === state.turnNumber
  );
  if (isMongolCharge && !pendingValid) {
    return { state, events: [] };
  }

  const movementModes = getMovementModes(unit);
  const requiresPendingMove =
    !isChicken &&
    (movementModes.length > 1 ||
      unitHasMovementMode(unit, "trickster") ||
      unitHasMovementMode(unit, "berserker"));
  if (requiresPendingMove && !pendingValid) {
    return { state, events: [] };
  }

  if (pendingValid) {
    legalMoves = pending!.legalTo;
  } else {
    const normalModes = getMovementModes(unit).filter(
      (mode) => mode !== "trickster" && mode !== "berserker"
    );
    if (normalModes.length === 0) {
      return { state, events: [] };
    }
    legalMoves = getLegalMovesForUnitModes(state, unit.id, normalModes);
  }

  const isLegal = legalMoves.some((c) => coordsEqual(c, moveAction.to));
  if (!isLegal) {
    return { state, events: [] };
  }

  if (isMongolCharge) {
    return applyMongolChargeMove(state, unit, moveAction, rng);
  }

  const moveMode =
    pendingValid && pending?.mode ? pending.mode : ("normal" as MoveMode);
  const riderMovementMode =
    moveMode === "rider" ||
    (moveMode === "normal" &&
      (unit.class === "rider" || hasMettatonRiderMovement(unit)));
  const isMettatonRider = hasMettatonRiderMovement(unit);
  const riderPathFeatureEnabled =
    !isRiverPerson(unit) &&
    riderMovementMode &&
    (!isMettatonRider || hasMettatonRiderPathFeature(unit));

  const intendedLine =
    moveMode === "trickster" ? null : linePath(from, moveAction.to);
  if (moveAction.__forestBypass !== true) {
    const forestCheck = maybeRequestForestMoveCheck(
      state,
      unit,
      from,
      moveAction.to,
      intendedLine,
      legalMoves
    );
    if (forestCheck) {
      return forestCheck;
    }
  }

  const stakePath = intendedLine ? intendedLine.slice(1) : [moveAction.to];
  const stakeStop = findStakeStopOnPath(state, unit, stakePath);
  const finalTo = stakeStop ?? moveAction.to;
  const didMove = !coordsEqual(finalTo, from);

  const stateAfterMoveCost = state;
  const costEvents: GameEvent[] = [];
  const movedUnitBaseRaw: UnitState = spendSlots(unit, { move: true });
  const movedUnitBase =
    didMove && unit.courtGlobalMoveOnce && !unit.courtGlobalMoveOnce.used
      ? markCourtGlobalMoveUsed(movedUnitBaseRaw)
      : movedUnitBaseRaw;
  const movedUnit: UnitState = isRiverPerson(movedUnitBase)
    ? {
        ...movedUnitBase,
        riverBoatCarryAllyId: undefined,
        riverBoatmanMovePending: false,
      }
    : movedUnitBase;
  let updatedUnit: UnitState = {
    ...movedUnit,
    position: { ...finalTo },
    genghisKhanDecreeMovePending: hasDecreeMove
      ? false
      : movedUnit.genghisKhanDecreeMovePending,
  };

  let newState: GameState = {
    ...stateAfterMoveCost,
    units: {
      ...stateAfterMoveCost.units,
      [updatedUnit.id]: updatedUnit,
    },
    pendingMove:
      pendingValid && pending?.unitId === updatedUnit.id
        ? null
        : stateAfterMoveCost.pendingMove,
  };

  let events: GameEvent[] = [...costEvents];
  if (didMove) {
    events.push(evUnitMoved({ unitId: updatedUnit.id, from, to: updatedUnit.position! }));
  }

  if (didMove) {
    const stakeResult = applyStakeTriggerIfAny(
      newState,
      updatedUnit,
      updatedUnit.position!,
      rng
    );
    if (stakeResult.triggered) {
      newState = stakeResult.state;
      updatedUnit = stakeResult.unit;
      events = [...events, ...stakeResult.events];
    }
  }

  if (!updatedUnit.position) {
    return { state: newState, events };
  }

  if (didMove && from) {
    const riderPathResult = maybeRequestRiderPathAttacks(
      state,
      newState,
      unit,
      from,
      finalTo,
      events,
      riderMovementMode,
      riderPathFeatureEnabled
    );
    if (riderPathResult) {
      return riderPathResult;
    }
  }

  const riverDropResult = maybeHandleRiverCarryDrop(newState, updatedUnit, events);
  if (riverDropResult) {
    return riverDropResult;
  }

  const lechyResult = maybeHandleLechyGuideTraveler(newState, updatedUnit, events);
  if (lechyResult) {
    return lechyResult;
  }

  return { state: newState, events };
}
