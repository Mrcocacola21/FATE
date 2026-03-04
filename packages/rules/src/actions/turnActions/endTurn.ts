import type { ApplyResult, GameEvent, GameState, PlayerId } from "../../model";
import type { RNG } from "../../rng";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../heroes";
import { evGameEnded, evRoundStarted, evTurnStarted } from "../../core";
import { applyGutsEndTurnDrain } from "../heroes/guts";
import { clearAsgoreTurnFlags } from "../heroes/asgore";
import { clearRiverTurnFlags } from "../heroes/riverPerson";
import {
  clearGenghisTurnFlags,
  clearLechyGuideTravelerTarget,
  getNextAliveUnitIndex,
  nextPlayer,
} from "./helpers";

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

  const p1Alive = Object.values(stateAfterRiver.units).some(
    (unit) =>
      unit.owner === "P1" &&
      unit.isAlive &&
      unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
  );
  const p2Alive = Object.values(stateAfterRiver.units).some(
    (unit) =>
      unit.owner === "P2" &&
      unit.isAlive &&
      unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
  );

  if (!p1Alive || !p2Alive) {
    const winner: PlayerId | null =
      !p1Alive && p2Alive ? "P2" : p1Alive && !p2Alive ? "P1" : null;
    const endedState: GameState = {
      ...stateAfterRiver,
      phase: "ended",
      activeUnitId: null,
      pendingMove: null,
    };
    const events: GameEvent[] = [...drained.events];
    if (winner) {
      events.push(evGameEnded({ winner }));
    }
    return { state: endedState, events };
  }

  const queue = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
  if (queue.length === 0) {
    return { state: stateAfterRiver, events: drained.events };
  }

  const prevIndex =
    state.turnQueue.length > 0 ? state.turnQueueIndex : state.turnOrderIndex;
  const nextIndex = getNextAliveUnitIndex(stateAfterRiver, prevIndex, queue);
  if (nextIndex === null) {
    return {
      state: {
        ...stateAfterRiver,
        phase: "ended",
        activeUnitId: null,
        pendingMove: null,
      },
      events: drained.events,
    };
  }

  const order = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
  const nextUnitId = order[nextIndex];
  const nextUnit = stateAfterRiver.units[nextUnitId]!;
  const turnOwner = nextUnit.owner;
  const isNewRound = nextIndex <= prevIndex;

  const baseState: GameState = {
    ...stateAfterRiver,
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
    events.push(evRoundStarted({ roundNumber: baseState.roundNumber }));
  }
  events.push(
    evTurnStarted({ player: turnOwner, turnNumber: baseState.turnNumber })
  );

  return { state: baseState, events: [...drained.events, ...events] };
}
