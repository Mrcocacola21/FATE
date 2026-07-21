import type { MatchSideTab } from "../gameshell-content/components/SidePanelTabs";
import type { PlayerView } from "rules";
import type { RoomMeta } from "../../ws";
import { hasAuthoritativeMatchStarted } from "../pendingState";

export interface MobilePanelState {
  activeTab: MatchSideTab;
  open: boolean;
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
