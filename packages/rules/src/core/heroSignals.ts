import type { GameState } from "../model";
import { EVENT_VISIBILITY, movementVisibility } from "../model/events/visibility";

/** Freeze authorization and geometry where the result happened, before later hide/move/death. */
export function unitSignalAnchor(state: GameState, unitId: string) {
  const unit = state.units[unitId];
  return { unitId,
    ...(unit?.position ? { sourceCell: { ...unit.position } } : {}),
    [EVENT_VISIBILITY]: unit?.position ? movementVisibility(state, unitId, unit.position) : { recipients: [] },
  };
}

export function unitSignalTarget(state: GameState, unitId: string) {
  const anchor = unitSignalAnchor(state, unitId);
  return {
    ...(anchor.sourceCell ? { targetCell: anchor.sourceCell } : {}),
    [EVENT_VISIBILITY]: { ...anchor[EVENT_VISIBILITY], targetCellRecipients: anchor[EVENT_VISIBILITY].recipients },
  };
}
