import {
  DebugDiceRNG,
  SeededRNG,
  applyDebugStateCommand,
  applyNormalVictoryCheck,
  cloneDebugState,
  handleRuleDeclarationRoundEnd,
  type DebugStateCommand,
  type GameState,
  type PendingRoundAdvance,
  type TestRoomSnapshot,
  livingRealUnits,
} from "rules";
import { accepted, rejected, type CommandResult } from "../commandResult";
import {
  getMaxLogEvents,
  applyGameAction,
  touchGameRoom,
  type GameRoom,
} from "../store";
import type { TestRoomCommand } from "./schemas";

export const MAX_TEST_SNAPSHOT_BYTES = 48 * 1024;

export interface TestCommandResult {
  command: CommandResult;
  snapshot?: TestRoomSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isImportableState(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  if (
    value.boardSize !== 9 ||
    !["lobby", "placement", "battle", "ended"].includes(String(value.phase)) ||
    !isRecord(value.units) ||
    !isRecord(value.playersReady) ||
    !isRecord(value.seats) ||
    !Array.isArray(value.turnOrder) ||
    !Array.isArray(value.turnQueue) ||
    !Array.isArray(value.stakeMarkers) ||
    !Array.isArray(value.forestMarkers)
  ) {
    return false;
  }
  const units = Object.values(value.units);
  if (units.length > 100) return false;
  for (const unit of units) {
    if (
      !isRecord(unit) ||
      typeof unit.id !== "string" ||
      !["P1", "P2"].includes(String(unit.owner)) ||
      typeof unit.hp !== "number" ||
      typeof unit.isAlive !== "boolean" ||
      !isRecord(unit.turn) ||
      !isRecord(unit.charges) ||
      !isRecord(unit.cooldowns)
    ) {
      return false;
    }
    const position = unit.position;
    if (
      position !== null &&
      (!isRecord(position) ||
        !Number.isInteger(position.col) ||
        !Number.isInteger(position.row) ||
        Number(position.col) < 0 ||
        Number(position.col) >= 9 ||
        Number(position.row) < 0 ||
        Number(position.row) >= 9)
    ) {
      return false;
    }
  }
  return true;
}

function parseSnapshot(value: unknown): TestRoomSnapshot | null {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return null;
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_TEST_SNAPSHOT_BYTES) {
    return null;
  }
  if (!isRecord(value)) return null;
  if (
    value.version !== 1 ||
    value.roomMode !== "test" ||
    typeof value.seed !== "number" ||
    typeof value.revision !== "number" ||
    !Array.isArray(value.diceQueue) ||
    !value.diceQueue.every(
      (item) => Number.isInteger(item) && Number(item) >= 1 && Number(item) <= 6
    ) ||
    !isImportableState(value.state)
  ) {
    return null;
  }
  return value as unknown as TestRoomSnapshot;
}

function recordMutation(room: GameRoom, command: TestRoomCommand) {
  const loggedCommand =
    command.type === "debugImportSnapshot"
      ? ({ type: command.type } as const)
      : command;
  touchGameRoom(room);
  room.revision += 1;
  if (room.state.gameOver?.endedAtRevision === 0) {
    room.state = {
      ...room.state,
      gameOver: { ...room.state.gameOver, endedAtRevision: room.revision },
    };
  }
  room.actionLog.push({
    at: Date.now(),
    playerId: room.hostSeat,
    action: loggedCommand,
    events: [],
    revision: room.revision,
  });
  const maxLogEvents = getMaxLogEvents();
  if (room.actionLog.length > maxLogEvents) {
    room.actionLog.splice(0, room.actionLog.length - maxLogEvents);
  }
}

function recordMutationWithEvents(
  room: GameRoom,
  command: TestRoomCommand,
  events: unknown[]
) {
  recordMutation(room, command);
  const entry = room.actionLog[room.actionLog.length - 1];
  if (entry) {
    entry.events = events as never[];
  }
}

function buildDebugRoundAdvance(state: GameState): PendingRoundAdvance | null {
  const queue = (state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder).filter(
    (unitId) => {
      const unit = state.units[unitId];
      return !!unit?.isAlive && !!unit.position;
    }
  );
  const nextUnitId =
    queue[0] ??
    Object.values(state.units).find((unit) => unit.isAlive && unit.position)?.id ??
    null;
  if (!nextUnitId) return null;
  const unit = state.units[nextUnitId];
  if (!unit) return null;
  return {
    nextRoundNumber: state.roundNumber + 1,
    nextTurnNumber: state.turnNumber + 1,
    nextIndex: Math.max(0, queue.indexOf(nextUnitId)),
    nextUnitId,
    nextPlayer: unit.owner,
  };
}

export function createTestRoomSnapshot(room: GameRoom): TestRoomSnapshot {
  return {
    version: 1,
    roomMode: "test",
    exportedAt: new Date().toISOString(),
    seed: room.seed,
    revision: room.revision,
    diceQueue: room.testDiceRng?.getQueue() ?? [],
    state: cloneDebugState(room.state),
  };
}

export function applyTestRoomCommand(
  room: GameRoom,
  command: TestRoomCommand
): TestCommandResult {
  if (room.roomMode !== "test" || !room.testDiceRng) {
    return {
      command: rejected("FORBIDDEN", "Test commands require a test room"),
    };
  }

  if (command.type === "debugExportSnapshot") {
    return {
      command: accepted({ stateChanged: false, events: [] }),
      snapshot: createTestRoomSnapshot(room),
    };
  }

  if (command.type === "debugSetDiceQueue") {
    room.testDiceRng.setQueue(command.values);
    recordMutation(room, command);
    return {
      command: accepted({
        stateChanged: true,
        events: [],
        revision: room.revision,
        logIndex: room.actionLog.length - 1,
      }),
    };
  }

  if (command.type === "debugClearDiceQueue") {
    room.testDiceRng.clearQueue();
    recordMutation(room, command);
    return {
      command: accepted({
        stateChanged: true,
        events: [],
        revision: room.revision,
        logIndex: room.actionLog.length - 1,
      }),
    };
  }

  if (command.type === "debugSimulateStartTurn") {
    const unit = room.state.units[command.unitId];
    if (!unit || !unit.isAlive || !unit.position) {
      return {
        command: rejected("DEBUG_REJECTED", "Unit must be alive and placed"),
      };
    }
    const queue = room.state.turnQueue.includes(unit.id)
      ? [...room.state.turnQueue]
      : [unit.id, ...room.state.turnQueue.filter((id) => id !== unit.id)];
    room.state = {
      ...room.state,
      phase: "battle",
      currentPlayer: unit.owner,
      activeUnitId: null,
      pendingRoll: null,
      turnQueue: queue,
      turnOrder: queue,
      turnQueueIndex: queue.indexOf(unit.id),
      turnOrderIndex: queue.indexOf(unit.id),
    };
    return {
      command: applyGameAction(
        room,
        { type: "unitStartTurn", unitId: unit.id },
        unit.owner
      ),
    };
  }

  if (command.type === "debugTriggerRuleRoundEnd") {
    const advance = buildDebugRoundAdvance(room.state);
    if (!advance) {
      return {
        command: rejected("DEBUG_REJECTED", "At least one living placed unit is required"),
      };
    }
    if (command.rolls && command.rolls.length > 0) {
      room.testDiceRng.setQueue(command.rolls);
    }
    const result = handleRuleDeclarationRoundEnd(
      room.state,
      advance,
      room.testDiceRng
    );
    room.state = result.state;
    recordMutationWithEvents(room, command, result.events);
    return {
      command: accepted({
        stateChanged: true,
        events: result.events,
        revision: room.revision,
        logIndex: room.actionLog.length - 1,
      }),
    };
  }

  if (command.type === "debugImportSnapshot") {
    const snapshot = parseSnapshot(command.snapshot);
    if (!snapshot) {
      return {
        command: rejected(
          "INVALID_SNAPSHOT",
          `Snapshot is invalid or exceeds ${MAX_TEST_SNAPSHOT_BYTES} bytes`
        ),
      };
    }
    room.seed = snapshot.seed;
    room.state = {
      ...cloneDebugState(snapshot.state),
      seats: { ...room.state.seats },
      hostPlayerId: room.hostSeat,
    };
    room.testDiceRng = new DebugDiceRNG(
      new SeededRNG(snapshot.seed),
      snapshot.diceQueue
    );
    room.rng = room.testDiceRng;
    recordMutation(room, command);
    return {
      command: accepted({
        stateChanged: true,
        events: [],
        revision: room.revision,
        logIndex: room.actionLog.length - 1,
      }),
    };
  }

  const hadBothArmies =
    livingRealUnits(room.state, "P1").length > 0 &&
    livingRealUnits(room.state, "P2").length > 0;
  const result = applyDebugStateCommand(
    room.state,
    command as DebugStateCommand
  );
  if (!result.changed) {
    return {
      command: rejected("DEBUG_REJECTED", result.error ?? "Debug command rejected"),
    };
  }
  let nextState = result.state;
  let events: never[] = [];
  if (
    hadBothArmies &&
    (command.type === "debugSetHp" ||
      command.type === "debugDirectDamage" ||
      command.type === "debugRemoveUnit")
  ) {
    const victory = applyNormalVictoryCheck(nextState, []);
    nextState = victory.state;
    events = victory.events as never[];
  }
  room.state = nextState;
  recordMutationWithEvents(room, command, events);
  return {
    command: accepted({
      stateChanged: true,
      events,
      revision: room.revision,
      logIndex: room.actionLog.length - 1,
    }),
  };
}
