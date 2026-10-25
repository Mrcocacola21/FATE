import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { EventLog, MinimalEventLog } from "../../../components/EventLog";
import { PanelCard, SectionHeader } from "../../../components/ui";
import { useI18n } from "../../../i18n";
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
import {
  BattleUnitSummary,
  UnitEffectPanels,
  UnitEffectPills,
} from "../../components/RightPanel/sections/BattleUnitSummary";
import { ActionMenu } from "../../components/RightPanel/ActionMenu";
import { FriendlyUnitsSection } from "../../components/RightPanel/sections/FriendlyUnitsSection";
import { PlacementSection } from "../../components/RightPanel/sections/PlacementSection";
import { CurrentTaskPanel, hasActiveMobileTask } from "./CurrentTaskPanel";
import { PlayersRosterSection } from "./PlayersRosterSection";
import { MatchInfoPanel } from "./MatchInfoPanel";
import { buildMatchPanelModel } from "../matchPanelModel";
import { MinimalTurnStatus } from "../../components/MinimalBattleStatus";

export type MatchSideTab = "unit" | "actions" | "rules" | "players" | "log";

interface SidePanelTabsProps {
  vm: GameShellViewModel;
  activeTab?: MatchSideTab;
  onActiveTabChange?: (tab: MatchSideTab) => void;
  hideTask?: boolean;
  hideTabs?: boolean;
  /** False where the desktop info column already shows queue, field and match state. */
  showMatchInfoTab?: boolean;
  /** The minimal layout drops the Players tab: the turn queue already lists every figure. */
  showPlayersTab?: boolean;
  /** Minimal battle layout: flat panel, underline tabs and the filterable log. */
  minimal?: boolean;
}

function ActionTab({
  panelVm,
  props,
  minimal = false,
}: {
  panelVm: ReturnType<typeof buildRightPanelViewModel>;
  props: RightPanelProps;
  minimal?: boolean;
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
            minimal && panelVm.selectedUnit ? (
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
              variantMode={minimal}
              attackDisabled={panelVm.attackDisabled}
              onAttack={() => panelVm.onToggleMode("attack")}
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
              hideTargeting={minimal}
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
  showMatchInfoTab = true,
  showPlayersTab = true,
  minimal = false,
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

  // A spectator has nothing to control, so the minimal layout drops the Controls tab for them.
  const showActionsTab = !(minimal && vm.isSpectator);

  useEffect(() => {
    if (!showSandbox && showActionsTab && (vm.pendingRoll || vm.pendingMeta)) {
      setActiveTab("actions");
    }
  }, [vm.pendingRoll, vm.pendingMeta, setActiveTab, showSandbox, showActionsTab]);

  // Unit = what the figure is, Actions = what it can do now. Match-wide info sits in the
  // desktop info column; the Rules tab only appears where that column does not.
  const showRulesTab = showSandbox || showMatchInfoTab;
  const tabs = [
    { value: "unit" as const, label: t("game.tabsUnit") },
    ...(showActionsTab ? [{ value: "actions" as const, label: t("game.tabsActions") }] : []),
    { value: "log" as const, label: t("game.tabsLog") },
    ...(showPlayersTab ? [{ value: "players" as const, label: t("game.tabsPlayers") }] : []),
    ...(showRulesTab
      ? [
          {
            value: "rules" as const,
            label: t(showSandbox ? "testRoom.badgeSandbox" : "game.tabsRules"),
          },
        ]
      : []),
  ];
  const requestedTab = controlledTab ?? internalTab;
  const activeTab =
    (requestedTab === "rules" && !showRulesTab) ||
    (requestedTab === "players" && !showPlayersTab) ||
    (requestedTab === "actions" && !showActionsTab)
      ? "unit"
      : requestedTab;

  // In the minimal layout the task card lives in Controls, so a new task brings that tab forward.
  const taskActive = minimal && showActionsTab && hasActiveMobileTask(vm);
  useEffect(() => {
    if (taskActive && !showSandbox) setActiveTab("actions");
  }, [taskActive, setActiveTab, showSandbox]);

  // Tabs share one scroller; start each tab at its top instead of the previous tab's offset.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: 0 });
  }, [activeTab]);

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden ${minimal ? "minimal-side-panel" : ""}`}
    >
      {!hideTask || !hideTabs ? (
        <div className="shrink-0 space-y-3">
          {!hideTask && !minimal ? <CurrentTaskPanel vm={vm} /> : null}
          {!hideTabs ? (
            <Tabs
              value={activeTab}
              items={tabs}
              onChange={setActiveTab}
              ariaLabel={t("game.sidePanelTabs")}
              className={minimal ? "minimal-tabs" : ""}
            />
          ) : null}
          {minimal && !hideTabs ? <MinimalTurnStatus vm={vm} /> : null}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={`scroll-panel min-h-0 flex-1 overflow-y-auto pr-1 ${hideTask && hideTabs ? "" : "mt-3"}`}
      >
        {activeTab === "unit" ? (
          vm.view!.phase === "battle" ? (
            <PanelCard variant="parchment" className={minimal ? "minimal-unit-tab" : "p-4"}>
              {minimal ? null : (
                <SectionHeader kicker={t("game.selectedUnit")} title={t("game.unitDetails")} />
              )}
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
                variant={minimal ? "grimoire" : "classic"}
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
            {minimal && !hideTask ? (
              <div className="minimal-task-card">
                <CurrentTaskPanel vm={vm} />
              </div>
            ) : null}
            <ActionTab panelVm={panelVm} props={rightPanelProps} minimal={minimal} />
          </>
        ) : null}

        {showSandbox ? (
          <div hidden={activeTab !== "rules"} className="mb-3">
            <TestRoomPanel vm={vm} />
          </div>
        ) : null}

        {activeTab === "rules" && showMatchInfoTab ? (
          <MatchInfoPanel vm={vm} model={model} />
        ) : null}

        {activeTab === "players" ? (
          <div className="space-y-3">
            <PlayersRosterSection
              view={vm.view!}
              selectedUnitId={vm.selectedUnitId}
              onSelectUnit={rightPanelProps.onSelectUnit}
            />
          </div>
        ) : null}

        {activeTab === "log" ? (
          minimal ? (
            <MinimalEventLog
              events={vm.events}
              clientLog={vm.clientLog}
              units={vm.view?.rosterUnits}
              playerId={vm.playerId}
            />
          ) : (
            <EventLog events={vm.events} clientLog={vm.clientLog} units={vm.view?.rosterUnits} />
          )
        ) : null}
      </div>
    </div>
  );
};
