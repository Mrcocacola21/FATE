import type { MatchSideTab } from "../gameshell-content/components/SidePanelTabs";

export interface MobilePanelState {
  activeTab: MatchSideTab;
  open: boolean;
}

export function resetMobilePanel(): MobilePanelState {
  return { activeTab: "unit", open: false };
}

export function hasMobileMatchStarted(
  phase: string,
  pendingMeta: unknown,
): boolean {
  return phase !== "lobby" || !!pendingMeta;
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
