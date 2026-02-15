import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  MoveMode,
  PendingMove,
  ResolveRollChoice,
  UnitState,
} from "../model";
import { isInsideBoard } from "../model";
import { type RNG } from "../rng";
import { coordsEqual, getUnitAt } from "../board";
import { getLegalAttackTargets } from "../legal";
import { getLegalMovesForUnitModes } from "../movement";
import { linePath } from "../path";
import { canSpendSlots, spendSlots } from "../turnEconomy";
import { canUnitEnterCell, unitCanSeeStealthed } from "../visibility";
import { isInsideForestAura } from "../forest";
import { findStakeStopOnPath, applyStakeTriggerIfAny } from "../shared/stakeUtils";
import { getMovementModes, unitHasMovementMode } from "./shared";
import { getPolkovodetsSource } from "./heroes/vlad";
import { HERO_LECHY_ID } from "../heroes";
import { requestLechyGuideTravelerPlacement } from "./heroes/lechy";
import { makeAttackContext } from "../shared/combatCtx";
import { requestRoll } from "../shared/rollUtils";
import {
  evMoveOptionsGenerated,
  evStealthRevealed,
  evUnitMoved,
} from "../shared/events";

type MoveActionInternal = Extract<GameAction, { type: "move" }> & {
  __forestBypass?: true;
};

type ForestRestrictionKind = "exit" | "cross";

interface ForestRestrictionContext {
  kind: ForestRestrictionKind;
  fallbackOptions: Coord[];
}

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

function getMongolChargeCorridor(path: Coord[], boardSize: number): Coord[] {
  if (path.length === 0) return [];
  const start = path[0];
  const end = path[path.length - 1];
  const stepCol = Math.sign(end.col - start.col);
  const stepRow = Math.sign(end.row - start.row);

  let offsets: Coord[] = [];
  if (stepCol === 0 && stepRow !== 0) {
    offsets = [
      { col: -1, row: 0 },
      { col: 1, row: 0 },
    ];
  } else if (stepRow === 0 && stepCol !== 0) {
    offsets = [
      { col: 0, row: -1 },
      { col: 0, row: 1 },
    ];
  } else if (Math.abs(stepCol) === 1 && Math.abs(stepRow) === 1) {
    offsets = [
      { col: stepCol, row: 0 },
      { col: 0, row: stepRow },
    ];
  }

  const seen = new Set<string>();
  const corridor: Coord[] = [];
  const pushCell = (cell: Coord) => {
    if (!isInsideBoard(cell, boardSize)) return;
    const key = `${cell.col},${cell.row}`;
    if (seen.has(key)) return;
    seen.add(key);
    corridor.push(cell);
  };

  for (const cell of path) {
    pushCell(cell);
    for (const offset of offsets) {
      pushCell({ col: cell.col + offset.col, row: cell.row + offset.row });
    }
  }

  return corridor;
}

function sortUnitIdsByReadingOrder(state: GameState, unitIds: string[]): string[] {
  return [...unitIds].sort((a, b) => {
    const aUnit = state.units[a];
    const bUnit = state.units[b];
    const aPos = aUnit?.position;
    const bPos = bUnit?.position;
    if (!aPos || !bPos) {
      return a.localeCompare(b);
    }
    if (aPos.row !== bPos.row) return aPos.row - bPos.row;
    if (aPos.col !== bPos.col) return aPos.col - bPos.col;
    return a.localeCompare(b);
  });
}

function buildForestPath(
  from: Coord,
  to: Coord,
  line: Coord[] | null
): Coord[] {
  if (line && line.length > 0) {
    return line;
  }
  return [from, to];
}

function uniqueCoords(coords: Coord[]): Coord[] {
  const seen = new Set<string>();
  const unique: Coord[] = [];
  for (const coord of coords) {
    const key = `${coord.col},${coord.row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...coord });
  }
  return unique;
}

function buildForestFallbackOptions(
  state: GameState,
  unit: UnitState,
  from: Coord,
  path: Coord[],
  legalMoves: Coord[],
  kind: ForestRestrictionKind
): Coord[] {
  if (kind === "exit") {
    const options: Coord[] = legalMoves.filter((coord) =>
      isInsideForestAura(state, coord)
    );
    if (isInsideForestAura(state, from)) {
      options.push(from);
    }
    return uniqueCoords(options).filter(
      (coord) => coordsEqual(coord, from) || canUnitEnterCell(state, unit.id, coord)
    );
  }

  const legalSet = new Set(legalMoves.map((coord) => `${coord.col},${coord.row}`));
  const options: Coord[] = [];
  for (const cell of path) {
    if (coordsEqual(cell, from)) continue;
    if (!isInsideForestAura(state, cell)) continue;
    if (!legalSet.has(`${cell.col},${cell.row}`)) continue;
    if (!canUnitEnterCell(state, unit.id, cell)) continue;
    options.push(cell);
  }
  return uniqueCoords(options);
}

function getForestRestrictionContext(
  state: GameState,
  unit: UnitState,
  from: Coord,
  to: Coord,
  line: Coord[] | null,
  legalMoves: Coord[]
): ForestRestrictionContext | null {
  const path = buildForestPath(from, to, line);
  const insideFrom = isInsideForestAura(state, from);
  const insideTo = isInsideForestAura(state, to);
  const pathTouchesAura = path.some((cell) => isInsideForestAura(state, cell));

  if (insideFrom && !insideTo) {
    return {
      kind: "exit",
      fallbackOptions: buildForestFallbackOptions(
        state,
        unit,
        from,
        path,
        legalMoves,
        "exit"
      ),
    };
  }

  if (!insideFrom && !insideTo && pathTouchesAura) {
    return {
      kind: "cross",
      fallbackOptions: buildForestFallbackOptions(
        state,
        unit,
        from,
        path,
        legalMoves,
        "cross"
      ),
    };
  }

  return null;
}

function maybeRequestForestMoveCheck(
  state: GameState,
  unit: UnitState,
  from: Coord,
  to: Coord,
  line: Coord[] | null,
  legalMoves: Coord[]
): ApplyResult | null {
  const restriction = getForestRestrictionContext(
    state,
    unit,
    from,
    to,
    line,
    legalMoves
  );
  if (!restriction) {
    return null;
  }

  return requestRoll(
    state,
    unit.owner,
    "forestMoveCheck",
    {
      unitId: unit.id,
      to: { ...to },
      restriction: restriction.kind,
      fallbackOptions: restriction.fallbackOptions.map((coord) => ({ ...coord })),
    },
    unit.id
  );
}

function parseCoordList(raw: unknown): Coord[] {
  if (!Array.isArray(raw)) return [];
  const coords: Coord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const colRaw = (item as { col?: unknown }).col;
    const rowRaw = (item as { row?: unknown }).row;
    if (typeof colRaw !== "number" || typeof rowRaw !== "number") continue;
    coords.push({ col: colRaw, row: rowRaw });
  }
  return uniqueCoords(coords);
}

function parseCoord(raw: unknown): Coord | null {
  if (!raw || typeof raw !== "object") return null;
  const colRaw = (raw as { col?: unknown }).col;
  const rowRaw = (raw as { row?: unknown }).row;
  if (typeof colRaw !== "number" || typeof rowRaw !== "number") return null;
  return { col: colRaw, row: rowRaw };
}

export function resolveForestMoveCheckRoll(
  state: GameState,
  pending: { player: UnitState["owner"]; context: Record<string, unknown> },
  rng: RNG
): ApplyResult {
  const unitId = pending.context.unitId as string | undefined;
  const target = parseCoord(pending.context.to);
  if (!unitId || !target) {
    return { state: { ...state, pendingRoll: null }, events: [] };
  }

  const roll = 1 + Math.floor(rng.next() * 6);
  if (roll >= 5) {
    return applyMove(
      { ...state, pendingRoll: null },
      {
        type: "move",
        unitId,
        to: target,
        __forestBypass: true,
      } as MoveActionInternal,
      rng
    );
  }

  const fallbackOptions = parseCoordList(pending.context.fallbackOptions);
  if (fallbackOptions.length === 0) {
    return { state: { ...state, pendingRoll: null }, events: [] };
  }
  const requested = requestRoll(
    { ...state, pendingRoll: null },
    pending.player,
    "forestMoveDestination",
    {
      unitId,
      options: fallbackOptions,
      originalTo: target,
    },
    unitId
  );

  return requested;
}

export function resolveForestMoveDestinationChoice(
  state: GameState,
  pending: { context: Record<string, unknown> },
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  const unitId = pending.context.unitId as string | undefined;
  if (!unitId) {
    return { state: { ...state, pendingRoll: null }, events: [] };
  }

  const payload =
    choice && typeof choice === "object" && choice.type === "forestMoveDestination"
      ? choice
      : undefined;
  if (!payload?.position) {
    return { state, events: [] };
  }

  const options = parseCoordList(pending.context.options);
  const key = `${payload.position.col},${payload.position.row}`;
  const allowed = options.some((coord) => `${coord.col},${coord.row}` === key);
  if (!allowed) {
    return { state, events: [] };
  }

  return applyMove(
    { ...state, pendingRoll: null },
    {
      type: "move",
      unitId,
      to: { ...payload.position },
      __forestBypass: true,
    } as MoveActionInternal,
    rng
  );
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

  if ((unit.kaladinMoveLockSources?.length ?? 0) > 0) {
    return { state, events: [] };
  }

  const canMove = canSpendSlots(unit, { move: true });
  if (!canMove && !unit.genghisKhanDecreeMovePending && !unit.genghisKhanMongolChargeActive) {
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

function applyMongolChargeMove(
  state: GameState,
  unit: UnitState,
  action: MoveActionInternal,
  rng: RNG
): ApplyResult {
  const from = unit.position;
  if (!from) {
    return { state, events: [] };
  }

  const pending = state.pendingMove;
  const pendingValid =
    pending &&
    pending.unitId === unit.id &&
    pending.expiresTurnNumber === state.turnNumber;
  if (!pendingValid) {
    return { state, events: [] };
  }

  const isLegal = pending!.legalTo.some((c) => coordsEqual(c, action.to));
  if (!isLegal) {
    return { state, events: [] };
  }

  const intendedLine = linePath(from, action.to);
  if (!intendedLine) {
    return { state, events: [] };
  }

  const bypassForestCheck = action.__forestBypass === true;
  if (!bypassForestCheck) {
    const forestCheck = maybeRequestForestMoveCheck(
      state,
      unit,
      from,
      action.to,
      intendedLine,
      pending!.legalTo
    );
    if (forestCheck) {
      return forestCheck;
    }
  }

  const stakePath = intendedLine.slice(1);
  const stakeStop = findStakeStopOnPath(state, unit, stakePath);
  const finalTo = stakeStop ?? action.to;
  const didMove = !coordsEqual(finalTo, from);

  if (!didMove) {
    const updatedUnit: UnitState = {
      ...unit,
      genghisKhanMongolChargeActive: false,
    };
    const newState: GameState = {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
      pendingMove: pendingValid ? null : state.pendingMove,
    };
    return { state: newState, events: [] };
  }

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
      const updatedUnit: UnitState = {
        ...unit,
        genghisKhanMongolChargeActive: false,
      };
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
          [updatedUnit.id]: updatedUnit,
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
        evStealthRevealed({
          unitId: revealed.id,
          reason: "steppedOnHidden",
          revealerId: unit.id,
        }),
      ];
      return { state: newState, events };
    }
  }

  let updatedUnit: UnitState = {
    ...unit,
    position: { ...finalTo },
    genghisKhanMongolChargeActive: false,
  };

  let newState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
    pendingMove: pendingValid ? null : state.pendingMove,
  };

  const events: GameEvent[] = [];
  if (didMove) {
    events.push(
      evUnitMoved({ unitId: updatedUnit.id, from, to: updatedUnit.position! })
    );
  }

  if (didMove) {
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
  }

  if (!updatedUnit.position) {
    return { state: newState, events };
  }

  if (didMove) {
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
          evStealthRevealed({
            unitId: revealed.id,
            reason: "adjacency",
            revealerId: updatedUnit.id,
          })
        );
      }
    }
  }

  const path = linePath(from, updatedUnit.position);
  if (!path) {
    return { state: newState, events };
  }

  const corridor = getMongolChargeCorridor(path, newState.boardSize);
  const corridorSet = new Set(corridor.map((cell) => `${cell.col},${cell.row}`));
  const allies = Object.values(newState.units).filter(
    (other) =>
      other.isAlive &&
      other.position &&
      other.owner === unit.owner &&
      other.id !== unit.id &&
      corridorSet.has(`${other.position.col},${other.position.row}`)
  );

  const orderedAllies = [...allies].sort((a, b) => a.id.localeCompare(b.id));
  const queue = orderedAllies.flatMap((ally) => {
    if (!ally.position) return [];
    if (!canSpendSlots(ally, { attack: true, action: true })) return [];
    const targets = getLegalAttackTargets(newState, ally.id);
    if (targets.length === 0) return [];
    const sortedTargets = sortUnitIdsByReadingOrder(newState, targets);
    const defenderId = sortedTargets[0];
    if (!defenderId) return [];
    return [
      {
        attackerId: ally.id,
        defenderId,
        damageBonusSourceId: unit.id,
        consumeSlots: true,
        kind: "aoe" as const,
      },
    ];
  });

  if (queue.length === 0) {
    return { state: newState, events };
  }

  const queuedState: GameState = {
    ...newState,
    pendingCombatQueue: queue,
  };

  const first = queue[0];
  const ctx = makeAttackContext({
    attackerId: first.attackerId,
    defenderId: first.defenderId,
    damageBonusSourceId: first.damageBonusSourceId,
    consumeSlots: first.consumeSlots ?? false,
    queueKind: "aoe",
  });

  const requested = requestRoll(
    queuedState,
    newState.units[first.attackerId].owner,
    "attack_attackerRoll",
    ctx,
    first.attackerId
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}

export function applyMove(
  state: GameState,
  action: Extract<GameAction, { type: "move" }>,
  rng: RNG
): ApplyResult {
  const moveAction = action as MoveActionInternal;
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[moveAction.unitId];
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

  // начальная позиция — пригодится для спец-правила наездника
  const from = unit.position;
  const isMongolCharge = unit.genghisKhanMongolChargeActive === true;
  const hasDecreeMove = unit.genghisKhanDecreeMovePending === true;

  // 🚫 уже тратил слот перемещения
  if (!canSpendSlots(unit, { move: true }) && !hasDecreeMove && !isMongolCharge) {
    return { state, events: [] };
  }

  let legalMoves: Coord[] = [];
  const pending = state.pendingMove;
  const pendingValid =
    pending &&
    pending.unitId === unit.id &&
    pending.expiresTurnNumber === state.turnNumber;
  if (isMongolCharge && !pendingValid) {
    return { state, events: [] };
  }
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

  const isLegal = legalMoves.some((c) => coordsEqual(c, moveAction.to));
  if (!isLegal) {
    return { state, events: [] };
  }

  if (isMongolCharge) {
    return applyMongolChargeMove(state, unit, moveAction, rng);
  }

  const moveMode =
    pendingValid && pending?.mode ? pending.mode : ("normal" as MoveMode);
  const riderMode =
    moveMode === "rider" ||
    (moveMode === "normal" && unit.class === "rider");

  const intendedLine =
    moveMode === "trickster" ? null : linePath(from, moveAction.to);
  if (moveAction.__forestBypass !== true) {
    const forestCheck = maybeRequestForestMoveCheck(
      state,
      unit,
      from,
      moveAction.to,
      intendedLine,
      legalMoves
    );
    if (forestCheck) {
      return forestCheck;
    }
  }

  const stakePath = intendedLine ? intendedLine.slice(1) : [moveAction.to];
  const stakeStop = findStakeStopOnPath(state, unit, stakePath);
  const finalTo = stakeStop ?? moveAction.to;
  const didMove = !coordsEqual(finalTo, from);

  if (didMove) {
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
        let movedUnit: UnitState = spendSlots(unit, { move: true });
        if (hasDecreeMove) {
          movedUnit = { ...movedUnit, genghisKhanDecreeMovePending: false };
        }
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
          evStealthRevealed({
            unitId: revealed.id,
            reason: "steppedOnHidden",
            revealerId: unit.id,
          }),
        ];
        return { state: newState, events };
      }
    }
  }

  const movedUnit: UnitState = spendSlots(unit, { move: true });
  let updatedUnit: UnitState = {
    ...movedUnit,
    position: { ...finalTo },
    genghisKhanDecreeMovePending: hasDecreeMove
      ? false
      : movedUnit.genghisKhanDecreeMovePending,
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

  const events: GameEvent[] = [];
  if (didMove) {
    events.push(
      evUnitMoved({ unitId: updatedUnit.id, from, to: updatedUnit.position! })
    );
  }

  if (didMove) {
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
  }

  if (!updatedUnit.position) {
    return { state: newState, events };
  }

  // ---- Спец-правило наездника: атакует всех врагов, через которых проехал ----
  // ---- Reveal by adjacency: ending move next to hidden enemies reveals them to mover ----
  // Обходим юнитов и раскрываем те, кто в радиусе 1 (Chebyshev) от конечной позиции
  if (didMove) {
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
          evStealthRevealed({
            unitId: revealed.id,
            reason: "adjacency",
            revealerId: updatedUnit.id,
          })
        );
      }
    }
  }

  // ---- Rider path attacks: enqueue pending sequential rolls ----
  if (didMove && riderMode && from) {
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

  if (
    updatedUnit.heroId === HERO_LECHY_ID &&
    updatedUnit.lechyGuideTravelerTargetId
  ) {
    const guideResult = requestLechyGuideTravelerPlacement(
      newState,
      updatedUnit.id,
      updatedUnit.lechyGuideTravelerTargetId
    );
    if (guideResult.state !== newState || guideResult.events.length > 0) {
      return {
        state: guideResult.state,
        events: [...events, ...guideResult.events],
      };
    }
  }

  return { state: newState, events };
}






