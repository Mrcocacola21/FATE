import type {
  ApplyResult,
  GameEvent,
  GameState,
  PendingRoll,
  PlayerId,
} from "../../../model";
import type { RNG } from "../../../rng";
import { roll2D6 } from "../../../rng";
import { clearPendingRoll, requestInitiativeRoll } from "../../../core";
import {
  evInitiativeRolled,
  evInitiativeResolved,
  evPlacementStarted,
} from "../../../core";

export function resolveInitiativeRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  if (state.phase !== "lobby") {
    return { state: clearPendingRoll(state), events: [] };
  }

  const roll = roll2D6(rng);
  const nextInitiative = {
    ...state.initiative,
    [pending.player]: roll.sum,
  } as GameState["initiative"];

  const nextState: GameState = {
    ...state,
    initiative: nextInitiative,
  };

  const events: GameEvent[] = [
    evInitiativeRolled({
      player: pending.player,
      dice: roll.dice,
      sum: roll.sum,
    }),
  ];

  if (pending.player === "P1") {
    const requested = requestInitiativeRoll(clearPendingRoll(nextState), "P2");
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  const p1 = nextInitiative.P1;
  const p2 = nextInitiative.P2;
  if (p1 === null || p2 === null) {
    return { state: clearPendingRoll(nextState), events };
  }

  if (p1 === p2) {
    const resetState: GameState = {
      ...nextState,
      initiative: { P1: null, P2: null, winner: null },
    };
    const requested = requestInitiativeRoll(clearPendingRoll(resetState), "P1");
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  const winner: PlayerId = p1 > p2 ? "P1" : "P2";
  const placementState: GameState = {
    ...nextState,
    phase: "placement",
    currentPlayer: winner,
    placementFirstPlayer: winner,
    initiative: { ...nextInitiative, winner },
    pendingRoll: null,
    pendingMove: null,
    activeUnitId: null,
    placementOrder: [],
    turnOrder: [],
    turnQueue: [],
    turnQueueIndex: 0,
    turnOrderIndex: 0,
    unitsPlaced: { P1: 0, P2: 0 },
  };

  const resolvedEvents: GameEvent[] = [
    ...events,
    evInitiativeResolved({
      winner,
      P1sum: p1,
      P2sum: p2,
    }),
    evPlacementStarted({ placementFirstPlayer: winner }),
  ];

  return { state: placementState, events: resolvedEvents };
}


