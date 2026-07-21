import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { BottomNav, BottomSheet, type BottomNavItem } from "../../ui";
import { GameTopBar } from "../components/GameTopBar";
import { CurrentTaskPanel } from "../gameshell-content/components/CurrentTaskPanel";
import { GameShellBoardColumn } from "../gameshell-content/components/GameShellBoardColumn";
import { GameShellSideColumn } from "../gameshell-content/components/GameShellSideColumn";
import { SidePanelTabs, type MatchSideTab } from "../gameshell-content/components/SidePanelTabs";
import { hasMobileMatchStarted, resetMobilePanel, toggleMobilePanel } from "./mobilePanelState";
import { MobileBattleScaffold } from "./MatchScaffolds";

export function MobileMatchLayout({ vm }: { vm: any }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<MatchSideTab>("unit");
  const [sheetOpen, setSheetOpen] = useState(false);
  const matchStarted = hasMobileMatchStarted(vm.view, vm.pendingMeta);

  useEffect(() => {
    if (!matchStarted) return;
    const reset = resetMobilePanel();
    setActiveTab(reset.activeTab);
    setSheetOpen(reset.open);
  }, [matchStarted]);

  if (!matchStarted) {
    return (
      <div
        className="app-shell mobile-room-shell h-dvh overflow-hidden px-2 pt-2"
        data-layout="mobile"
        data-testid="mobile-room-layout"
      >
        <div className="mx-auto flex h-full min-h-0 max-w-xl flex-col gap-2">
          <GameTopBar vm={vm} compact />
          <div className="scroll-panel min-h-0 flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <GameShellSideColumn vm={vm} mobile />
          </div>
        </div>
      </div>
    );
  }

  const items: BottomNavItem<MatchSideTab>[] = [
    { value: "unit", label: t("game.tabsUnit"), glyph: "◆" },
    { value: "actions", label: t("game.tabsActions"), glyph: "⚔" },
    { value: "rules", label: t("game.tabsRules"), glyph: "§" },
    { value: "players", label: t("game.tabsPlayers"), glyph: "♟" },
    { value: "log", label: t("game.tabsLog"), glyph: "≡" },
  ];
  const activeLabel = items.find((item) => item.value === activeTab)?.label ?? "";
  const visibleSheetOpen = sheetOpen && !vm.pendingMeta;

  const openTab = (tab: MatchSideTab) => {
    const next = toggleMobilePanel({ activeTab, open: sheetOpen }, tab);
    setActiveTab(next.activeTab);
    setSheetOpen(next.open);
  };

  return (
    <MobileBattleScaffold
      topBar={<GameTopBar vm={vm} compact />}
      board={<GameShellBoardColumn vm={vm} mobile />}
      currentTask={<CurrentTaskPanel vm={vm} compact />}
      bottomNav={
        <BottomNav
          value={visibleSheetOpen ? activeTab : null}
          items={items}
          onChange={openTab}
          ariaLabel={t("game.sidePanelTabs")}
        />
      }
      bottomSheet={
        <BottomSheet
          open={visibleSheetOpen}
          title={activeLabel}
          onClose={() => setSheetOpen(false)}
        >
          <SidePanelTabs
            vm={vm}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            hideTask
            hideTabs
          />
        </BottomSheet>
      }
    />
  );
}
