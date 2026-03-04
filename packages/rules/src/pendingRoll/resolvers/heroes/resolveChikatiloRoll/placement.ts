import type { ApplyResult, Coord, GameEvent, GameState, PendingRoll, ResolveRollChoice, UnitState } from "../../../../model";
import { isInsideBoard } from "../../../../model";
import { getUnitAt } from "../../../../board";
import { clearPendingRoll } from "../../../../core";
import { evUnitPlaced } from "../../../../core";
import { requestChikatiloPlacement } from "../../../../actions/heroes/chikatilo";
import { isVlad } from "../../../../actions/shared";
import { activateVladForest, requestVladStakesPlacement } from "../../../../actions/heroes/vlad";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../../../heroes";
import { getUnitDefinition } from "../../../../units";
import {
  coordKey,
  getLegalEmptyCells,
  insertAfter,
  isCoordLike,
} from "./shared";

function maybeRequestVladBattleStartStakes(state: GameState): ApplyResult {
  const vladOwners = Array.from(
    new Set(
      Object.values(state.units)
        .filter((u) => u.isAlive && isVlad(u))
        .map((u) => u.owner)
    )
  ).sort();

  if (vladOwners.length === 0) {
    return { state, events: [] };
  }

  const [firstOwner, ...queue] = vladOwners;
  const ownedStakes = state.stakeMarkers.filter(
    (marker) => marker.owner === firstOwner
  ).length;
  const vladUnit = Object.values(state.units).find(
    (u) => u.isAlive && isVlad(u) && u.owner === firstOwner
  );

  if (ownedStakes >= 9 && vladUnit) {
    return activateVladForest(state, vladUnit.id, firstOwner);
  }

  return requestVladStakesPlacement(state, firstOwner, "battleStart", queue);
}

export function resolveChikatiloFalseTrailPlacement(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as {
    chikatiloId?: string;
    legalPositions?: Coord[];
    queue?: string[];
  };
  const chikatiloId = ctx.chikatiloId;
  if (!chikatiloId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; position?: Coord })
      : undefined;
  if (!payload || payload.type !== "chikatiloPlace" || !payload.position) {
    return { state, events: [] };
  }

  const pos = payload.position;
  if (!isInsideBoard(pos, state.boardSize)) {
    return { state, events: [] };
  }
  if (getUnitAt(state, pos)) {
    return { state, events: [] };
  }

  const rawLegal = Array.isArray(ctx.legalPositions) ? ctx.legalPositions : null;
  const legalPositions =
    rawLegal && rawLegal.length > 0 && rawLegal.every(isCoordLike)
      ? (rawLegal as Coord[])
      : getLegalEmptyCells(state);
  const legalSet = new Set(legalPositions.map(coordKey));
  if (!legalSet.has(coordKey(pos))) {
    return { state, events: [] };
  }

  const unit = state.units[chikatiloId];
  if (!unit || !unit.isAlive) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const def = getUnitDefinition("assassin");
  const updatedUnit: UnitState = {
    ...unit,
    position: { ...pos },
    isStealthed: true,
    stealthTurnsLeft: def.maxStealthTurns ?? 3,
  };

  const owner = updatedUnit.owner;
  const other = owner === "P1" ? "P2" : "P1";
  const nextKnowledge: GameState["knowledge"] = {
    ...state.knowledge,
    [owner]: { ...(state.knowledge?.[owner] ?? {}), [updatedUnit.id]: true },
    [other]: { ...(state.knowledge?.[other] ?? {}) },
  };
  delete nextKnowledge[other][updatedUnit.id];

  const clearedLastKnown = {
    ...state.lastKnownPositions,
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };
  delete clearedLastKnown.P1[updatedUnit.id];
  delete clearedLastKnown.P2[updatedUnit.id];

  const tokenId =
    updatedUnit.chikatiloFalseTrailTokenId ??
    Object.values(state.units).find(
      (u) =>
        u.isAlive &&
        u.owner === owner &&
        u.heroId === HERO_FALSE_TRAIL_TOKEN_ID
    )?.id ??
    null;

  let placementOrder = state.placementOrder;
  if (!placementOrder.includes(updatedUnit.id)) {
    placementOrder = insertAfter(placementOrder, tokenId, updatedUnit.id);
  }
  let turnOrder = state.turnOrder;
  if (!turnOrder.includes(updatedUnit.id)) {
    turnOrder = insertAfter(turnOrder, tokenId, updatedUnit.id);
  }
  let turnQueue = state.turnQueue;
  if (!turnQueue.includes(updatedUnit.id)) {
    turnQueue = insertAfter(turnQueue, tokenId, updatedUnit.id);
  }

  let nextState: GameState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
    knowledge: nextKnowledge,
    lastKnownPositions: clearedLastKnown,
    placementOrder,
    turnOrder,
    turnQueue,
  });

  let events: GameEvent[] = [
    evUnitPlaced({ unitId: updatedUnit.id, position: updatedUnit.position! }),
  ];

  const queue = Array.isArray(ctx.queue) ? ctx.queue : [];
  if (queue.length > 0) {
    const [nextId, ...rest] = queue;
    const requested = requestChikatiloPlacement(nextState, nextId, rest);
    nextState = requested.state;
    events = [...events, ...requested.events];
    return { state: nextState, events };
  }

  if (nextState.phase === "battle" && !nextState.pendingRoll) {
    const vlad = maybeRequestVladBattleStartStakes(nextState);
    if (vlad.state !== nextState || vlad.events.length > 0) {
      return { state: vlad.state, events: [...events, ...vlad.events] };
    }
  }

  return { state: nextState, events };
}
