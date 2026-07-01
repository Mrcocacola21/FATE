import type { Coord } from "rules";

export type Cell = Coord;

export interface TargetRef {
  type: "unit";
  unitId: string;
  cell: Cell;
  disabled?: boolean;
}

export type PreviewCellKind =
  | "source"
  | "validTarget"
  | "invalidTarget"
  | "validMove"
  | "area"
  | "line"
  | "blocked"
  | "pickup"
  | "drop"
  | "danger"
  | "affected";

export type BoardPreview =
  | {
      kind: "radius";
      sourceCell: Cell;
      cells: Cell[];
      validTargets?: TargetRef[];
      invalidTargets?: TargetRef[];
      affectedTargets?: TargetRef[];
      labelKey?: string;
    }
  | {
      kind: "line";
      sourceCell: Cell;
      lineCells: Cell[];
      validTargets?: TargetRef[];
      invalidTargets?: TargetRef[];
      affectedTargets?: TargetRef[];
      blockedCells?: Cell[];
      labelKey?: string;
    }
  | {
      kind: "area";
      areaCells: Cell[];
      centerCell?: Cell;
      sourceCell?: Cell;
      validTargets?: TargetRef[];
      invalidTargets?: TargetRef[];
      affectedTargets?: TargetRef[];
      labelKey?: string;
    }
  | {
      kind: "movement";
      sourceCell: Cell;
      reachableCells: Cell[];
      pathCells?: Cell[];
      labelKey?: string;
    }
  | {
      kind: "pickupDrop";
      sourceCell?: Cell;
      pickupCells?: Cell[];
      dropCells?: Cell[];
      validTargets?: TargetRef[];
      invalidTargets?: TargetRef[];
      labelKey?: string;
    }
  | {
      kind: "multiStep";
      step: string;
      cells: Cell[];
      sourceCell?: Cell;
      validTargets?: TargetRef[];
      invalidTargets?: TargetRef[];
      affectedTargets?: TargetRef[];
      cellKind?: PreviewCellKind;
      labelKey?: string;
    }
  | {
      kind: "compound";
      layers: BoardPreview[];
      labelKey?: string;
    };

export interface PreviewCellState {
  kinds: PreviewCellKind[];
  labelKeys: string[];
}

export function previewCoordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

function pushKind(
  map: Map<string, PreviewCellState>,
  coord: Coord | undefined,
  kind: PreviewCellKind,
  labelKey?: string,
) {
  if (!coord) return;
  const key = previewCoordKey(coord);
  const state = map.get(key) ?? { kinds: [], labelKeys: [] };
  if (!state.kinds.includes(kind)) {
    state.kinds.push(kind);
  }
  if (labelKey && !state.labelKeys.includes(labelKey)) {
    state.labelKeys.push(labelKey);
  }
  map.set(key, state);
}

function pushCells(
  map: Map<string, PreviewCellState>,
  coords: Coord[] | undefined,
  kind: PreviewCellKind,
  labelKey?: string,
) {
  for (const coord of coords ?? []) {
    pushKind(map, coord, kind, labelKey);
  }
}

function pushTargets(
  map: Map<string, PreviewCellState>,
  targets: TargetRef[] | undefined,
  kind: PreviewCellKind,
  labelKey?: string,
) {
  for (const target of targets ?? []) {
    pushKind(map, target.cell, target.disabled ? "invalidTarget" : kind, labelKey);
  }
}

function collectPreviewCells(
  preview: BoardPreview,
  map: Map<string, PreviewCellState>,
  inheritedLabelKey?: string,
) {
  const labelKey = preview.labelKey ?? inheritedLabelKey;

  switch (preview.kind) {
    case "compound":
      for (const layer of preview.layers) {
        collectPreviewCells(layer, map, labelKey);
      }
      break;
    case "radius":
      pushCells(map, preview.cells, "area", labelKey);
      pushKind(map, preview.sourceCell, "source", labelKey);
      pushTargets(map, preview.affectedTargets, "affected", labelKey);
      pushTargets(map, preview.invalidTargets, "invalidTarget", labelKey);
      pushTargets(map, preview.validTargets, "validTarget", labelKey);
      break;
    case "line":
      pushCells(map, preview.lineCells, "line", labelKey);
      pushCells(map, preview.blockedCells, "blocked", labelKey);
      pushKind(map, preview.sourceCell, "source", labelKey);
      pushTargets(map, preview.affectedTargets, "affected", labelKey);
      pushTargets(map, preview.invalidTargets, "invalidTarget", labelKey);
      pushTargets(map, preview.validTargets, "validTarget", labelKey);
      break;
    case "area":
      pushCells(map, preview.areaCells, "area", labelKey);
      pushKind(map, preview.sourceCell, "source", labelKey);
      pushKind(map, preview.centerCell, "affected", labelKey);
      pushTargets(map, preview.affectedTargets, "affected", labelKey);
      pushTargets(map, preview.invalidTargets, "invalidTarget", labelKey);
      pushTargets(map, preview.validTargets, "validTarget", labelKey);
      break;
    case "movement":
      pushCells(map, preview.reachableCells, "validMove", labelKey);
      pushCells(map, preview.pathCells, "line", labelKey);
      pushKind(map, preview.sourceCell, "source", labelKey);
      break;
    case "pickupDrop":
      pushKind(map, preview.sourceCell, "source", labelKey);
      pushCells(map, preview.pickupCells, "pickup", labelKey);
      pushCells(map, preview.dropCells, "drop", labelKey);
      pushTargets(map, preview.invalidTargets, "invalidTarget", labelKey);
      pushTargets(map, preview.validTargets, "validTarget", labelKey);
      break;
    case "multiStep":
      pushCells(map, preview.cells, preview.cellKind ?? "affected", labelKey);
      pushKind(map, preview.sourceCell, "source", labelKey);
      pushTargets(map, preview.affectedTargets, "affected", labelKey);
      pushTargets(map, preview.invalidTargets, "invalidTarget", labelKey);
      pushTargets(map, preview.validTargets, "validTarget", labelKey);
      break;
  }
}

export function buildPreviewCellMap(
  preview: BoardPreview | null | undefined,
): Map<string, PreviewCellState> {
  const map = new Map<string, PreviewCellState>();
  if (!preview) return map;
  collectPreviewCells(preview, map);
  return map;
}
