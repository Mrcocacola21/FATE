import type { ActionMode } from "../store";

export interface LocalSelectionState<TMoveOptions = unknown> {
  actionMode: ActionMode;
  moveOptions: TMoveOptions | null;
}

export function transitionActionMode<TMoveOptions>(
  state: LocalSelectionState<TMoveOptions>,
  mode: ActionMode
): Partial<LocalSelectionState<TMoveOptions>> {
  return {
    actionMode: mode,
    moveOptions: mode === "move" ? state.moveOptions : null,
  };
}
