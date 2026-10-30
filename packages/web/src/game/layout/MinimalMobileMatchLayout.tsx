import type { GameShellViewModel } from "../gameshell-content/hooks/useGameShellViewModel";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { BottomNav, BottomSheet, type BottomNavItem } from "../../ui";
import { TacticalIcon } from "../../ui/TacticalIcon";
import { shouldShowTestRoomPanel } from "../../testRoom/testRoomApi";
import { getUnitIdDisplayName } from "../../i18n/displayMetadata";
import {
  CurrentTaskPanel,
  hasActiveMobileTask,
} from "../gameshell-content/components/CurrentTaskPanel";
import { GameShellBoardColumn } from "../gameshell-content/components/GameShellBoardColumn";
import { MinimalMatchInfo } from "../gameshell-content/components/MinimalMatchInfo";
import { SidePanelTabs, type MatchSideTab } from "../gameshell-content/components/SidePanelTabs";
import { buildMatchPanelModel } from "../gameshell-content/matchPanelModel";
import { InitiativeQueue } from "../components/InitiativeQueue";
import {
  getMinimalTurnStatusLabel,
  isMinimalBattleOffline,
  MinimalConnectionBanner,
  MinimalTurnStatus,
} from "../components/MinimalBattleStatus";
import { MinimalTopBar } from "../components/MinimalTopBar";
import {
  getMobileBoardInteractionKey,
  shouldCloseMobileSheetForBoardInteraction,
} from "./mobilePanelState";
import { MobileBattleScaffold } from "./MatchScaffolds";

/** Sheet tabs: the side panel tabs plus the arena codex, which docks left on desktop. */
type MinimalMobileTab = MatchSideTab | "arena";

/**
 * Battle layout below the desktop breakpoint: the same top bar, task card, panel tabs
 * and codex as on desktop, around a full-width board with a one-row turn queue above it.
 */
export function MinimalMobileMatchLayout({ vm }: { vm: GameShellViewModel }) {
  const { t, language } = useI18n();
  const showSandbox = shouldShowTestRoomPanel(vm.roomMeta?.roomMode, vm.canControlTestRoom);
  const [activeTab, setActiveTab] = useState<MinimalMobileTab>("unit");
  const [sheetOpen, setSheetOpen] = useState(false);
  const boardInteractionKey = getMobileBoardInteractionKey(vm);
  const interactionKeyWhenOpened = useRef<string | null>(null);
  const model = buildMatchPanelModel(vm, t);
  const { panelVm, rightPanelProps } = model;
  const taskActive = hasActiveMobileTask(vm);
  const inspectedUnitId = panelVm.inspectedUnit?.id ?? null;
  const { setSelectedUnit } = vm;

  useEffect(() => {
    if (
      shouldCloseMobileSheetForBoardInteraction({
        sheetOpen,
        boardInteractionKey,
        interactionKeyWhenOpened: interactionKeyWhenOpened.current,
      })
    ) {
      setSheetOpen(false);
      if (inspectedUnitId) setSelectedUnit(null);
    }
  }, [boardInteractionKey, sheetOpen, inspectedUnitId, setSelectedUnit]);

  // A tap on an enemy has no other use here and nothing else shows on a phone, so it opens the
  // card at once. Closing the card ends the viewing, which also lets the same enemy reopen.
  const lastInspectedUnitId = useRef<string | null>(null);
  useEffect(() => {
    if (lastInspectedUnitId.current === inspectedUnitId) return;
    lastInspectedUnitId.current = inspectedUnitId;
    if (!inspectedUnitId || vm.pendingMeta) return;
    if (!sheetOpen) interactionKeyWhenOpened.current = boardInteractionKey;
    setActiveTab("unit");
    setSheetOpen(true);
  }, [inspectedUnitId, vm.pendingMeta, sheetOpen, boardInteractionKey]);

  const items: BottomNavItem<MinimalMobileTab>[] = [
    { value: "unit", label: t("game.tabsUnit"), glyph: <TacticalIcon name="unit" /> },
    ...(vm.isSpectator
      ? []
      : [
          {
            value: "actions" as const,
            label: t("game.tabsActions"),
            glyph: <TacticalIcon name="actions" />,
          },
        ]),
    { value: "log", label: t("game.tabsLog"), glyph: <TacticalIcon name="log" /> },
    { value: "arena", label: t("game.tabsArena"), glyph: <TacticalIcon name="rules" /> },
    ...(showSandbox
      ? [
          {
            value: "rules" as const,
            label: t("testRoom.badge"),
            glyph: <TacticalIcon name="settings" />,
          },
        ]
      : []),
  ];
  const activeLabel = items.find((item) => item.value === activeTab)?.label ?? "";
  const visibleSheetOpen = sheetOpen && !vm.pendingMeta;

  const closeSheet = () => {
    setSheetOpen(false);
    if (inspectedUnitId) rightPanelProps.onSelectUnit(null);
  };

  const openTab = (tab: MinimalMobileTab) => {
    const open = !(sheetOpen && activeTab === tab);
    if (open && !sheetOpen) interactionKeyWhenOpened.current = boardInteractionKey;
    if (inspectedUnitId && (!open || tab !== "unit")) rightPanelProps.onSelectUnit(null);
    setActiveTab(tab);
    setSheetOpen(open);
  };

  const startTurn =
    panelVm.canStartTurn && panelVm.expectedUnitId && !isMinimalBattleOffline(vm) ? (
      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() => panelVm.onStartTurn(panelVm.expectedUnitId!)}
      >
        {t("game.startTurn", {
          unit:
            getUnitIdDisplayName(vm.view!, panelVm.expectedUnitId, { language, t }) ??
            panelVm.expectedUnitId,
        })}
      </button>
    ) : null;

  return (
    <MobileBattleScaffold
      offline={isMinimalBattleOffline(vm)}
      topBar={
        <>
          <MinimalTopBar vm={vm} />
          <MinimalConnectionBanner vm={vm} />
          <InitiativeQueue
            view={vm.view!}
            playerId={vm.playerId}
            selectedUnitId={vm.selectedUnitId}
            onSelectUnit={rightPanelProps.onSelectUnit}
            variant="strip"
          />
        </>
      }
      board={<GameShellBoardColumn vm={vm} mobile />}
      currentTask={
        taskActive || startTurn ? (
          <div className="minimal-mobile-task">
            {taskActive ? <CurrentTaskPanel vm={vm} compact /> : null}
            {startTurn}
          </div>
        ) : getMinimalTurnStatusLabel(vm, t, language) ? (
          <MinimalTurnStatus vm={vm} />
        ) : null
      }
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
          onClose={closeSheet}
        >
          {activeTab === "arena" ? (
            <MinimalMatchInfo vm={vm} model={model} />
          ) : (
            <SidePanelTabs
              vm={vm}
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              hideTabs
            />
          )}
        </BottomSheet>
      }
    />
  );
}
