import type { PlayerId, PlayerView, UnitState } from "rules";

type InspectableUnit = Pick<UnitState, "owner" | "isAlive" | "isStealthed">;

/**
 * Read-only viewing of a figure the viewer does not own. A hidden enemy can stay in the
 * projection when its position is known, but it is drawn as "?" and must not open.
 */
export function canInspectUnit<T extends InspectableUnit>(
  unit: T | null | undefined,
  viewerId: PlayerId | null,
): unit is T {
  return !!unit && unit.owner !== viewerId && unit.isAlive && !unit.isStealthed;
}

/**
 * Clicks on enemies keep their meaning while a task is open on the board: they pick a
 * target or a cell. Viewing is only for a board that waits for nothing from this client.
 */
export function isUnitInspectionOpen(state: {
  phase: PlayerView["phase"] | undefined;
  joined: boolean;
  canControlTestRoom: boolean;
  actionMode: unknown;
  targetingMode: unknown;
  placeUnitId: string | null;
  moveOptions: unknown;
  boardSelectionPending: boolean;
}): boolean {
  return !!(
    state.phase === "battle" &&
    state.joined &&
    !state.canControlTestRoom &&
    !state.actionMode &&
    !state.targetingMode &&
    !state.placeUnitId &&
    !state.moveOptions &&
    !state.boardSelectionPending
  );
}

/** What one click on a board cell means. Everything that is not a selection reaches the cell. */
export function getBoardClickOutcome(click: {
  disabled: boolean;
  isInspectable: boolean;
  selectable: boolean;
}): "selectUnit" | "cell" | "none" {
  if (click.isInspectable) return "selectUnit";
  if (click.disabled) return "none";
  return click.selectable ? "selectUnit" : "cell";
}

/**
 * Own turn: the acting figure takes the selection back, except while the player reads a
 * visible enemy during that same turn. A newly started turn always takes it back.
 */
export function shouldReturnSelectionToActiveUnit(params: {
  activeUnit: Pick<UnitState, "id" | "owner"> | null | undefined;
  selectedUnit: InspectableUnit | null | undefined;
  selectedUnitId: string | null;
  viewerId: PlayerId | null;
  previousActiveUnitId: string | null;
}): boolean {
  const { activeUnit, selectedUnit, selectedUnitId, viewerId, previousActiveUnitId } = params;
  if (!activeUnit || activeUnit.owner !== viewerId || selectedUnitId === activeUnit.id) {
    return false;
  }
  return !(previousActiveUnitId === activeUnit.id && canInspectUnit(selectedUnit, viewerId));
}
