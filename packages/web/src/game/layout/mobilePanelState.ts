import type { MatchSideTab } from "../gameshell-content/components/SidePanelTabs";
import type { PlayerView } from "rules";
import type { RoomMeta } from "../../ws";
import { hasAuthoritativeMatchStarted } from "../pendingState";

export interface MobilePanelState {
  activeTab: MatchSideTab;
  open: boolean;
}

export interface MobileBoardInteractionState {
  actionMode?: string | null;
  targetingMode?: string | null;
  placeUnitId?: string | null;
  boardSelectionPending?: boolean;
  pendingRoll?: { id?: string; kind?: string } | null;
  moveOptions?: { unitId?: string; mode?: string; modes?: string[] } | null;
}

export function resetMobilePanel(): MobilePanelState {
  return { activeTab: "unit", open: false };
}

export function hasMobileMatchStarted(
  view: Pick<PlayerView, "phase" | "pendingRoll" | "initiative">,
  pendingMeta: RoomMeta["pendingRoll"],
): boolean {
  return hasAuthoritativeMatchStarted(view, pendingMeta);
}

export function toggleMobilePanel(
  state: MobilePanelState,
  nextTab: MatchSideTab,
): MobilePanelState {
  if (state.open && state.activeTab === nextTab) {
    return { activeTab: nextTab, open: false };
  }
  return { activeTab: nextTab, open: true };
}

/**
 * Identifies interaction state that moves the player's next useful tap to the board.
 * The key, rather than a boolean, lets the mobile shell distinguish a newly-created
 * intent from one that was already active when the player opened the sheet.
 */
export function getMobileBoardInteractionKey(state: MobileBoardInteractionState): string | null {
  if (state.boardSelectionPending && state.pendingRoll) {
    return `pending:${state.pendingRoll.id ?? state.pendingRoll.kind ?? "board"}`;
  }
  if (state.actionMode || state.targetingMode || state.placeUnitId) {
    const moveStep = Array.isArray(state.moveOptions?.modes) && state.moveOptions.modes.length > 0
      ? `choose-${state.moveOptions.modes.join("-")}`
      : state.moveOptions?.mode
        ? `mode-${state.moveOptions.mode}`
        : "board";
    return [
      state.actionMode ?? "",
      state.targetingMode ?? "",
      state.placeUnitId ?? "",
      state.actionMode === "move" ? moveStep : "",
    ].join(":");
  }
  return null;
}
