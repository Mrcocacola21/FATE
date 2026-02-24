import type { FC } from "react";
import { PAPYRUS_AXIS_OPTIONS, UNDYNE_AXIS_OPTIONS } from "./rightPanelConstants";
import { buildRightPanelViewModel } from "./rightPanelViewModel";
import { BattleSection } from "./sections/BattleSection";
import { FriendlyUnitsSection } from "./sections/FriendlyUnitsSection";
import { PlacementSection } from "./sections/PlacementSection";
import { StatusSection } from "./sections/StatusSection";
import type { RightPanelProps } from "./types";

export type { RightPanelProps } from "./types";

export const RightPanelContent: FC<RightPanelProps> = (props) => {
  const {
    view,
    selectedUnitId,
    actionMode,
    placeUnitId,
    joined,
    pendingRoll,
    onSelectUnit,
    onSetActionMode,
    onSetPlaceUnit,
    onMoveRequest,
    onHoverAbility,
    papyrusLineAxis,
  } = props;

  const vm = buildRightPanelViewModel(props);

  return (
    <div className="space-y-6">
      <StatusSection
        view={view}
        stormActive={vm.stormActive}
        forestMarkers={vm.forestMarkers}
        isSpectator={vm.isSpectator}
        canStartTurn={vm.canStartTurn}
        expectedUnitId={vm.expectedUnitId}
        legalIntents={vm.legalIntents}
        economy={vm.economy}
        pendingRoll={pendingRoll}
        onStartTurn={vm.onStartTurn}
      />

      {view.phase === "placement" && (
        <PlacementSection
          unplacedUnits={vm.unplacedUnits}
          friendlyUnits={vm.friendlyUnits}
          placeUnitId={placeUnitId}
          actionMode={actionMode}
          placementEnabled={vm.placementEnabled}
          joined={joined}
          pendingRoll={pendingRoll}
          isSpectator={vm.isSpectator}
          isMyTurn={vm.isMyTurn}
          onSetPlaceUnit={onSetPlaceUnit}
          onSetActionMode={onSetActionMode}
        />
      )}

      {view.phase === "battle" && (
        <BattleSection
          selectedUnit={vm.selectedUnit}
          selectedUnitId={selectedUnitId}
          selectedHeroName={vm.selectedHeroName}
          showUnitIdInClassLabel={vm.showUnitIdInClassLabel}
          selectedMettatonRating={vm.selectedMettatonRating}
          forestMarkers={vm.forestMarkers}
          selectedInsideForest={vm.selectedInsideForest}
          stormActive={vm.stormActive}
          selectedStormExempt={vm.selectedStormExempt}
          moveRoll={vm.moveRoll}
          economy={vm.economy}
          abilityViews={vm.abilityViews}
          actionableAbilities={vm.actionableAbilities}
          actionMode={actionMode}
          moveDisabled={vm.moveDisabled}
          attackDisabled={vm.attackDisabled}
          attackDisabledReason={vm.attackDisabledReason}
          searchMoveDisabled={vm.searchMoveDisabled}
          searchActionDisabled={vm.searchActionDisabled}
          stealthDisabled={vm.stealthDisabled}
          searchMoveReason={vm.legalIntents?.searchMoveReason}
          searchActionReason={vm.legalIntents?.searchActionReason}
          canAct={vm.canAct}
          selectedIsPapyrus={vm.selectedIsPapyrus}
          selectedIsUndyne={vm.selectedIsUndyne}
          selectedPapyrusUnbeliever={vm.selectedPapyrusUnbeliever}
          selectedPapyrusBoneMode={vm.selectedPapyrusBoneMode}
          selectedPapyrusLongBoneMode={vm.selectedPapyrusLongBoneMode}
          papyrusLineAxis={papyrusLineAxis}
          papyrusAxisOptions={PAPYRUS_AXIS_OPTIONS}
          undyneAxis={vm.undyneAxis}
          undyneAxisOptions={UNDYNE_AXIS_OPTIONS}
          isMyTurn={vm.isMyTurn}
          joined={joined}
          isSpectator={vm.isSpectator}
          pendingRoll={pendingRoll}
          moveModeOptions={vm.moveModeOptions}
          onMoveRequest={onMoveRequest}
          onHoverAbility={onHoverAbility}
          onModePreview={vm.onModePreview}
          onToggleMode={vm.onToggleMode}
          onMoveClick={vm.onMoveClick}
          onAttackClick={() => vm.onToggleMode("attack")}
          onSearchMoveClick={vm.onSearchMoveClick}
          onSearchActionClick={vm.onSearchActionClick}
          onStealthClick={vm.onStealthClick}
          onUseAbility={vm.onUseAbility}
          onSetPapyrusAxis={vm.onSetPapyrusAxis}
          onSetUndyneAxis={vm.onSetUndyneAxis}
          onSetPapyrusBoneType={vm.onSetPapyrusBoneType}
          onTogglePapyrusLongBone={vm.onTogglePapyrusLongBone}
          onEndTurn={vm.onEndTurn}
          onClear={vm.onClear}
        />
      )}

      <FriendlyUnitsSection
        friendlyUnits={vm.friendlyUnits}
        selectedUnitId={selectedUnitId}
        onSelectUnit={onSelectUnit}
      />
    </div>
  );
};
