import type { PapyrusLineAxis, PlayerId } from "rules";
import { HERO_CATALOG } from "../../../figures/catalog";
import {
  ARENA_STORM_ID,
  CHIKATILO_ID,
  FALSE_TRAIL_TOKEN_ID,
  FEMTO_ID,
  FOREST_AURA_RADIUS,
  KALADIN_ID,
  LECHY_ID,
  METTATON_ID,
  PAPYRUS_ID,
  PAPYRUS_LONG_BONE_ID,
  PAPYRUS_ORANGE_BONE_ID,
  RIVER_PERSON_ID,
  UNDYNE_ID,
} from "../../../rulesHints";
import type { ActionPreviewMode } from "../../../store";
import { DEFAULT_ECONOMY } from "./rightPanelConstants";
import { isActionableAbility, isRangedSingleTargetClass } from "./rightPanelHelpers";
import type { RightPanelProps } from "./types";

export function buildRightPanelViewModel(params: RightPanelProps) {
  const {
    view,
    role,
    selectedUnitId,
    actionMode,
    moveOptions,
    joined,
    pendingRoll,
    onSelectUnit,
    onSetActionMode,
    onMoveRequest,
    onSendAction,
    onHoverActionMode,
    papyrusLineAxis,
    onSetPapyrusLineAxis,
  } = params;

  const playerId: PlayerId | null = role === "P1" || role === "P2" ? role : null;
  const isSpectator = role === "spectator";
  const friendlyUnits = Object.values(view.units).filter((unit) =>
    playerId ? unit.owner === playerId : false
  );
  const hasFalseTrailToken = friendlyUnits.some(
    (unit) => unit.heroId === FALSE_TRAIL_TOKEN_ID
  );
  const unplacedUnits = friendlyUnits.filter((unit) => {
    if (unit.position) return false;
    if (hasFalseTrailToken && unit.heroId === CHIKATILO_ID) return false;
    return true;
  });
  const selectedUnit = friendlyUnits.find((unit) => unit.id === selectedUnitId) ?? null;
  const heroDefinition = selectedUnit?.heroId
    ? HERO_CATALOG.find((hero) => hero.id === selectedUnit.heroId)
    : undefined;
  const selectedHeroName = selectedUnit
    ? heroDefinition?.name ??
      (selectedUnit.heroId === FEMTO_ID ? "Femto" : selectedUnit.id)
    : null;
  const forestMarkers =
    Array.isArray(view.forestMarkers) && view.forestMarkers.length > 0
      ? view.forestMarkers
      : view.forestMarker
      ? [view.forestMarker]
      : [];
  const stormActive = view.arenaId === ARENA_STORM_ID;
  const selectedInsideForest =
    !!selectedUnit?.position &&
    forestMarkers.some(
      (marker) =>
        Math.max(
          Math.abs(selectedUnit.position!.col - marker.position.col),
          Math.abs(selectedUnit.position!.row - marker.position.row)
        ) <= FOREST_AURA_RADIUS
    );
  const selectedStormExempt =
    stormActive &&
    !!selectedUnit &&
    (selectedUnit.heroId === LECHY_ID ||
      selectedUnit.heroId === RIVER_PERSON_ID ||
      selectedInsideForest);
  const selectedLegalAttackTargets = selectedUnit
    ? view.legal?.attackTargetsByUnitId[selectedUnit.id] ?? []
    : [];
  const abilityViews = selectedUnit
    ? view.abilitiesByUnitId?.[selectedUnit.id] ?? []
    : [];
  const actionableAbilities = abilityViews.filter(isActionableAbility);
  const moveModeOptions =
    !pendingRoll && moveOptions && selectedUnit && moveOptions.unitId === selectedUnit.id
      ? moveOptions.modes ?? null
      : null;

  const queue = view.turnQueue?.length ? view.turnQueue : view.turnOrder;
  const queueIndex = view.turnQueue?.length
    ? view.turnQueueIndex
    : view.turnOrderIndex;
  const expectedUnitId = queue?.[queueIndex];
  const canStartTurn = !!(
    joined &&
    !pendingRoll &&
    !isSpectator &&
    view.phase === "battle" &&
    !view.activeUnitId &&
    expectedUnitId &&
    friendlyUnits.some((unit) => unit.id === expectedUnitId)
  );

  const isMyTurn = playerId ? view.currentPlayer === playerId : false;
  const isActive = selectedUnit && view.activeUnitId === selectedUnit.id;
  const canAct =
    joined && !pendingRoll && !isSpectator && isMyTurn && !!selectedUnit && isActive;

  const economy = selectedUnit?.turn ?? DEFAULT_ECONOMY;
  const legalIntents = view.legalIntents;

  const canStealth =
    selectedUnit?.heroId !== METTATON_ID &&
    (selectedUnit?.class === "assassin" ||
      selectedUnit?.class === "archer" ||
      selectedUnit?.heroId === LECHY_ID ||
      !!selectedUnit?.asgorePatienceStealthActive);
  const selectedMettatonRating =
    selectedUnit?.heroId === METTATON_ID
      ? Math.max(0, selectedUnit.mettatonRating ?? 0)
      : null;
  const stormRangedAttackBlocked =
    canAct &&
    !!selectedUnit?.position &&
    stormActive &&
    !selectedStormExempt &&
    isRangedSingleTargetClass(selectedUnit.class) &&
    selectedLegalAttackTargets.length === 0;
  const attackDisabledReason = stormRangedAttackBlocked
    ? "Storm restricts this unit to adjacent attacks."
    : undefined;

  const moveDisabled = !canAct || economy.moveUsed;
  const attackDisabled =
    !canAct || economy.attackUsed || economy.actionUsed || stormRangedAttackBlocked;
  const stealthDisabled = !canAct || economy.stealthUsed || !canStealth;
  const searchMoveDisabled = !canAct || !legalIntents?.canSearchMove;
  const searchActionDisabled = !canAct || !legalIntents?.canSearchAction;

  const moveRoll =
    (view.pendingMove && view.pendingMove.unitId === selectedUnit?.id
      ? view.pendingMove.roll
      : null) ??
    (moveOptions && moveOptions.unitId === selectedUnit?.id
      ? moveOptions.roll
      : null);

  const selectedIsPapyrus = selectedUnit?.heroId === PAPYRUS_ID;
  const selectedIsUndyne = selectedUnit?.heroId === UNDYNE_ID;
  const selectedPapyrusUnbeliever =
    selectedIsPapyrus && !!selectedUnit?.papyrusUnbelieverActive;
  const selectedPapyrusBoneMode =
    selectedUnit?.papyrusBoneMode === "orange" ? "orange" : "blue";
  const selectedPapyrusLongBoneMode = !!selectedUnit?.papyrusLongBoneMode;
  const undyneAxis = papyrusLineAxis === "col" ? "col" : "row";

  const placementEnabled =
    joined && !pendingRoll && !isSpectator && isMyTurn && view.phase === "placement";

  const onModePreview = (mode: ActionPreviewMode | null) => {
    if (actionMode) return;
    onHoverActionMode(mode);
  };

  const onToggleMode = (mode: ActionPreviewMode) => {
    onSetActionMode(actionMode === mode ? null : mode);
  };

  const onSetPapyrusAxis = (axis: PapyrusLineAxis) => {
    onSetPapyrusLineAxis(axis);
    if (!selectedUnit || !selectedPapyrusUnbeliever || !canAct) {
      return;
    }
    onSendAction({
      type: "useAbility",
      unitId: selectedUnit.id,
      abilityId: PAPYRUS_LONG_BONE_ID,
      payload: {
        enabled: selectedPapyrusLongBoneMode,
        axis,
      },
    });
  };

  const onMoveClick = () => {
    if (!selectedUnit) return;
    if (actionMode === "move") {
      onSetActionMode(null);
      return;
    }
    if (
      selectedUnit.class === "trickster" ||
      selectedUnit.class === "berserker" ||
      selectedUnit.heroId === KALADIN_ID ||
      selectedUnit.transformed
    ) {
      onMoveRequest(selectedUnit.id);
      return;
    }
    onToggleMode("move");
  };

  const onUseAbility = (abilityId: string) => {
    if (!selectedUnit) return;
    onSendAction({
      type: "useAbility",
      unitId: selectedUnit.id,
      abilityId,
    });
  };

  return {
    isSpectator,
    friendlyUnits,
    unplacedUnits,
    selectedUnit,
    selectedHeroName,
    showUnitIdInClassLabel: !!heroDefinition,
    forestMarkers,
    stormActive,
    selectedInsideForest,
    selectedStormExempt,
    abilityViews,
    actionableAbilities,
    moveModeOptions,
    expectedUnitId,
    canStartTurn,
    isMyTurn,
    canAct,
    economy,
    legalIntents,
    selectedMettatonRating,
    attackDisabledReason,
    moveDisabled,
    attackDisabled,
    stealthDisabled,
    searchMoveDisabled,
    searchActionDisabled,
    moveRoll,
    selectedIsPapyrus,
    selectedIsUndyne,
    selectedPapyrusUnbeliever,
    selectedPapyrusBoneMode,
    selectedPapyrusLongBoneMode,
    undyneAxis,
    placementEnabled,
    onModePreview,
    onToggleMode,
    onSetPapyrusAxis,
    onMoveClick,
    onUseAbility,
    onStartTurn: (unitId: string) => onSendAction({ type: "unitStartTurn", unitId }),
    onSearchMoveClick: () => {
      if (!selectedUnit) return;
      onSendAction({
        type: "searchStealth",
        unitId: selectedUnit.id,
        mode: "move",
      });
    },
    onSearchActionClick: () => {
      if (!selectedUnit) return;
      onSendAction({
        type: "searchStealth",
        unitId: selectedUnit.id,
        mode: "action",
      });
    },
    onStealthClick: () => {
      if (!selectedUnit) return;
      onSendAction({ type: "enterStealth", unitId: selectedUnit.id });
    },
    onSetUndyneAxis: (axis: "row" | "col") => onSetPapyrusLineAxis(axis),
    onSetPapyrusBoneType: (boneType: "blue" | "orange") => {
      if (!selectedUnit) return;
      onSendAction({
        type: "useAbility",
        unitId: selectedUnit.id,
        abilityId: PAPYRUS_ORANGE_BONE_ID,
        payload: { boneType },
      });
    },
    onTogglePapyrusLongBone: () => {
      if (!selectedUnit) return;
      onSendAction({
        type: "useAbility",
        unitId: selectedUnit.id,
        abilityId: PAPYRUS_LONG_BONE_ID,
        payload: {
          enabled: !selectedPapyrusLongBoneMode,
          axis: papyrusLineAxis,
        },
      });
    },
    onEndTurn: () => onSendAction({ type: "endTurn" }),
    onClear: () => {
      onHoverActionMode(null);
      onSetActionMode(null);
      onSelectUnit(null);
    },
  };
}
