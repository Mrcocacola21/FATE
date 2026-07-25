import { useEffect, useState, type FC } from "react";
import { EventLog } from "../../../components/EventLog";
import { TurnQueueTracker } from "../../../components/TurnQueueTracker";
import { PanelCard, SectionHeader } from "../../../components/ui";
import { useI18n } from "../../../i18n";
import { PAPYRUS_LONG_BONE_ID } from "../../../rulesHints";
import { Tabs } from "../../../ui";
import { TestRoomPanel } from "../../../testRoom/TestRoomPanel";
import { shouldShowTestRoomPanel } from "../../../testRoom/testRoomApi";
import { buildRightPanelViewModel } from "../../components/RightPanel/rightPanelViewModel";
import {
  PAPYRUS_AXIS_OPTIONS,
  UNDYNE_AXIS_OPTIONS,
} from "../../components/RightPanel/rightPanelConstants";
import type { RightPanelProps } from "../../components/RightPanel/types";
import { BattleAbilityActions } from "../../components/RightPanel/sections/BattleAbilityActions";
import { BattleActionButtons } from "../../components/RightPanel/sections/BattleActionButtons";
import { BattleBottomHints } from "../../components/RightPanel/sections/BattleBottomHints";
import { BattleHeroControls } from "../../components/RightPanel/sections/BattleHeroControls";
import { BattleTurnButtons } from "../../components/RightPanel/sections/BattleTurnButtons";
import { BattleUnitSummary } from "../../components/RightPanel/sections/BattleUnitSummary";
import { ActionMenu } from "../../components/RightPanel/ActionMenu";
import { FriendlyUnitsSection } from "../../components/RightPanel/sections/FriendlyUnitsSection";
import { PlacementSection } from "../../components/RightPanel/sections/PlacementSection";
import { StatusSection } from "../../components/RightPanel/sections/StatusSection";
import { CurrentTaskPanel } from "./CurrentTaskPanel";
import { RuleDeclarationStatus } from "./RuleDeclarationStatus";
import { ActiveFieldInfo } from "../../components/ActiveFieldInfo";
import { PlayersRosterSection } from "./PlayersRosterSection";

export type MatchSideTab = "unit" | "actions" | "rules" | "players" | "log";

interface SidePanelTabsProps {
  vm: any;
  activeTab?: MatchSideTab;
  onActiveTabChange?: (tab: MatchSideTab) => void;
  hideTask?: boolean;
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
          title={t("game.noCurrentTask")}
          description={t("game.noBattleActions")}
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
          heroControls={
            <BattleHeroControls
              selectedUnit={panelVm.selectedUnit}
              selectedIsPapyrus={panelVm.selectedIsPapyrus}
              selectedIsUndyne={panelVm.selectedIsUndyne}
              papyrusLineAxis={props.papyrusLineAxis}
              papyrusAxisOptions={PAPYRUS_AXIS_OPTIONS}
              undyneAxis={panelVm.undyneAxis}
              undyneAxisOptions={UNDYNE_AXIS_OPTIONS}
              selectedPapyrusUnbeliever={panelVm.selectedPapyrusUnbeliever}
              selectedPapyrusLongBoneMode={panelVm.selectedPapyrusLongBoneMode}
              canAct={panelVm.canAct}
              onSetPapyrusAxis={panelVm.onSetPapyrusAxis}
              onSetUndyneAxis={panelVm.onSetUndyneAxis}
              onTogglePapyrusLongBone={panelVm.onTogglePapyrusLongBone}
            />
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
              actionMode={props.actionMode}
              targetingMode={props.targetingMode}
              abilityViews={panelVm.abilityViews}
              papyrusLineAxis={props.papyrusLineAxis}
              undyneAxis={panelVm.undyneAxis}
              onMoveRequest={props.onMoveRequest}
              onCancelTargeting={() => props.onSetActionMode(null)}
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
  hideTask = false,
  hideTabs = false,
}) => {
  const { t } = useI18n();
  const [internalTab, setInternalTab] = useState<MatchSideTab>("unit");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: MatchSideTab) => {
    onActiveTabChange?.(tab);
    if (controlledTab === undefined) setInternalTab(tab);
  };
  const effectiveRole = vm.canControlTestRoom && vm.selectedUnit ? vm.selectedUnit.owner : vm.role;
  const rightPanelProps: RightPanelProps = {
    view: vm.view,
    role: effectiveRole,
    selectedUnitId: vm.selectedUnitId,
    actionMode: vm.actionMode,
    targetingMode: vm.targetingMode,
    placeUnitId: vm.placeUnitId,
    moveOptions: vm.moveOptions,
    joined: vm.joined,
    pendingRoll: vm.hasBlockingRoll,
    onHoverAbility: vm.setHoveredAbilityId,
    onHoverActionMode: (mode) => vm.setHoverPreview(mode ? { type: "actionMode", mode } : null),
    onSelectUnit: (id) => {
      vm.setSelectedUnit(id);
      vm.setActionMode(null);
    },
    onSetActionMode: vm.setActionMode,
    onSetPlaceUnit: vm.setPlaceUnitId,
    onMoveRequest: (unitId, mode) => {
      vm.requestMove(unitId, mode);
      if (mode) {
        vm.setMoveOptions(null);
        vm.setActionMode("move");
      }
    },
    pendingLokiLaughtOption: vm.pendingLokiLaughtOption,
    onQueueLokiLaughtOption: vm.queueLokiLaughtOption,
    onSendAction: (action) => {
      vm.sendGameAction(action);
      const preserveMode =
        action.type === "useAbility" &&
        action.abilityId === PAPYRUS_LONG_BONE_ID;
      if (action.type !== "requestMoveOptions" && !preserveMode) {
        vm.setActionMode(null);
      }
    },
    papyrusLineAxis: vm.papyrusLineAxis,
    onSetPapyrusLineAxis: vm.setPapyrusLineAxis,
  };
  const panelVm = buildRightPanelViewModel(rightPanelProps, t);

  useEffect(() => {
    if (vm.pendingRoll || vm.pendingMeta) {
      setActiveTab("actions");
    }
  }, [vm.pendingRoll, vm.pendingMeta]);

  const tabs = [
    { value: "unit" as const, label: t("game.tabsUnit") },
    { value: "actions" as const, label: t("game.tabsActions") },
    { value: "rules" as const, label: t("game.tabsRules") },
    { value: "players" as const, label: t("game.tabsPlayers") },
    { value: "log" as const, label: t("game.tabsLog") },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {!hideTask || !hideTabs ? (
        <div className="shrink-0 space-y-3">
          {!hideTask ? <CurrentTaskPanel vm={vm} /> : null}
          {!hideTabs ? (
            <Tabs
              value={activeTab}
              items={tabs}
              onChange={setActiveTab}
              ariaLabel={t("game.sidePanelTabs")}
            />
          ) : null}
        </div>
      ) : null}

      <div
        className={`scroll-panel min-h-0 flex-1 overflow-y-auto pr-1 ${hideTask && hideTabs ? "" : "mt-3"}`}
      >
        {activeTab === "unit" ? (
          vm.view.phase === "battle" ? (
            <PanelCard variant="parchment" className="p-4">
              <SectionHeader kicker={t("game.selectedUnit")} title={t("game.unitDetails")} />
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
                view={vm.view}
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

        {activeTab === "actions" ? <ActionTab panelVm={panelVm} props={rightPanelProps} /> : null}

        {activeTab === "rules" ? (
          <div className="space-y-3">
            {shouldShowTestRoomPanel(vm.roomMeta?.roomMode, vm.canControlTestRoom) ? (
              <TestRoomPanel vm={vm} />
            ) : null}
            <ActiveFieldInfo view={vm.view} />
            <RuleDeclarationStatus vm={vm} />
            <StatusSection
              view={vm.view}
              selectedUnit={panelVm.selectedVisibleUnit}
              stormActive={panelVm.stormActive}
              forestMarkers={panelVm.forestMarkers}
              isSpectator={panelVm.isSpectator}
              canStartTurn={panelVm.canStartTurn}
              expectedUnitId={panelVm.expectedUnitId}
              legalIntents={panelVm.legalIntents}
              pendingRoll={rightPanelProps.pendingRoll}
              onStartTurn={panelVm.onStartTurn}
            />
            <TurnQueueTracker view={vm.view} playerId={vm.playerId} />
          </div>
        ) : null}

        {activeTab === "players" ? (
          <div className="space-y-3">
            <PlayersRosterSection
              view={vm.view}
              selectedUnitId={vm.selectedUnitId}
              onSelectUnit={rightPanelProps.onSelectUnit}
            />
          </div>
        ) : null}

        {activeTab === "log" ? <EventLog events={vm.events} clientLog={vm.clientLog} /> : null}
      </div>
    </div>
  );
};
