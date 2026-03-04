import type { ApplyResult, Coord, GameState, UnitState } from "../../model";
import { coordsEqual } from "../../board";
import { canUnitEnterCell } from "../../visibility";
import { isInsideForestAura } from "../../forest";
import { requestRoll } from "../../core";
import type { ForestRestrictionContext, ForestRestrictionKind } from "./types";

function buildForestPath(from: Coord, to: Coord, line: Coord[] | null): Coord[] {
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

export function maybeRequestForestMoveCheck(
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

export function parseCoordList(raw: unknown): Coord[] {
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

export function parseCoord(raw: unknown): Coord | null {
  if (!raw || typeof raw !== "object") return null;
  const colRaw = (raw as { col?: unknown }).col;
  const rowRaw = (raw as { row?: unknown }).row;
  if (typeof colRaw !== "number" || typeof rowRaw !== "number") return null;
  return { col: colRaw, row: rowRaw };
}
