import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  MoveMode,
  PendingMove,
} from "../../model";
import type { RNG } from "../../rng";
import { canSpendSlots } from "../../turnEconomy";
import { getLegalMovesForUnitModes } from "../../movement";
import { getMovementModes } from "../shared";
import { requestRoll } from "../../core";
import { evMoveOptionsGenerated } from "../../core";

export function applyRequestMoveOptions(
  state: GameState,
  action: Extract<GameAction, { type: "requestMoveOptions" }>,
  _rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state, events: [] };
  }

  if ((unit.kaladinMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }
  if ((unit.lokiMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }

  const canMove = canSpendSlots(unit, { move: true });
  if (
    !canMove &&
    !unit.genghisKhanDecreeMovePending &&
    !unit.genghisKhanMongolChargeActive
  ) {
    return { state, events: [] };
  }
  const isChicken = (unit.lokiChickenSources?.length ?? 0) > 0;

  const existing = state.pendingMove;
  if (
    existing &&
    existing.unitId === unit.id &&
    existing.expiresTurnNumber === state.turnNumber
  ) {
    if (!action.mode || existing.mode === action.mode) {
      return {
        state,
        events: [
          evMoveOptionsGenerated({
            unitId: unit.id,
            roll: existing.roll,
            legalTo: existing.legalTo,
            mode: existing.mode,
          }),
        ],
      };
    }
  }

  if (isChicken) {
    const legalMoves = getLegalMovesForUnitModes(state, unit.id, [unit.class]);
    const pendingMove: PendingMove = {
      unitId: unit.id,
      roll: undefined,
      legalTo: legalMoves,
      expiresTurnNumber: state.turnNumber,
      mode: "normal",
    };
    const nextState: GameState = {
      ...state,
      pendingMove,
    };
    return {
      state: nextState,
      events: [
        evMoveOptionsGenerated({
          unitId: unit.id,
          roll: undefined,
          legalTo: legalMoves,
          mode: "normal",
        }),
      ],
    };
  }

  const movementModes = getMovementModes(unit);
  const availableModes: MoveMode[] =
    movementModes.length > 1
      ? ([
          "normal",
          ...movementModes.filter((mode) => mode !== unit.class),
        ] as MoveMode[])
      : ["normal"];
  const requestedMode = action.mode;

  if (!requestedMode && movementModes.length > 1) {
    return {
      state,
      events: [
        evMoveOptionsGenerated({
          unitId: unit.id,
          roll: undefined,
          legalTo: [],
          modes: availableModes,
        }),
      ],
    };
  }

  const fallbackMode =
    movementModes.length > 0
      ? movementModes.includes(unit.class)
        ? unit.class
        : movementModes[0]
      : unit.class;
  const chosenMode =
    requestedMode && requestedMode !== "normal" ? requestedMode : fallbackMode;
  if (!movementModes.includes(chosenMode)) {
    return { state, events: [] };
  }

  if (chosenMode === "trickster") {
    return requestRoll(
      state,
      unit.owner,
      "moveTrickster",
      { unitId: unit.id, mode: requestedMode ?? "normal" },
      unit.id
    );
  }
  if (chosenMode === "berserker") {
    return requestRoll(
      state,
      unit.owner,
      "moveBerserker",
      { unitId: unit.id, mode: requestedMode ?? "normal" },
      unit.id
    );
  }

  const legalMoves = getLegalMovesForUnitModes(state, unit.id, [chosenMode]);
  const modeValue = requestedMode ?? "normal";

  const pendingMove: PendingMove = {
    unitId: unit.id,
    roll: undefined,
    legalTo: legalMoves,
    expiresTurnNumber: state.turnNumber,
    mode: modeValue,
  };

  const newState: GameState = {
    ...state,
    pendingMove,
  };

  const events: GameEvent[] = [
    evMoveOptionsGenerated({
      unitId: unit.id,
      roll: undefined,
      legalTo: legalMoves,
      mode: modeValue,
    }),
  ];

  return { state: newState, events };
}
