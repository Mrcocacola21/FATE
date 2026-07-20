import type { MatchSideTab } from "../gameshell-content/components/SidePanelTabs";

export interface MobilePanelState {
  activeTab: MatchSideTab;
  open: boolean;
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
