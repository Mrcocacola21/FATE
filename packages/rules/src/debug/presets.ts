import {
  ABILITY_EL_SID_COMPEADOR_KOLADA,
  ABILITY_KAISER_ENGINEERING_MIRACLE,
} from "../abilities";
import {
  HERO_ASGORE_ID,
  HERO_EL_CID_COMPEADOR_ID,
  HERO_GENGHIS_KHAN_ID,
  HERO_GRAND_KAISER_ID,
  HERO_GRIFFITH_ID,
  HERO_GUTS_ID,
  HERO_HASSAN_ID,
  HERO_KALADIN_ID,
  HERO_METTATON_ID,
  HERO_PAPYRUS_ID,
  HERO_VLAD_TEPES_ID,
} from "../heroes";
import type { Coord, GameState, PlayerId, UnitState } from "../model";
import type { DebugPresetId } from "./types";
import { createDebugSandboxState, createDebugUnit } from "./state";

type Spawn = {
  heroId: string;
  owner: PlayerId;
  coord: Coord;
  patch?: Partial<UnitState>;
};

function build(spawns: Spawn[], currentPlayer: PlayerId = "P1"): GameState {
  let state = createDebugSandboxState();
  for (const spawn of spawns) {
    const unit = createDebugUnit(state, spawn.heroId, spawn.owner, spawn.coord);
    if (!unit) continue;
    const patched = { ...unit, ...spawn.patch };
    state = {
      ...state,
      units: { ...state.units, [patched.id]: patched },
      knowledge: {
        P1: { ...state.knowledge.P1, [patched.id]: true },
        P2: { ...state.knowledge.P2, [patched.id]: true },
      },
    };
  }
  const queue = Object.keys(state.units);
  const activeUnitId =
    queue.find((id) => state.units[id].owner === currentPlayer) ?? queue[0] ?? null;
  return {
    ...state,
    currentPlayer,
    activeUnitId,
    turnOrder: queue,
    turnQueue: queue,
    placementOrder: queue,
  };
}

export function createDebugPreset(presetId: DebugPresetId): GameState {
  switch (presetId) {
    case "empty":
      return createDebugSandboxState();
    case "basic-duel":
      return build([
        { heroId: HERO_GRIFFITH_ID, owner: "P1", coord: { col: 3, row: 4 } },
        { heroId: HERO_VLAD_TEPES_ID, owner: "P2", coord: { col: 4, row: 4 } },
      ]);
    case "aoe-cluster":
      return build([
        { heroId: HERO_GRAND_KAISER_ID, owner: "P1", coord: { col: 1, row: 4 } },
        { heroId: HERO_GUTS_ID, owner: "P2", coord: { col: 4, row: 4 } },
        { heroId: HERO_PAPYRUS_ID, owner: "P2", coord: { col: 4, row: 3 } },
        { heroId: HERO_ASGORE_ID, owner: "P1", coord: { col: 5, row: 4 } },
        { heroId: HERO_HASSAN_ID, owner: "P2", coord: { col: 5, row: 5 } },
      ]);
    case "line-attack":
      return build([
        {
          heroId: HERO_METTATON_ID,
          owner: "P1",
          coord: { col: 1, row: 4 },
          patch: { mettatonRating: 12, mettatonExUnlocked: true },
        },
        { heroId: HERO_GRIFFITH_ID, owner: "P2", coord: { col: 3, row: 4 } },
        { heroId: HERO_GUTS_ID, owner: "P2", coord: { col: 5, row: 4 } },
        { heroId: HERO_VLAD_TEPES_ID, owner: "P2", coord: { col: 7, row: 4 } },
      ]);
    case "rider-path":
      return build([
        { heroId: HERO_GENGHIS_KHAN_ID, owner: "P1", coord: { col: 1, row: 1 } },
        { heroId: HERO_GRIFFITH_ID, owner: "P2", coord: { col: 2, row: 2 } },
        { heroId: HERO_GUTS_ID, owner: "P2", coord: { col: 3, row: 3 } },
        { heroId: HERO_VLAD_TEPES_ID, owner: "P2", coord: { col: 4, row: 4 } },
      ]);
    case "stake-trigger": {
      const state = build([
        { heroId: HERO_VLAD_TEPES_ID, owner: "P1", coord: { col: 1, row: 4 } },
        { heroId: HERO_GENGHIS_KHAN_ID, owner: "P2", coord: { col: 5, row: 4 } },
      ]);
      return {
        ...state,
        stakeCounter: 2,
        stakeMarkers: [
          {
            id: "debug-stake-1",
            owner: "P1",
            position: { col: 4, row: 4 },
            createdAt: 1,
            isRevealed: false,
          },
          {
            id: "debug-stake-2",
            owner: "P1",
            position: { col: 3, row: 4 },
            createdAt: 1,
            isRevealed: true,
          },
        ],
      };
    }
    case "stealth-reveal":
      return build([
        { heroId: HERO_HASSAN_ID, owner: "P1", coord: { col: 4, row: 4 } },
        {
          heroId: HERO_GRIFFITH_ID,
          owner: "P2",
          coord: { col: 6, row: 4 },
          patch: { isStealthed: true, stealthTurnsLeft: 3 },
        },
        { heroId: HERO_KALADIN_ID, owner: "P2", coord: { col: 7, row: 6 } },
      ]);
    case "transformation":
      return build([
        {
          heroId: HERO_GRAND_KAISER_ID,
          owner: "P1",
          coord: { col: 1, row: 2 },
          patch: {
            charges: { [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4 },
          },
        },
        {
          heroId: HERO_GUTS_ID,
          owner: "P1",
          coord: { col: 1, row: 5 },
          patch: { gutsBerserkModeActive: true },
        },
        {
          heroId: HERO_METTATON_ID,
          owner: "P2",
          coord: { col: 7, row: 2 },
          patch: {
            mettatonRating: 12,
            mettatonExUnlocked: true,
            mettatonNeoUnlocked: true,
          },
        },
        {
          heroId: HERO_GRIFFITH_ID,
          owner: "P2",
          coord: { col: 7, row: 5 },
          patch: { hp: 1 },
        },
      ]);
    case "impulse":
      return build([
        {
          heroId: HERO_EL_CID_COMPEADOR_ID,
          owner: "P1",
          coord: { col: 2, row: 4 },
          patch: { charges: { [ABILITY_EL_SID_COMPEADOR_KOLADA]: 3 } },
        },
        {
          heroId: HERO_GRAND_KAISER_ID,
          owner: "P1",
          coord: { col: 2, row: 6 },
          patch: {
            charges: { [ABILITY_KAISER_ENGINEERING_MIRACLE]: 4 },
          },
        },
        { heroId: HERO_GUTS_ID, owner: "P2", coord: { col: 5, row: 4 } },
        { heroId: HERO_VLAD_TEPES_ID, owner: "P2", coord: { col: 6, row: 4 } },
      ]);
    case "healing-status":
      return build([
        {
          heroId: HERO_KALADIN_ID,
          owner: "P1",
          coord: { col: 3, row: 4 },
          patch: { hp: 2 },
        },
        {
          heroId: HERO_PAPYRUS_ID,
          owner: "P1",
          coord: { col: 4, row: 4 },
          patch: { hp: 3 },
        },
        {
          heroId: HERO_GUTS_ID,
          owner: "P2",
          coord: { col: 6, row: 4 },
          patch: {
            hp: 4,
            movementDisabledNextTurn: true,
            lokiChickenSources: ["debug"],
          },
        },
      ]);
  }
}
