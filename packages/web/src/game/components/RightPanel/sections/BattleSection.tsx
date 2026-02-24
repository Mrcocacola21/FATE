import type { FC } from "react";
import type {
  AbilityView,
  MoveMode,
  PapyrusLineAxis,
  UnitState,
} from "rules";
import type { ActionMode, ActionPreviewMode } from "../../../../store";
import type { ForestMarkerView, TurnEconomyState } from "../types";
import { BattleAbilityActions } from "./BattleAbilityActions";
import { BattleActionButtons } from "./BattleActionButtons";
import { BattleBottomHints } from "./BattleBottomHints";
import { BattleHeroControls } from "./BattleHeroControls";
import { BattleTurnButtons } from "./BattleTurnButtons";
import { BattleUnitSummary } from "./BattleUnitSummary";

interface BattleSectionProps {
  selectedUnit: UnitState | null;
  selectedUnitId: string | null;
  selectedHeroName: string | null;
  showUnitIdInClassLabel: boolean;
  selectedMettatonRating: number | null;
  forestMarkers: ForestMarkerView[];
  selectedInsideForest: boolean;
  stormActive: boolean;
  selectedStormExempt: boolean;
  moveRoll: number | null | undefined;
  economy: TurnEconomyState;
  abilityViews: AbilityView[];
  actionableAbilities: AbilityView[];
  actionMode: ActionMode;
  moveDisabled: boolean;
  attackDisabled: boolean;
  attackDisabledReason?: string;
  searchMoveDisabled: boolean;
  searchActionDisabled: boolean;
  stealthDisabled: boolean;
  searchMoveReason?: string;
  searchActionReason?: string;
  canAct: boolean;
  selectedIsPapyrus: boolean;
  selectedIsUndyne: boolean;
  selectedPapyrusUnbeliever: boolean;
  selectedPapyrusBoneMode: "blue" | "orange";
  selectedPapyrusLongBoneMode: boolean;
  papyrusLineAxis: PapyrusLineAxis;
  papyrusAxisOptions: { axis: PapyrusLineAxis; label: string }[];
  undyneAxis: "row" | "col";
  undyneAxisOptions: { axis: "row" | "col"; label: string }[];
  isMyTurn: boolean;
  joined: boolean;
  isSpectator: boolean;
  pendingRoll: boolean;
  moveModeOptions: MoveMode[] | null;
  onMoveRequest: (unitId: string, mode?: MoveMode) => void;
  onHoverAbility: (abilityId: string | null) => void;
  onModePreview: (mode: ActionPreviewMode | null) => void;
  onToggleMode: (mode: ActionPreviewMode) => void;
  onMoveClick: () => void;
  onAttackClick: () => void;
  onSearchMoveClick: () => void;
  onSearchActionClick: () => void;
  onStealthClick: () => void;
  onUseAbility: (abilityId: string) => void;
  onSetPapyrusAxis: (axis: PapyrusLineAxis) => void;
  onSetUndyneAxis: (axis: "row" | "col") => void;
  onSetPapyrusBoneType: (boneType: "blue" | "orange") => void;
  onTogglePapyrusLongBone: () => void;
  onEndTurn: () => void;
  onClear: () => void;
}

export const BattleSection: FC<BattleSectionProps> = ({
  selectedUnit,
  selectedUnitId,
  selectedHeroName,
  showUnitIdInClassLabel,
  selectedMettatonRating,
  forestMarkers,
  selectedInsideForest,
  stormActive,
  selectedStormExempt,
  moveRoll,
  economy,
  abilityViews,
  actionableAbilities,
  actionMode,
  moveDisabled,
  attackDisabled,
  attackDisabledReason,
  searchMoveDisabled,
  searchActionDisabled,
  stealthDisabled,
  searchMoveReason,
  searchActionReason,
  canAct,
  selectedIsPapyrus,
  selectedIsUndyne,
  selectedPapyrusUnbeliever,
  selectedPapyrusBoneMode,
  selectedPapyrusLongBoneMode,
  papyrusLineAxis,
  papyrusAxisOptions,
  undyneAxis,
  undyneAxisOptions,
  isMyTurn,
  joined,
  isSpectator,
  pendingRoll,
  moveModeOptions,
  onMoveRequest,
  onHoverAbility,
  onModePreview,
  onToggleMode,
  onMoveClick,
  onAttackClick,
  onSearchMoveClick,
  onSearchActionClick,
  onStealthClick,
  onUseAbility,
  onSetPapyrusAxis,
  onSetUndyneAxis,
  onSetPapyrusBoneType,
  onTogglePapyrusLongBone,
  onEndTurn,
  onClear,
}) => {
  return (
    <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:border-slate-700/60 dark:bg-slate-900/60 dark:shadow-black/40">
      <div className="text-sm text-slate-600 dark:text-slate-100">
        Active Unit Panel
      </div>
      <BattleUnitSummary
        selectedUnit={selectedUnit}
        selectedHeroName={selectedHeroName}
        showUnitIdInClassLabel={showUnitIdInClassLabel}
        selectedMettatonRating={selectedMettatonRating}
        forestMarkers={forestMarkers}
        selectedInsideForest={selectedInsideForest}
        stormActive={stormActive}
        selectedStormExempt={selectedStormExempt}
        moveRoll={moveRoll}
        economy={economy}
        abilityViews={abilityViews}
        onHoverAbility={onHoverAbility}
      />

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <BattleActionButtons
          actionMode={actionMode}
          moveDisabled={moveDisabled}
          attackDisabled={attackDisabled}
          searchMoveDisabled={searchMoveDisabled}
          searchActionDisabled={searchActionDisabled}
          stealthDisabled={stealthDisabled}
          attackDisabledReason={attackDisabledReason}
          searchMoveReason={searchMoveReason}
          searchActionReason={searchActionReason}
          onMoveClick={onMoveClick}
          onAttackClick={onAttackClick}
          onSearchMoveClick={onSearchMoveClick}
          onSearchActionClick={onSearchActionClick}
          onStealthClick={onStealthClick}
          onModePreview={onModePreview}
        />
        <BattleAbilityActions
          actionableAbilities={actionableAbilities}
          selectedUnit={selectedUnit}
          canAct={canAct}
          economy={economy}
          actionMode={actionMode}
          onUseAbility={onUseAbility}
          onToggleMode={onToggleMode}
          onModePreview={onModePreview}
          onHoverAbility={onHoverAbility}
        />
        <BattleHeroControls
          selectedUnit={selectedUnit}
          selectedIsPapyrus={selectedIsPapyrus}
          selectedIsUndyne={selectedIsUndyne}
          papyrusLineAxis={papyrusLineAxis}
          papyrusAxisOptions={papyrusAxisOptions}
          undyneAxis={undyneAxis}
          undyneAxisOptions={undyneAxisOptions}
          selectedPapyrusUnbeliever={selectedPapyrusUnbeliever}
          selectedPapyrusBoneMode={selectedPapyrusBoneMode}
          selectedPapyrusLongBoneMode={selectedPapyrusLongBoneMode}
          canAct={canAct}
          onSetPapyrusAxis={onSetPapyrusAxis}
          onSetUndyneAxis={onSetUndyneAxis}
          onSetPapyrusBoneType={onSetPapyrusBoneType}
          onTogglePapyrusLongBone={onTogglePapyrusLongBone}
        />
        <BattleTurnButtons
          isMyTurn={isMyTurn}
          joined={joined}
          isSpectator={isSpectator}
          pendingRoll={pendingRoll}
          onEndTurn={onEndTurn}
          onClear={onClear}
        />
      </div>

      <BattleBottomHints
        moveModeOptions={moveModeOptions}
        selectedUnitId={selectedUnitId}
        moveDisabled={moveDisabled}
        actionMode={actionMode}
        papyrusLineAxis={papyrusLineAxis}
        undyneAxis={undyneAxis}
        onMoveRequest={onMoveRequest}
      />
    </div>
  );
};
