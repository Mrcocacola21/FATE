import type {
  ApplyResult,
  GameEvent,
  GameState,
  PendingRoll,
  PlayerId,
  RollKind,
} from "../../model";
import { evInitiativeRollRequested, evRollRequested } from "./events";

export function requestRoll(
  state: GameState,
  player: PlayerId,
  kind: RollKind,
  context: Record<string, unknown>,
  actorUnitId?: string
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  const nextCounter = (state.rollCounter ?? 0) + 1;
  const rollId = `roll-${nextCounter}`;
  const pendingRoll: PendingRoll = {
    id: rollId,
    player,
    kind,
    context,
  };
  const nextState: GameState = {
    ...state,
    pendingRoll,
    rollCounter: nextCounter,
  };
  const events: GameEvent[] = [
    evRollRequested({ rollId, kind, player, actorUnitId }),
  ];
  return { state: nextState, events };
}

export function clearPendingRoll(state: GameState): GameState {
  if (!state.pendingRoll) return state;
  return { ...state, pendingRoll: null };
}

export function requestInitiativeRoll(
  state: GameState,
  player: PlayerId
): ApplyResult {
  const requested = requestRoll(
    state,
    player,
    "initiativeRoll",
    { step: player },
    undefined
  );

  const rollId = requested.state.pendingRoll?.id ?? "";
  const events: GameEvent[] = [
    ...requested.events,
    evInitiativeRollRequested({ rollId, player }),
  ];

  return { state: requested.state, events };
}

export function replacePendingRoll(
  state: GameState,
  player: PlayerId,
  kind: RollKind,
  context: Record<string, unknown>,
  actorUnitId?: string
): ApplyResult {
  const baseState = clearPendingRoll(state);
  return requestRoll(baseState, player, kind, context, actorUnitId);
}
