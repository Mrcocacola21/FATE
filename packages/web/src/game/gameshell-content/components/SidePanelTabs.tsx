import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { MinimalEventLog } from "../../../components/EventLog";
import { PanelCard, SectionHeader } from "../../../components/ui";
import { useI18n } from "../../../i18n";
import { Tabs } from "../../../ui";
import { TestRoomPanel } from "../../../testRoom/TestRoomPanel";
import { shouldShowTestRoomPanel } from "../../../testRoom/testRoomApi";
import { buildRightPanelViewModel } from "../../components/RightPanel/rightPanelViewModel";
import type { RightPanelProps } from "../../components/RightPanel/types";
import { BattleAbilityActions } from "../../components/RightPanel/sections/BattleAbilityActions";
import { BattleActionButtons } from "../../components/RightPanel/sections/BattleActionButtons";
import { BattleBottomHints } from "../../components/RightPanel/sections/BattleBottomHints";
import { PapyrusAttackControl } from "../../components/RightPanel/sections/PapyrusAttackControl";
import { BattleTurnButtons } from "../../components/RightPanel/sections/BattleTurnButtons";
import {
  BattleUnitSummary,
  UnitEffectPanels,
  UnitEffectPills,
} from "../../components/RightPanel/sections/BattleUnitSummary";
import { ActionMenu } from "../../components/RightPanel/ActionMenu";
import { FriendlyUnitsSection } from "../../components/RightPanel/sections/FriendlyUnitsSection";
import { PlacementSection } from "../../components/RightPanel/sections/PlacementSection";
import { CurrentTaskPanel, hasActiveMobileTask } from "./CurrentTaskPanel";
import { buildMatchPanelModel } from "../matchPanelModel";
import { MinimalTurnStatus } from "../../components/MinimalBattleStatus";

export type MatchSideTab = "unit" | "actions" | "rules" | "log";

interface SidePanelTabsProps {
  vm: GameShellViewModel;
  activeTab?: MatchSideTab;
  onActiveTabChange?: (tab: MatchSideTab) => void;
  hideTabs?: boolean;
}

function ActionTab({
  panelVm,
  props,
}: {
  panelVm: ReturnType<typeof buildRightPanelViewModel>;
  props: RightPanelProps;
}) {
  const { t } = useI18n();

  if (props.view.phase === "placement") {
    return (
      <PlacementSection
        unplacedUnits={panelVm.unplacedUnits}
        friendlyUnits={panelVm.friendlyUnits}
        placeUnitId={props.placeUnitId}
        actionMode={props.actionMode}
        placementEnabled={panelVm.placementEnabled}
        joined={props.joined}
        pendingRoll={props.pendingRoll}
        isSpectator={panelVm.isSpectator}
        isMyTurn={panelVm.isMyTurn}
        onSetPlaceUnit={props.onSetPlaceUnit}
        onSetActionMode={props.onSetActionMode}
      />
    );
  }

  if (props.view.phase !== "battle") {
    return (
      <PanelCard variant="hud" className="p-4">
        <SectionHeader
          kicker={t("game.actions")}
          title={
            props.view.phase === "ended"
              ? t("game.battleEnd.spectator.title")
              : t("game.noCurrentTask")
          }
          description={props.view.phase === "ended" ? undefined : t("game.noBattleActions")}
        />
      </PanelCard>
    );
  }

  return (
    <PanelCard variant="parchment" className="p-3">
      <div>
        <ActionMenu
          unit={panelVm.selectedUnit}
          heroName={panelVm.selectedHeroName}
          view={props.view}
          viewerRole={props.role}
          economy={panelVm.economy}
          abilityViews={panelVm.abilityViews}
          targetingActive={!!props.targetingMode}
          primaryActions={
            <BattleActionButtons
              actionMode={props.actionMode}
              targetingActive={!!props.targetingMode}
              moveDisabled={panelVm.moveDisabled}
              attackDisabled={panelVm.attackDisabled}
              searchMoveDisabled={panelVm.searchMoveDisabled}
              searchActionDisabled={panelVm.searchActionDisabled}
              stealthDisabled={panelVm.stealthDisabled}
              showStealthAction={panelVm.showStealthAction}
              attackDisabledReason={panelVm.attackDisabledReason}
              searchMoveReason={panelVm.legalIntents?.searchMoveReason}
              searchActionReason={panelVm.legalIntents?.searchActionReason}
              onMoveClick={panelVm.onMoveClick}
              onAttackClick={() => panelVm.onToggleMode("attack")}
              onSearchMoveClick={panelVm.onSearchMoveClick}
              onSearchActionClick={panelVm.onSearchActionClick}
              onStealthClick={panelVm.onStealthClick}
              onModePreview={panelVm.onModePreview}
              renderAttack={
                panelVm.selectedPapyrusUnbeliever && panelVm.selectedUnit
                  ? ({ blocked, reason }) => (
                      <PapyrusAttackControl
                        longBoneMode={panelVm.selectedPapyrusLongBoneMode}
                        attacking={props.actionMode === "attack"}
                        disabled={blocked || !panelVm.canAct}
                        reason={reason}
                        onToggleLongBone={panelVm.onTogglePapyrusLongBone}
                        onAttack={() => panelVm.onToggleMode("attack")}
                        onPreview={(active) => panelVm.onModePreview(active ? "attack" : null)}
                      />
                    )
                  : undefined
              }
            />
          }
          abilityActions={
            <BattleAbilityActions
              view={props.view}
              actionableAbilities={panelVm.actionableAbilities}
              selectedUnit={panelVm.selectedUnit}
              canAct={panelVm.canAct || panelVm.canChooseImpulseAxis}
              economy={panelVm.economy}
              actionMode={props.actionMode}
              targetingActive={!!props.targetingMode}
              lokiLaughtOptionQueued={panelVm.lokiLaughtOptionQueued}
              onUseAbility={panelVm.onUseAbility}
              onUseLokiLaughtOption={panelVm.onUseLokiLaughtOption}
              onToggleMode={panelVm.onToggleMode}
              onModePreview={panelVm.onModePreview}
              onHoverAbility={props.onHoverAbility}
            />
          }
          effects={
            panelVm.selectedUnit ? (
              <section className="unit-grimoire controls-effects" data-testid="controls-effects">
                <div className="action-menu-heading mb-1">{t("log.filterEffects")}</div>
                <div className="grimoire-effects">
                  <UnitEffectPills
                    unit={panelVm.selectedUnit}
                    mettatonRating={panelVm.selectedMettatonRating}
                  />
                </div>
                <UnitEffectPanels unit={panelVm.selectedUnit} view={props.view} />
              </section>
            ) : undefined
          }
          turnActions={
            <BattleTurnButtons
              isMyTurn={panelVm.isMyTurn}
              joined={props.joined}
              isSpectator={panelVm.isSpectator}
              pendingRoll={props.pendingRoll}
              onEndTurn={panelVm.onEndTurn}
              onClear={panelVm.onClear}
            />
          }
          footer={
            <BattleBottomHints
              moveModeOptions={panelVm.moveModeOptions}
              selectedUnitId={props.selectedUnitId}
              moveDisabled={panelVm.moveDisabled}
              onMoveRequest={props.onMoveRequest}
            />
          }
        />
      </div>
    </PanelCard>
  );
}

export const SidePanelTabs: FC<SidePanelTabsProps> = ({
  vm,
  activeTab: controlledTab,
  onActiveTabChange,
  hideTabs = false,
}) => {
  const { t } = useI18n();
  const showSandbox = shouldShowTestRoomPanel(vm.roomMeta?.roomMode, vm.canControlTestRoom);
  const [internalTab, setInternalTab] = useState<MatchSideTab>(showSandbox ? "rules" : "unit");
  const isControlled = controlledTab !== undefined;
  const setActiveTab = useCallback(
    (tab: MatchSideTab) => {
      onActiveTabChange?.(tab);
      if (!isControlled) setInternalTab(tab);
    },
    [onActiveTabChange, isControlled],
  );
  const model = buildMatchPanelModel(vm, t);
  const { rightPanelProps, panelVm } = model;

  // A spectator has nothing to control, so there is no Controls tab for them.
  const showActionsTab = !vm.isSpectator;

  useEffect(() => {
    if (!showSandbox && showActionsTab && (vm.pendingRoll || vm.pendingMeta)) {
      setActiveTab("actions");
    }
  }, [vm.pendingRoll, vm.pendingMeta, setActiveTab, showSandbox, showActionsTab]);

  // Unit = what the figure is, Actions = what it can do now. Match-wide info sits in the
  // info column (the Arena sheet on phones); the sandbox controls get their own tab.
  const tabs = [
    { value: "unit" as const, label: t("game.tabsUnit") },
    ...(showActionsTab ? [{ value: "actions" as const, label: t("game.tabsActions") }] : []),
    { value: "log" as const, label: t("game.tabsLog") },
    ...(showSandbox ? [{ value: "rules" as const, label: t("testRoom.badgeSandbox") }] : []),
  ];
  const requestedTab = controlledTab ?? internalTab;
  const activeTab =
    (requestedTab === "rules" && !showSandbox) || (requestedTab === "actions" && !showActionsTab)
      ? "unit"
      : requestedTab;

  // The task card lives in Controls, so a new task brings that tab forward.
  const taskActive = showActionsTab && hasActiveMobileTask(vm);
  useEffect(() => {
    if (taskActive && !showSandbox) setActiveTab("actions");
  }, [taskActive, setActiveTab, showSandbox]);

  // Tabs share one scroller; start each tab at its top instead of the previous tab's offset.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [activeTab]);

  return (
    <div className="minimal-side-panel flex h-full min-h-0 flex-col overflow-hidden">
      {!hideTabs ? (
        <div className="shrink-0 space-y-3">
          <Tabs
            value={activeTab}
            items={tabs}
            onChange={setActiveTab}
            ariaLabel={t("game.sidePanelTabs")}
            className="minimal-tabs"
          />
          <MinimalTurnStatus vm={vm} />
        </div>
      ) : null}

      <div ref={scrollRef} className="scroll-panel mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {activeTab === "unit" ? (
          vm.view!.phase === "battle" ? (
            <PanelCard variant="parchment" className="minimal-unit-tab">
              <BattleUnitSummary
                selectedUnit={panelVm.selectedUnit}
                selectedHeroName={panelVm.selectedHeroName}
                selectedMettatonRating={panelVm.selectedMettatonRating}
                forestMarkers={panelVm.forestMarkers}
                selectedInsideForest={panelVm.selectedInsideForest}
                stormActive={panelVm.stormActive}
                selectedStormExempt={panelVm.selectedStormExempt}
                moveRoll={panelVm.moveRoll}
                economy={panelVm.economy}
                abilityViews={panelVm.abilityViews}
                view={vm.view!}
                canAct={panelVm.canAct}
                pendingRoll={rightPanelProps.pendingRoll}
                attackDisabledReason={panelVm.attackDisabledReason}
                legalAttackTargetCount={panelVm.selectedLegalAttackTargets.length}
                legalMoveCount={panelVm.selectedLegalMoves.length}
                onHoverAbility={rightPanelProps.onHoverAbility}
              />
            </PanelCard>
          ) : (
            <FriendlyUnitsSection
              friendlyUnits={panelVm.friendlyUnits}
              selectedUnitId={vm.selectedUnitId}
              onSelectUnit={rightPanelProps.onSelectUnit}
            />
          )
        ) : null}

        {activeTab === "actions" ? (
          <>
            <div className="minimal-task-card">
              <CurrentTaskPanel vm={vm} />
            </div>
            <ActionTab panelVm={panelVm} props={rightPanelProps} />
          </>
        ) : null}

        {showSandbox ? (
          <div hidden={activeTab !== "rules"} className="mb-3">
            <TestRoomPanel vm={vm} />
          </div>
        ) : null}

        {activeTab === "log" ? (
          <MinimalEventLog
            events={vm.events}
            clientLog={vm.clientLog}
            units={vm.view?.rosterUnits}
            playerId={vm.playerId}
          />
        ) : null}
      </div>
    </div>
  );
};
