import type { FC } from "react";
import type { AbilityView, MoveMode, PapyrusLineAxis, PlayerView, UnitState } from "rules";
import type { ActionMode, ActionPreviewMode, LokiLaughtOption } from "../../../../store";
import type { TargetingMode } from "../../../selectionState";
import type { ForestMarkerView, TurnEconomyState } from "../types";
import { BattleAbilityActions } from "./BattleAbilityActions";
import { BattleActionButtons } from "./BattleActionButtons";
import { BattleBottomHints } from "./BattleBottomHints";
import { BattleHeroControls } from "./BattleHeroControls";
import { BattleTurnButtons } from "./BattleTurnButtons";
import { BattleUnitSummary } from "./BattleUnitSummary";
import { useI18n } from "../../../../i18n";

interface BattleSectionProps {
  view: PlayerView;
  selectedUnit: UnitState | null;
  selectedUnitId: string | null;
  selectedHeroName: string | null;
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
  targetingMode: TargetingMode | null;
  moveDisabled: boolean;
  attackDisabled: boolean;
  attackDisabledReason?: string;
  legalAttackTargetCount?: number;
  legalMoveCount?: number;
  searchMoveDisabled: boolean;
  searchActionDisabled: boolean;
  stealthDisabled: boolean;
  searchMoveReason?: string;
  searchActionReason?: string;
  canAct: boolean;
  canChooseImpulseAxis: boolean;
  lokiLaughtOptionQueued: boolean;
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
  onUseLokiLaughtOption: (option: LokiLaughtOption) => void;
  onSetPapyrusAxis: (axis: PapyrusLineAxis) => void;
  onSetUndyneAxis: (axis: "row" | "col") => void;
  onSetPapyrusBoneType: (boneType: "blue" | "orange") => void;
  onTogglePapyrusLongBone: () => void;
  onEndTurn: () => void;
  onClear: () => void;
  onCancelTargeting: () => void;
}

export const BattleSection: FC<BattleSectionProps> = ({
  view,
  selectedUnit,
  selectedUnitId,
  selectedHeroName,
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
  targetingMode,
  moveDisabled,
  attackDisabled,
  attackDisabledReason,
  legalAttackTargetCount,
  legalMoveCount,
  searchMoveDisabled,
  searchActionDisabled,
  stealthDisabled,
  searchMoveReason,
  searchActionReason,
  canAct,
  canChooseImpulseAxis,
  lokiLaughtOptionQueued,
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
  onUseLokiLaughtOption,
  onSetPapyrusAxis,
  onSetUndyneAxis,
  onSetPapyrusBoneType,
  onTogglePapyrusLongBone,
  onEndTurn,
  onClear,
  onCancelTargeting,
}) => {
  const { t } = useI18n();
  return (
    <div className="panel-card panel-parchment p-4">
      <div>
        <div className="section-kicker">{t("game.selectedUnit")}</div>
        <div className="section-title mt-1">{t("game.unitControls")}</div>
      </div>
      <BattleUnitSummary
        selectedUnit={selectedUnit}
        selectedHeroName={selectedHeroName}
        selectedMettatonRating={selectedMettatonRating}
        forestMarkers={forestMarkers}
        selectedInsideForest={selectedInsideForest}
        stormActive={stormActive}
        selectedStormExempt={selectedStormExempt}
        moveRoll={moveRoll}
        economy={economy}
        abilityViews={abilityViews}
        view={view}
        canAct={canAct}
        pendingRoll={pendingRoll}
        attackDisabledReason={attackDisabledReason}
        legalAttackTargetCount={legalAttackTargetCount}
        legalMoveCount={legalMoveCount}
        onHoverAbility={onHoverAbility}
      />

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-amber-900/10 pt-4 text-xs dark:border-amber-500/15">
        <BattleActionButtons
          actionMode={actionMode}
          targetingActive={!!targetingMode}
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
          view={view}
          actionableAbilities={actionableAbilities}
          selectedUnit={selectedUnit}
          canAct={canAct || canChooseImpulseAxis}
          economy={economy}
          actionMode={actionMode}
          targetingActive={!!targetingMode}
          lokiLaughtOptionQueued={lokiLaughtOptionQueued}
          onUseAbility={onUseAbility}
          onUseLokiLaughtOption={onUseLokiLaughtOption}
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
          targetingMode={targetingMode}
          abilityViews={abilityViews}
          papyrusLineAxis={papyrusLineAxis}
          undyneAxis={undyneAxis}
          onMoveRequest={onMoveRequest}
          onCancelTargeting={onCancelTargeting}
        />
    </div>
  );
};
