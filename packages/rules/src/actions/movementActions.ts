import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  MoveMode,
  PendingMove,
  UnitState,
} from "../model";
import type { RNG } from "../rng";
import { coordsEqual, getUnitAt } from "../board";
import { getLegalMovesForUnitModes } from "../movement";
import { linePath } from "../path";
import { canSpendSlots, spendSlots } from "../turnEconomy";
import { unitCanSeeStealthed } from "../visibility";
import { findStakeStopOnPath, applyStakeTriggerIfAny } from "./utils/stakeUtils";
import { getMovementModes, unitHasMovementMode } from "./shared";
import { getPolkovodetsSource } from "./heroes/vlad";
import { makeAttackContext } from "./utils/combatCtx";
import { requestRoll } from "./utils/rollUtils";
import {
  evMoveOptionsGenerated,
  evStealthRevealed,
  evUnitMoved,
} from "./utils/events";

export function collectRiderPathTargets(
  state: GameState,
  rider: UnitState,
  from: Coord,
  to: Coord
): string[] {
  const targets: string[] = [];

  const dx = to.col - from.col;
  const dy = to.row - from.row;

  // Нас интересует только чисто ортогональное движение (как ладья).
  const isOrthogonal =
    (dx === 0 && dy !== 0) || (dy === 0 && dx !== 0);
  if (!isOrthogonal) {
    return targets;
  }

  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  // Идём от клетки после старта до клетки назначения включительно
  for (let i = 1; i <= steps; i++) {
    const cell: Coord = {
      col: from.col + stepCol * i,
      row: from.row + stepRow * i,
    };

    const u = getUnitAt(state, cell);
    if (!u || !u.isAlive) continue;

    // Союзников не бьём "по пути"
    if (u.owner === rider.owner) continue;

    // Path attacks hit enemies passed on the path regardless of stealthed state
    targets.push(u.id);
  }

  return targets;
}

export function getRiderPathCells(from: Coord, to: Coord): Coord[] {
  const dx = to.col - from.col;
  const dy = to.row - from.row;

  const isOrthogonal =
    (dx === 0 && dy !== 0) || (dy === 0 && dx !== 0);
  if (!isOrthogonal) {
    return [];
  }

  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));

  const path: Coord[] = [];
  for (let i = 1; i <= steps; i++) {
    path.push({
      col: from.col + stepCol * i,
      row: from.row + stepRow * i,
    });
  }

  return path;
}

export function applyRequestMoveOptions(
  state: GameState,
  action: Extract<GameAction, { type: "requestMoveOptions" }>,
  rng: RNG
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

  if (!canSpendSlots(unit, { move: true })) {
    return { state, events: [] };
  }

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

  const chosenMode =
    requestedMode && requestedMode !== "normal"
      ? requestedMode
      : unit.class;
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

export function applyMove(
  state: GameState,
  action: Extract<GameAction, { type: "move" }>,
  rng: RNG
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

  // начальная позиция — пригодится для спец-правила наездника
  const from = unit.position;

  // 🚫 уже тратил слот перемещения
  if (!canSpendSlots(unit, { move: true })) {
    return { state, events: [] };
  }

  let legalMoves: Coord[] = [];
  const pending = state.pendingMove;
  const pendingValid =
    pending &&
    pending.unitId === unit.id &&
    pending.expiresTurnNumber === state.turnNumber;
  const movementModes = getMovementModes(unit);
  const requiresPendingMove =
    movementModes.length > 1 ||
    unitHasMovementMode(unit, "trickster") ||
    unitHasMovementMode(unit, "berserker");
  if (requiresPendingMove && !pendingValid) {
    return { state, events: [] };
  }

  if (pendingValid) {
    legalMoves = pending!.legalTo;
  } else {
    const normalModes = getMovementModes(unit).filter(
      (mode) => mode !== "trickster" && mode !== "berserker"
    );
    if (normalModes.length === 0) {
      return { state, events: [] };
    }
    legalMoves = getLegalMovesForUnitModes(state, unit.id, normalModes);
  }

  const isLegal = legalMoves.some((c) => coordsEqual(c, action.to));
  if (!isLegal) {
    return { state, events: [] };
  }

  const moveMode =
    pendingValid && pending?.mode ? pending.mode : ("normal" as MoveMode);
  const riderMode =
    moveMode === "rider" ||
    (moveMode === "normal" && unit.class === "rider");

  const line = moveMode === "trickster" ? null : linePath(from, action.to);
  const stakePath = line ? line.slice(1) : [action.to];
  const stakeStop = findStakeStopOnPath(state, unit, stakePath);
  const finalTo = stakeStop ?? action.to;

  const hiddenAtDest = getUnitAt(state, finalTo);
  if (
    hiddenAtDest &&
    hiddenAtDest.isAlive &&
    hiddenAtDest.owner !== unit.owner &&
    hiddenAtDest.isStealthed
  ) {
    const known = state.knowledge?.[unit.owner]?.[hiddenAtDest.id];
    const canSee = unitCanSeeStealthed(state, unit);
    if (!known && !canSee) {
      const revealed: UnitState = {
        ...hiddenAtDest,
        isStealthed: false,
        stealthTurnsLeft: 0,
      };
      const movedUnit: UnitState = spendSlots(unit, { move: true });
      const updatedLastKnown = {
        ...state.lastKnownPositions,
        P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
        P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
      };
      delete updatedLastKnown.P1[revealed.id];
      delete updatedLastKnown.P2[revealed.id];
      const newState: GameState = {
        ...state,
        units: {
          ...state.units,
          [revealed.id]: revealed,
          [movedUnit.id]: movedUnit,
        },
        knowledge: {
          ...state.knowledge,
          [unit.owner]: {
            ...(state.knowledge?.[unit.owner] ?? {}),
            [revealed.id]: true,
          },
        },
        lastKnownPositions: updatedLastKnown,
        pendingMove: pendingValid ? null : state.pendingMove,
      };
      const events: GameEvent[] = [
        evStealthRevealed({ unitId: revealed.id, reason: "steppedOnHidden" }),
      ];
      return { state: newState, events };
    }
  }

  const movedUnit: UnitState = spendSlots(unit, { move: true });
  let updatedUnit: UnitState = {
    ...movedUnit,
    position: { ...finalTo },
  };

  let newState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
    pendingMove:
      pendingValid && pending?.unitId === updatedUnit.id ? null : state.pendingMove,
  };

  const events: GameEvent[] = [
    evUnitMoved({ unitId: updatedUnit.id, from, to: updatedUnit.position! }),
  ];

  const stakeResult = applyStakeTriggerIfAny(
    newState,
    updatedUnit,
    updatedUnit.position!,
    rng
  );
  if (stakeResult.triggered) {
    newState = stakeResult.state;
    updatedUnit = stakeResult.unit;
    events.push(...stakeResult.events);
  }

  if (!updatedUnit.position) {
    return { state: newState, events };
  }

  // ---- Спец-правило наездника: атакует всех врагов, через которых проехал ----
  // ---- Reveal by adjacency: ending move next to hidden enemies reveals them to mover ----
  // Обходим юнитов и раскрываем те, кто в радиусе 1 (Chebyshev) от конечной позиции
  const moverOwner = updatedUnit.owner;
  const moverPos = updatedUnit.position!;
  for (const other of Object.values(newState.units)) {
    if (!other.isAlive || !other.position) continue;
    if (other.owner === moverOwner) continue;
    if (!other.isStealthed) continue;

    const dx = Math.abs(other.position.col - moverPos.col);
    const dy = Math.abs(other.position.row - moverPos.row);
    const dist = Math.max(dx, dy);
    if (dist <= 1) {
      const revealed: UnitState = {
        ...other,
        isStealthed: false,
        stealthTurnsLeft: 0,
      };
      const updatedLastKnown = {
        ...newState.lastKnownPositions,
        P1: { ...(newState.lastKnownPositions?.P1 ?? {}) },
        P2: { ...(newState.lastKnownPositions?.P2 ?? {}) },
      };
      delete updatedLastKnown.P1[revealed.id];
      delete updatedLastKnown.P2[revealed.id];

      newState = {
        ...newState,
        units: {
          ...newState.units,
          [revealed.id]: revealed,
        },
        knowledge: {
          ...newState.knowledge,
          [moverOwner]: {
            ...(newState.knowledge?.[moverOwner] ?? {}),
            [revealed.id]: true,
          },
        },
        lastKnownPositions: updatedLastKnown,
      };

      events.push(
        evStealthRevealed({ unitId: revealed.id, reason: "adjacency" })
      );
    }
  }

  // ---- Rider path attacks: enqueue pending sequential rolls ----
  if (riderMode && from) {
    const auraSource =
      getPolkovodetsSource(state, unit.id, from) ??
      getPolkovodetsSource(state, unit.id, finalTo);
    const damageBonus = auraSource ? 1 : 0;
    const targetIds = collectRiderPathTargets(state, unit, from, finalTo);
    if (targetIds.length > 0) {
      const queue = targetIds.map((defenderId) => ({
        attackerId: unit.id,
        defenderId,
        ignoreRange: true,
        ignoreStealth: true,
        damageBonus: damageBonus > 0 ? damageBonus : undefined,
        damageBonusSourceId: auraSource ?? undefined,
        kind: "riderPath" as const,
      }));

      const queuedState: GameState = {
        ...newState,
        pendingCombatQueue: queue,
      };

      const ctx = makeAttackContext({
        attackerId: unit.id,
        defenderId: queue[0].defenderId,
        ignoreRange: true,
        ignoreStealth: true,
        damageBonus: damageBonus > 0 ? damageBonus : undefined,
        damageBonusSourceId: auraSource ?? undefined,
        consumeSlots: false,
        queueKind: "riderPath",
      });

      const requested = requestRoll(
        queuedState,
        unit.owner,
        "riderPathAttack_attackerRoll",
        ctx,
        unit.id
      );

      return {
        state: requested.state,
        events: [...events, ...requested.events],
      };
    }
  }

  return { state: newState, events };
}

