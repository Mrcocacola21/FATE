import type { ApplyResult, GameEvent, GameState } from "../../model";
import type { RNG } from "../../rng";
import { evTurnStarted } from "../../core";
import { applyGutsEndTurnDrain } from "../heroes/guts";
import { clearAsgoreTurnFlags } from "../heroes/asgore";
import { clearRiverTurnFlags } from "../heroes/riverPerson";
import {
  clearGenghisTurnFlags,
  clearLechyGuideTravelerTarget,
  getNextAliveUnitIndex,
  nextPlayer,
} from "./helpers";
import {
  applyNormalVictoryCheck,
  handleRuleDeclarationRoundEnd,
} from "../../ruleDeclarations";
import { expireChikatiloTrackingAfterTargetTurn } from "../../chikatiloMark";
import { advanceStormDurationAfterTurn } from "../heroes/lechy";

export function applyEndTurn(state: GameState, rng: RNG): ApplyResult {
  if (state.phase === "ended") {
    return { state, events: [] };
  }

  if (state.phase === "placement") {
    const next = nextPlayer(state.currentPlayer);
    const baseState: GameState = {
      ...state,
      currentPlayer: next,
      turnNumber: state.turnNumber + 1,
      activeUnitId: null,
      pendingMove: null,
    };

    return {
      state: baseState,
      events: [evTurnStarted({ player: next, turnNumber: baseState.turnNumber })],
    };
  }

  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const drained = applyGutsEndTurnDrain(state, state.activeUnitId);
  const stateAfterDrain = drained.state;
  const stateAfterGenghis = clearGenghisTurnFlags(
    stateAfterDrain,
    stateAfterDrain.activeUnitId
  );
  const stateAfterLechy = clearLechyGuideTravelerTarget(
    stateAfterGenghis,
    stateAfterGenghis.activeUnitId
  );
  const stateAfterTurn = clearAsgoreTurnFlags(
    stateAfterLechy,
    stateAfterLechy.activeUnitId
  );
  const stateAfterRiver = clearRiverTurnFlags(
    stateAfterTurn,
    stateAfterTurn.activeUnitId
  );
  const stateAfterChikatiloExpiry = expireChikatiloTrackingAfterTargetTurn(
    stateAfterRiver,
    stateAfterRiver.activeUnitId
  );
  const stateAfterArenaEffects = advanceStormDurationAfterTurn(
    stateAfterChikatiloExpiry,
    state.turnNumber
  );

  const normalVictory = applyNormalVictoryCheck(
    stateAfterArenaEffects,
    drained.events
  );
  if (normalVictory.state.phase === "ended") return normalVictory;

  const queue = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
  if (queue.length === 0) {
    return { state: stateAfterArenaEffects, events: drained.events };
  }

  const prevIndex =
    state.turnQueue.length > 0 ? state.turnQueueIndex : state.turnOrderIndex;
  const nextIndex = getNextAliveUnitIndex(
    stateAfterArenaEffects,
    prevIndex,
    queue
  );
  if (nextIndex === null) {
    return {
      state: {
        ...stateAfterArenaEffects,
        phase: "ended",
        activeUnitId: null,
        pendingMove: null,
      },
      events: drained.events,
    };
  }

  const order = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
  const nextUnitId = order[nextIndex];
  const nextUnit = stateAfterArenaEffects.units[nextUnitId]!;
  const turnOwner = nextUnit.owner;
  const isNewRound = nextIndex <= prevIndex;

  const baseState: GameState = {
    ...stateAfterArenaEffects,
    currentPlayer: turnOwner,
    turnNumber: state.turnNumber + 1,
    roundNumber: state.roundNumber + (isNewRound ? 1 : 0),
    activeUnitId: null,
    pendingMove: null,
    turnOrderIndex: nextIndex,
    turnQueueIndex: nextIndex,
  };

  const events: GameEvent[] = [];
  if (isNewRound) {
    const ruleRoundEnd = handleRuleDeclarationRoundEnd(
      {
        ...baseState,
        roundNumber: state.roundNumber,
        turnNumber: state.turnNumber,
        currentPlayer: stateAfterArenaEffects.currentPlayer,
        turnOrderIndex: prevIndex,
        turnQueueIndex: prevIndex,
      },
      {
        nextRoundNumber: baseState.roundNumber,
        nextTurnNumber: baseState.turnNumber,
        nextIndex,
        nextUnitId,
        nextPlayer: turnOwner,
      },
      rng
    );
    return {
      state: ruleRoundEnd.state,
      events: [...drained.events, ...ruleRoundEnd.events],
    };
  }
  events.push(
    evTurnStarted({ player: turnOwner, turnNumber: baseState.turnNumber })
  );

  return { state: baseState, events: [...drained.events, ...events] };
}
