import { translateForLanguage, type Language } from "../../i18n";
import { presentationEn } from "../../i18n/locales/presentation";
const pendingLabels = presentationEn.pendingLabels;
import type { Coord, PapyrusLineAxis, PlayerView } from "rules";
import { type ActionPreviewMode } from "../../store";
import { ASGORE_ID, FEMTO_ID, GUTS_ID, KALADIN_ID, UNDYNE_ID } from "../../rulesHints";

const DORA_DIRS: Coord[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
  { col: 1, row: 1 },
  { col: 1, row: -1 },
  { col: -1, row: 1 },
  { col: -1, row: -1 },
];

export function getUnitAt(view: PlayerView, col: number, row: number) {
  return getUnitsAt(view, col, row)[0];
}

export function getUnitsAt(view: PlayerView, col: number, row: number) {
  return Object.values(view.units).filter(
    (u) => u.position && u.position.col === col && u.position.row === row,
  );
}

/**
 * Resolves only projected, authoritative unit targets at a cell. Callers pass
 * target ids from the player view, so private occupants can neither block the
 * result nor be inferred through this helper.
 */
export function getSelectableAttackTargetsAtCell(
  view: PlayerView,
  col: number,
  row: number,
  legalTargetIds: readonly string[],
) {
  const legalIds = new Set(legalTargetIds);
  return getUnitsAt(view, col, row).filter((unit) => legalIds.has(unit.id));
}

export function getDoraTargetCenters(view: PlayerView, casterId: string): Coord[] {
  const caster = view.units[casterId];
  if (!caster?.position) return [];
  const size = view.boardSize ?? 9;
  const origin = caster.position;
  const targets: Coord[] = [];

  for (const dir of DORA_DIRS) {
    let col = origin.col + dir.col;
    let row = origin.row + dir.row;
    while (col >= 0 && row >= 0 && col < size && row < size) {
      targets.push({ col, row });
      const units = getUnitsAt(view, col, row);
      if (units.some((unit) => unit.owner !== caster.owner)) {
        break;
      }
      col += dir.col;
      row += dir.row;
    }
  }

  return targets;
}

export function getFullLineTargetCells(view: PlayerView, casterId: string): Coord[] {
  const caster = view.units[casterId];
  if (!caster?.position) return [];
  const size = view.boardSize ?? 9;
  const targets: Coord[] = [];

  for (const dir of DORA_DIRS) {
    let col = caster.position.col + dir.col;
    let row = caster.position.row + dir.row;
    while (col >= 0 && row >= 0 && col < size && row < size) {
      targets.push({ col, row });
      if (caster.blindUntilOwnTurnStart) break;
      col += dir.col;
      row += dir.row;
    }
  }

  return targets;
}

export function getArcherLikeTargetIds(view: PlayerView, casterId: string): string[] {
  const caster = view.units[casterId];
  if (!caster?.position) return [];
  const size = view.boardSize ?? 9;
  const origin = caster.position;
  const targets: string[] = [];
  const seen = new Set<string>();

  for (const dir of DORA_DIRS) {
    let col = origin.col + dir.col;
    let row = origin.row + dir.row;
    while (col >= 0 && row >= 0 && col < size && row < size) {
      const enemies = getUnitsAt(view, col, row).filter((unit) => unit.owner !== caster.owner);
      if (enemies.length > 0) {
        for (const enemy of enemies) {
          if (!seen.has(enemy.id)) {
            seen.add(enemy.id);
            targets.push(enemy.id);
          }
        }
        break;
      }
      col += dir.col;
      row += dir.row;
    }
  }

  return targets;
}

export function coordKey(coord: Coord) {
  return `${coord.col},${coord.row}`;
}

const COLS = "abcdefghi";

function coordFromNotationSafe(value: string): Coord | null {
  if (value.length !== 2) return null;
  const colChar = value[0]?.toLowerCase() ?? "";
  const rowChar = value[1] ?? "";
  const col = COLS.indexOf(colChar);
  const row = Number.parseInt(rowChar, 10);
  if (col < 0 || Number.isNaN(row)) return null;
  return { col, row };
}

function normalizeCoordInput(value: unknown): Coord | null {
  if (value && typeof value === "object") {
    const colRaw = (value as { col?: unknown }).col;
    const rowRaw = (value as { row?: unknown }).row;
    const col =
      typeof colRaw === "number" ? colRaw : typeof colRaw === "string" ? Number(colRaw) : NaN;
    const row =
      typeof rowRaw === "number" ? rowRaw : typeof rowRaw === "string" ? Number(rowRaw) : NaN;
    if (Number.isFinite(col) && Number.isFinite(row)) {
      return { col, row };
    }
  }
  if (typeof value === "string") {
    return coordFromNotationSafe(value);
  }
  return null;
}

export function normalizeCoordList(value: unknown): Coord[] {
  if (!Array.isArray(value)) return [];
  const coords: Coord[] = [];
  for (const item of value) {
    const parsed = normalizeCoordInput(item);
    if (parsed) coords.push(parsed);
  }
  return coords;
}

export function linePath(start: Coord, end: Coord): Coord[] | null {
  const dx = end.col - start.col;
  const dy = end.row - start.row;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (dx === 0 && dy === 0) {
    return [{ col: start.col, row: start.row }];
  }
  if (!(dx === 0 || dy === 0 || absDx === absDy)) {
    return null;
  }
  const steps = Math.max(absDx, absDy);
  const stepCol = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepRow = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  const path: Coord[] = [];
  for (let i = 0; i <= steps; i += 1) {
    path.push({
      col: start.col + stepCol * i,
      row: start.row + stepRow * i,
    });
  }
  return path;
}

export function getOrthogonalLineCells(size: number, origin: Coord, target: Coord): Coord[] {
  const cells: Coord[] = [];
  if (origin.row === target.row) {
    for (let col = 0; col < size; col += 1) {
      if (col === origin.col) continue;
      cells.push({ col, row: origin.row });
    }
    return cells;
  }
  if (origin.col === target.col) {
    for (let row = 0; row < size; row += 1) {
      if (row === origin.row) continue;
      cells.push({ col: origin.col, row });
    }
  }
  return cells;
}

/**
 * Line axis pointed at from an anchor cell: mostly horizontal is a row, mostly vertical a
 * column, otherwise the diagonal the pointer lies on. Without diagonals the dominant axis wins.
 * Pointing at the anchor itself keeps the current axis.
 */
export function axisTowards(
  anchor: Coord,
  pointer: Coord,
  current: PapyrusLineAxis,
  allowDiagonal: boolean,
): PapyrusLineAxis {
  const dx = pointer.col - anchor.col;
  const dy = pointer.row - anchor.row;
  if (dx === 0 && dy === 0) return allowDiagonal || current === "col" ? current : "row";
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (!allowDiagonal) return ax >= ay ? "row" : "col";
  if (ax > 2 * ay) return "row";
  if (ay > 2 * ax) return "col";
  return Math.sign(dx) === Math.sign(dy) ? "diagMain" : "diagAnti";
}

/** Square of cells around a center, clipped to the board. */
export function getAreaPreviewCells(size: number, center: Coord, radius: number): Coord[] {
  const cells: Coord[] = [];
  for (let col = center.col - radius; col <= center.col + radius; col += 1) {
    for (let row = center.row - radius; row <= center.row + radius; row += 1) {
      if (col >= 0 && row >= 0 && col < size && row < size) cells.push({ col, row });
    }
  }
  return cells;
}

/**
 * Visible figures standing in previewed cells, split by side. Only units the viewer can see
 * are counted, so hidden enemies never leak through the preview.
 */
export function countPreviewHits(
  view: PlayerView,
  cells: readonly Coord[],
  playerId: string | null,
): { enemies: number; allies: number } {
  const keys = new Set(cells.map(coordKey));
  let enemies = 0;
  let allies = 0;
  for (const unit of Object.values(view.units)) {
    if (!unit.isAlive || !unit.position || !keys.has(coordKey(unit.position))) continue;
    if (unit.owner === playerId) allies += 1;
    else enemies += 1;
  }
  return { enemies, allies };
}

export function getPapyrusLineCells(size: number, axis: PapyrusLineAxis, anchor: Coord): Coord[] {
  const cells: Coord[] = [];
  for (let col = 0; col < size; col += 1) {
    for (let row = 0; row < size; row += 1) {
      const matches =
        axis === "row"
          ? row === anchor.row
          : axis === "col"
            ? col === anchor.col
            : axis === "diagMain"
              ? col - row === anchor.col - anchor.row
              : col + row === anchor.col + anchor.row;
      if (matches) {
        cells.push({ col, row });
      }
    }
  }
  return cells;
}

export function getAttackRangeCells(view: PlayerView, unitId: string): Coord[] {
  const unit = view.units[unitId];
  if (!unit?.position) return [];
  const size = view.boardSize ?? 9;
  const origin = unit.position;
  const isKaladin = unit.heroId === KALADIN_ID;
  const effectiveClass =
    unit.heroId === FEMTO_ID ||
    unit.heroId === UNDYNE_ID ||
    unit.heroId === ASGORE_ID ||
    (unit.heroId === GUTS_ID && unit.gutsBerserkModeActive)
      ? "spearman"
      : unit.class;
  const cells: Coord[] = [];

  const addCell = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= size || row >= size) return;
    if (col === origin.col && row === origin.row) return;
    cells.push({ col, row });
  };

  if (isKaladin) {
    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (dc === 0 && dr === 0) continue;
        addCell(origin.col + dc, origin.row + dr);
      }
    }
    const reach2 = [
      { col: 2, row: 0 },
      { col: -2, row: 0 },
      { col: 0, row: 2 },
      { col: 0, row: -2 },
      { col: 2, row: 2 },
      { col: 2, row: -2 },
      { col: -2, row: 2 },
      { col: -2, row: -2 },
    ];
    for (const offset of reach2) {
      addCell(origin.col + offset.col, origin.row + offset.row);
    }
    for (let dc = -2; dc <= 2; dc += 1) {
      for (let dr = -2; dr <= 2; dr += 1) {
        if (dc === 0 && dr === 0) continue;
        if (Math.max(Math.abs(dc), Math.abs(dr)) <= 2) {
          addCell(origin.col + dc, origin.row + dr);
        }
      }
    }
    return cells;
  }

  switch (effectiveClass) {
    case "archer": {
      for (const dir of DORA_DIRS) {
        let col = origin.col + dir.col;
        let row = origin.row + dir.row;
        while (col >= 0 && row >= 0 && col < size && row < size) {
          cells.push({ col, row });
          const occupants = getUnitsAt(view, col, row);
          if (occupants.some((occupant) => occupant.owner !== unit.owner)) {
            break;
          }
          col += dir.col;
          row += dir.row;
        }
      }
      break;
    }

    case "spearman": {
      for (let dc = -1; dc <= 1; dc += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (dc === 0 && dr === 0) continue;
          addCell(origin.col + dc, origin.row + dr);
        }
      }
      const reach2 = [
        { col: 2, row: 0 },
        { col: -2, row: 0 },
        { col: 0, row: 2 },
        { col: 0, row: -2 },
        { col: 2, row: 2 },
        { col: 2, row: -2 },
        { col: -2, row: 2 },
        { col: -2, row: -2 },
      ];
      for (const offset of reach2) {
        addCell(origin.col + offset.col, origin.row + offset.row);
      }
      break;
    }

    case "trickster": {
      for (let dc = -2; dc <= 2; dc += 1) {
        for (let dr = -2; dr <= 2; dr += 1) {
          if (dc === 0 && dr === 0) continue;
          if (Math.max(Math.abs(dc), Math.abs(dr)) <= 2) {
            addCell(origin.col + dc, origin.row + dr);
          }
        }
      }
      break;
    }

    case "rider":
    case "knight":
    case "assassin":
    case "berserker": {
      for (let dc = -1; dc <= 1; dc += 1) {
        for (let dr = -1; dr <= 1; dr += 1) {
          if (dc === 0 && dr === 0) continue;
          addCell(origin.col + dc, origin.row + dr);
        }
      }
      break;
    }

    default:
      break;
  }

  return cells;
}

export function getPendingRollLabel(kind?: string | null, language: Language = "en") {
  const key = kind && Object.prototype.hasOwnProperty.call(pendingLabels, kind) ? kind : "unknown";
  return translateForLanguage(language, `presentation.pendingLabels.${key}`);
}

export function isCoordInList(coords: Coord[], col: number, row: number): boolean {
  return coords.some((c) => c.col === col && c.row === row);
}

export type CellHighlightKind =
  | "place"
  | "move"
  | "attack"
  | "dora"
  | "attackRange"
  | "previewMove"
  | "previewAttack"
  | "previewAbility";

export function previewKindForActionMode(
  mode: ActionPreviewMode | null,
): "previewMove" | "previewAttack" | "previewAbility" | null {
  if (!mode) return null;
  if (mode === "move") return "previewMove";
  if (mode === "attack") return "previewAttack";
  return "previewAbility";
}
