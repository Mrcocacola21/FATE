import { create } from "zustand";
import type { GameEvent, GameState, PlayerId } from "rules";

export type ActionMode = "move" | "attack" | "place" | "aoe" | null;

interface GameStore {
  gameId: string | null;
  playerId: PlayerId | null;
  view: GameState | null;
  events: GameEvent[];
  lastLogIndex: number;
  selectedUnitId: string | null;
  actionMode: ActionMode;
  placeUnitId: string | null;
  setConnection: (gameId: string, playerId: PlayerId) => void;
  setView: (view: GameState) => void;
  applyServerUpdate: (view: GameState, events: GameEvent[], logIndex: number) => void;
  addEvents: (events: GameEvent[]) => void;
  setSelectedUnit: (unitId: string | null) => void;
  setActionMode: (mode: ActionMode) => void;
  setPlaceUnitId: (unitId: string | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameId: null,
  playerId: null,
  view: null,
  events: [],
  lastLogIndex: -1,
  selectedUnitId: null,
  actionMode: null,
  placeUnitId: null,
  setConnection: (gameId, playerId) =>
    set({ gameId, playerId, events: [], lastLogIndex: -1 }),
  setView: (view) => set({ view }),
  applyServerUpdate: (view, events, logIndex) =>
    set((state) => {
      if (logIndex <= state.lastLogIndex) {
        return { view };
      }
      return {
        view,
        events: [...state.events, ...events].slice(-200),
        lastLogIndex: logIndex,
      };
    }),
  addEvents: (events) =>
    set((state) => ({ events: [...state.events, ...events].slice(-200) })),
  setSelectedUnit: (unitId) => set({ selectedUnitId: unitId }),
  setActionMode: (mode) => set({ actionMode: mode }),
  setPlaceUnitId: (unitId) => set({ placeUnitId: unitId }),
  reset: () =>
    set({
      gameId: null,
      playerId: null,
      view: null,
      events: [],
      lastLogIndex: -1,
      selectedUnitId: null,
      actionMode: null,
      placeUnitId: null,
    }),
}));
