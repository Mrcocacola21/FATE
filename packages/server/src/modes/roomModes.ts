import {
  attachArmy,
  createClassicArmy,
  createDefaultArmy,
  createDraftArmy,
  type GameModeId,
  type HeroSelection,
} from "rules";
import type { GameRoom } from "../store";

function resetRoomUnits(room: GameRoom) {
  room.state = {
    ...room.state,
    units: {},
    knowledge: { P1: {}, P2: {} },
    lastKnownPositions: { P1: {}, P2: {} },
    pendingMove: null,
    pendingCombatQueue: [],
    pendingAoE: null,
    activeUnitId: null,
    placementOrder: [],
    turnOrder: [],
    turnOrderIndex: 0,
    turnQueue: [],
    turnQueueIndex: 0,
    unitsPlaced: { P1: 0, P2: 0 },
    startingUnitId: null,
    initiative: { P1: null, P2: null, winner: null },
    placementFirstPlayer: null,
  };
}

function attachRoomArmies(
  room: GameRoom,
  selections: Partial<Record<"P1" | "P2", HeroSelection>>
) {
  resetRoomUnits(room);
  room.state = attachArmy(room.state, createDefaultArmy("P1", selections.P1));
  room.state = attachArmy(room.state, createDefaultArmy("P2", selections.P2));
}

export function isGameModeLocked(room: GameRoom): boolean {
  return (
    room.state.phase !== "lobby" ||
    !!room.state.pendingRoll ||
    !!room.draftState
  );
}

export function rebuildLobbyArmiesForMode(room: GameRoom) {
  if (room.gameMode === "classic") {
    resetRoomUnits(room);
    room.state = attachArmy(room.state, createClassicArmy("P1"));
    room.state = attachArmy(room.state, createClassicArmy("P2"));
    return;
  }

  if (room.gameMode === "standard") {
    attachRoomArmies(room, room.figureSets);
    return;
  }

  attachRoomArmies(room, {});
}

export function rebuildDraftedArmies(room: GameRoom) {
  if (!room.draftState || room.draftState.phase !== "complete") return;
  resetRoomUnits(room);
  room.state = attachArmy(
    room.state,
    createDraftArmy("P1", room.draftState.picks.P1)
  );
  room.state = attachArmy(
    room.state,
    createDraftArmy("P2", room.draftState.picks.P2)
  );
}

export function setRoomGameMode(room: GameRoom, gameMode: GameModeId) {
  room.gameMode = gameMode;
  room.draftState = null;
  rebuildLobbyArmiesForMode(room);
}
