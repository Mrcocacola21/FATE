import type { PapyrusLineAxis } from "rules";
import type { TurnEconomyState } from "./types";

export const DEFAULT_ECONOMY: TurnEconomyState = {
  moveUsed: false,
  attackUsed: false,
  actionUsed: false,
  stealthUsed: false,
};

export const PAPYRUS_AXIS_OPTIONS: { axis: PapyrusLineAxis; label: string }[] = [
  { axis: "row", label: "Rows" },
  { axis: "col", label: "Cols" },
  { axis: "diagMain", label: "Diag \\" },
  { axis: "diagAnti", label: "Diag /" },
];

export const UNDYNE_AXIS_OPTIONS: { axis: "row" | "col"; label: string }[] = [
  { axis: "row", label: "Rows" },
  { axis: "col", label: "Cols" },
];
