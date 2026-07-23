import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  getAbilitySpec,
  getChargeLimit,
  getAbilityViewsForUnit,
  isUnboundedChargeCounter,
  setCharges,
} from "../abilities";
import { createDefaultArmy, createEmptyGame } from "../actions";
import { getHeroDefinition } from "../heroes";
import { HERO_GRAND_KAISER_ID, HERO_GRIFFITH_ID } from "../heroes";
import type { Coord, GamePhase, GameState, PlayerId, UnitState } from "../model";
import { isInsideBoard, makeEmptyTurnEconomy } from "../model";
import { getHeroMeta } from "../heroMeta";
import type { DebugMutationResult, DebugStateCommand, DebugUnitStatus } from "./types";
import { createDebugPreset } from "./presets";
import { applyKaiserEngineeringMiracle } from "../actions/heroes/kaiser";
import { applyGriffithFemtoRebirth } from "../actions/heroes/griffith";
import { clearUnitStealth, enterUnitStealth } from "../stealth";

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reject(state: GameState, error: string): DebugMutationResult {
  return { state, changed: false, error };
}

function accept(state: GameState): DebugMutationResult {
  return { state, changed: true };
}

function occupied(state: GameState, coord: Coord, exceptUnitId?: string): boolean {
  return Object.values(state.units).some(
    (unit) =>
      unit.id !== exceptUnitId &&
      unit.isAlive &&
      unit.position?.col === coord.col &&
      unit.position?.row === coord.row,
  );
}

function nextDebugUnitId(state: GameState, owner: PlayerId, heroId: string): string {
  const safeHeroId = heroId.replace(/[^a-zA-Z0-9_-]/g, "-");
  let index = 1;
  while (state.units[`debug-${owner}-${safeHeroId}-${index}`]) index += 1;
  return `debug-${owner}-${safeHeroId}-${index}`;
}

export function createDebugUnit(
  state: GameState,
  heroId: string,
  owner: PlayerId,
  coord: Coord,
): UnitState | null {
  const meta = getHeroMeta(heroId);
  if (!meta) return null;

  const hero = getHeroDefinition(heroId);
  const selection = hero ? { [meta.mainClass]: heroId } : undefined;
  const template = createDefaultArmy(owner, selection).find(
    (unit) => unit.class === meta.mainClass,
  );
  if (!template) return null;

  return {
    ...template,
    id: nextDebugUnitId(state, owner, heroId),
    figureId: heroId,
    heroId: hero?.id,
    position: { ...coord },
  };
}

export function createDebugSandboxState(): GameState {
  return {
    ...createEmptyGame(),
    phase: "battle",
    seats: { P1: true, P2: false },
    playersReady: { P1: true, P2: true },
    hostPlayerId: "P1",
    currentPlayer: "P1",
  };
}

function resetActions(unit: UnitState): UnitState {
  return {
    ...unit,
    turn: makeEmptyTurnEconomy(),
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    stealthAttemptedThisTurn: false,
  };
}

function setUnitStatus(unit: UnitState, status: DebugUnitStatus, value: boolean): UnitState {
  switch (status) {
    case "isStealthed":
      return value ? enterUnitStealth(unit) : clearUnitStealth(unit);
    case "movementDisabledNextTurn":
      return { ...unit, movementDisabledNextTurn: value };
    case "transformed":
      return { ...unit, transformed: value };
    case "bunker":
      return {
        ...(value ? clearUnitStealth(unit) : unit),
        bunker: { active: value, ownTurnsInBunker: 0 },
      };
    case "gutsBerserkModeActive":
      return { ...unit, gutsBerserkModeActive: value };
    case "papyrusUnbelieverActive":
      return { ...unit, papyrusUnbelieverActive: value };
    case "sansUnbelieverUnlocked":
      return { ...unit, sansUnbelieverUnlocked: value };
    case "mettatonExUnlocked":
      return { ...unit, mettatonExUnlocked: value };
    case "mettatonNeoUnlocked":
      return {
        ...unit,
        mettatonExUnlocked: value ? true : unit.mettatonExUnlocked,
        mettatonNeoUnlocked: value,
      };
    case "undyneImmortalActive":
      return { ...unit, undyneImmortalActive: value };
    case "chicken":
      return { ...unit, lokiChickenSources: value ? ["debug"] : [] };
  }
}

function setAllCharges(unit: UnitState, mode: "fill" | "clear"): UnitState {
  const abilities = getAbilityViewsForUnit(
    {
      ...createDebugSandboxState(),
      units: { [unit.id]: unit },
      activeUnitId: unit.id,
      currentPlayer: unit.owner,
    },
    unit.id,
  );
  const charges = { ...unit.charges };
  for (const ability of abilities) {
    if (mode === "clear") {
      charges[ability.id] = 0;
      continue;
    }
    if (isUnboundedChargeCounter(ability.id)) continue;
    const maximum = getChargeLimit(ability.id) ?? 0;
    if (maximum > 0) charges[ability.id] = maximum;
  }
  if (mode === "fill" && unit.class === "berserker") {
    charges[ABILITY_BERSERK_AUTO_DEFENSE] =
      getAbilitySpec(ABILITY_BERSERK_AUTO_DEFENSE)?.maxCharges ?? 6;
  }
  return { ...unit, charges };
}

function updateTurnQueue(state: GameState): GameState {
  const alive = Object.values(state.units)
    .filter((unit) => unit.isAlive && unit.position)
    .map((unit) => unit.id);
  const currentPlayer = state.currentPlayer ?? "P1";
  const activeUnitId =
    state.activeUnitId &&
    alive.includes(state.activeUnitId) &&
    state.units[state.activeUnitId]?.owner === currentPlayer
      ? state.activeUnitId
      : (alive.find((id) => state.units[id].owner === currentPlayer) ?? alive[0] ?? null);
  return {
    ...state,
    turnOrder: alive,
    turnQueue: alive,
    placementOrder: alive,
    turnOrderIndex: Math.max(0, alive.indexOf(activeUnitId ?? "")),
    turnQueueIndex: Math.max(0, alive.indexOf(activeUnitId ?? "")),
    activeUnitId,
  };
}

export function applyDebugStateCommand(
  state: GameState,
  command: DebugStateCommand,
): DebugMutationResult {
  if (command.type === "debugApplyPreset") {
    return accept(createDebugPreset(command.presetId));
  }
  if (command.type === "debugClearBoard") {
    return accept(createDebugSandboxState());
  }
  if (command.type === "debugClearMarkers") {
    return accept({
      ...state,
      stakeMarkers: [],
      forestMarkers: [],
      forestMarker: null,
    });
  }
  if (command.type === "debugSetPhase") {
    return accept({
      ...state,
      phase: command.phase as GamePhase,
      gameOver: command.phase === "ended" ? state.gameOver : null,
    });
  }
  if (command.type === "debugSetTurn") {
    const unitId =
      command.unitId === undefined
        ? (Object.values(state.units).find(
            (unit) => unit.isAlive && unit.owner === command.player && unit.position,
          )?.id ?? null)
        : command.unitId;
    if (unitId && !state.units[unitId]) return reject(state, "Unit not found");
    return accept({
      ...state,
      currentPlayer: command.player,
      activeUnitId: unitId ?? null,
    });
  }
  if (command.type === "debugSetMarkedTarget") {
    const source = state.units[command.sourceUnitId];
    const target = state.units[command.targetUnitId];
    if (!source || !target) return reject(state, "Unit not found");
    const marked = new Set(source.chikatiloMarkedTargets ?? []);
    if (command.value) marked.add(target.id);
    else marked.delete(target.id);
    return accept({
      ...state,
      units: {
        ...state.units,
        [source.id]: {
          ...source,
          chikatiloMarkedTargets: [...marked],
        },
      },
    });
  }
  if (command.type === "debugResetActions") {
    const units = { ...state.units };
    const ids = command.unitId ? [command.unitId] : Object.keys(units);
    for (const id of ids) {
      if (!units[id]) return reject(state, "Unit not found");
      units[id] = resetActions(units[id]);
    }
    return accept({ ...state, units });
  }
  if (command.type === "debugClearPendingRoll") {
    return accept({
      ...state,
      pendingRoll: null,
      pendingMove: null,
      pendingCombatQueue: [],
      pendingAoE: null,
    });
  }
  if (command.type === "debugSetRuleDeclaration") {
    const chooserPlayer = command.chooserPlayer ?? state.currentPlayer ?? "P1";
    const otherPlayer = chooserPlayer === "P1" ? "P2" : "P1";
    return accept({
      ...state,
      ruleDeclaration: {
        selectedRuleId: command.ruleId,
        chooserPlayer,
        setupComplete: true,
        ruleData: {
          court:
            command.ruleId === "court"
              ? {
                  attackerPlayer: chooserPlayer,
                  defenderPlayer: otherPlayer,
                }
              : undefined,
          chessParty:
            command.ruleId === "chess_party"
              ? {
                  kings: { P1: null, P2: null },
                }
              : undefined,
          moonGame: command.ruleId === "moon_game" ? {} : undefined,
          advantageGame:
            command.ruleId === "advantage_game"
              ? {
                  threshold: Math.max(3, Math.trunc(command.threshold ?? 3)),
                }
              : undefined,
        },
      },
    });
  }
  if (command.type === "debugAddMarker") {
    if (!isInsideBoard(command.marker.coord, state.boardSize)) {
      return reject(state, "Coordinate is outside the board");
    }
    if (command.marker.kind === "stake") {
      const id = `debug-stake-${state.stakeCounter + 1}`;
      return accept({
        ...state,
        stakeCounter: state.stakeCounter + 1,
        stakeMarkers: [
          ...state.stakeMarkers,
          {
            id,
            owner: command.marker.owner,
            position: { ...command.marker.coord },
            createdAt: state.turnNumber,
            isRevealed: command.marker.revealed ?? true,
          },
        ],
      });
    }
    const marker = {
      owner: command.marker.owner,
      position: { ...command.marker.coord },
    };
    return accept({
      ...state,
      forestMarkers: [...state.forestMarkers, marker],
      forestMarker: state.forestMarker ?? marker,
    });
  }
  if (command.type === "debugRemoveMarker") {
    if (command.kind === "stake") {
      const next = state.stakeMarkers.filter((marker) => {
        if (command.markerId) return marker.id !== command.markerId;
        return !(
          command.coord &&
          marker.position.col === command.coord.col &&
          marker.position.row === command.coord.row
        );
      });
      return accept({ ...state, stakeMarkers: next });
    }
    const next = state.forestMarkers.filter(
      (marker) =>
        !(
          command.coord &&
          marker.position.col === command.coord.col &&
          marker.position.row === command.coord.row
        ),
    );
    return accept({
      ...state,
      forestMarkers: next,
      forestMarker: next[0] ?? null,
    });
  }
  if (command.type === "debugSpawnUnit") {
    if (!isInsideBoard(command.coord, state.boardSize)) {
      return reject(state, "Coordinate is outside the board");
    }
    if (occupied(state, command.coord)) return reject(state, "Cell is occupied");
    let unit = createDebugUnit(state, command.heroId, command.owner, command.coord);
    if (!unit) return reject(state, "Unknown hero");
    if (command.options?.hp !== undefined) {
      unit = { ...unit, hp: Math.max(0, Math.trunc(command.options.hp)) };
    }
    if (command.options?.stealthed) {
      unit = setUnitStatus(unit, "isStealthed", true);
    }
    if (command.options?.charges) {
      unit = setAllCharges(unit, command.options.charges === "full" ? "fill" : "clear");
    }
    let spawnedState = updateTurnQueue({
      ...state,
      units: { ...state.units, [unit.id]: unit },
      knowledge: {
        P1: { ...state.knowledge.P1, [unit.id]: true },
        P2: { ...state.knowledge.P2, [unit.id]: true },
      },
    });
    if (command.options?.transformed) {
      spawnedState = applyDebugStateCommand(spawnedState, {
        type: "debugSetStatus",
        unitId: unit.id,
        status: "transformed",
        value: true,
      }).state;
    }
    return accept(spawnedState);
  }

  const unit = state.units[command.unitId];
  if (!unit) return reject(state, "Unit not found");

  if (command.type === "debugRemoveUnit") {
    const units = { ...state.units };
    delete units[unit.id];
    return accept(updateTurnQueue({ ...state, units }));
  }
  if (command.type === "debugMoveUnit") {
    if (!isInsideBoard(command.to, state.boardSize)) {
      return reject(state, "Coordinate is outside the board");
    }
    if (occupied(state, command.to, unit.id)) return reject(state, "Cell is occupied");
    return accept({
      ...state,
      units: {
        ...state.units,
        [unit.id]: { ...unit, position: { ...command.to } },
      },
    });
  }
  if (command.type === "debugSetHp") {
    const hp = Math.max(0, Math.trunc(command.hp));
    return accept({
      ...state,
      units: {
        ...state.units,
        [unit.id]: { ...unit, hp, isAlive: hp > 0 },
      },
    });
  }
  if (command.type === "debugDirectDamage") {
    const hp = Math.max(0, unit.hp - Math.max(0, Math.trunc(command.amount)));
    return accept({
      ...state,
      units: {
        ...state.units,
        [unit.id]: { ...unit, hp, isAlive: hp > 0 },
      },
    });
  }
  if (command.type === "debugSetOwner") {
    return accept({
      ...state,
      units: {
        ...state.units,
        [unit.id]: { ...unit, owner: command.owner },
      },
    });
  }
  if (command.type === "debugSetStatus") {
    if (command.status === "transformed" && !command.value && unit.transformed) {
      return reject(state, "Use a preset or respawn the unit to revert a transformation");
    }
    if (command.status === "transformed" && command.value) {
      if (unit.heroId === HERO_GRAND_KAISER_ID) {
        return accept(applyKaiserEngineeringMiracle(state, unit).state);
      }
      if (unit.heroId === HERO_GRIFFITH_ID) {
        const transformed = applyGriffithFemtoRebirth(unit, unit.position);
        if (!transformed.transformed) {
          return reject(state, "Transformation requires a placed Griffith");
        }
        return accept({
          ...state,
          units: { ...state.units, [unit.id]: transformed.unit },
        });
      }
    }
    return accept({
      ...state,
      units: {
        ...state.units,
        [unit.id]: setUnitStatus(unit, command.status, command.value),
      },
    });
  }
  if (command.type === "debugSetCharges") {
    let updated = unit;
    if (command.mode === "fill" || command.mode === "clear") {
      updated = setAllCharges(unit, command.mode);
    } else {
      if (!command.abilityId) return reject(state, "abilityId is required");
      const current = unit.charges[command.abilityId] ?? 0;
      const next =
        command.mode === "add"
          ? current + Math.trunc(command.value ?? 0)
          : Math.trunc(command.value ?? 0);
      updated = setCharges(unit, command.abilityId, next);
    }
    return accept({
      ...state,
      units: { ...state.units, [unit.id]: updated },
    });
  }

  return reject(state, "Unsupported debug command");
}

export function cloneDebugState(state: GameState): GameState {
  return cloneState(state);
}
