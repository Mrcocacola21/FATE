import { useMemo } from "react";
import { useGameShellAbilityModeTargets } from "./useGameShellAbilityModeTargets";
import { useGameShellBoardPendingTargets } from "./useGameShellBoardPendingTargets";
import { useGameShellBoardUi } from "./useGameShellBoardUi";
import { useGameShellChoicePendingTargets } from "./useGameShellChoicePendingTargets";
import { useGameShellCombatTargets } from "./useGameShellCombatTargets";
import { useGameShellCoreState } from "./useGameShellCoreState";
import { useGameShellHighlightedCells } from "./useGameShellHighlightedCells";
import { useGameShellPreviewEffects } from "./useGameShellPreviewEffects";

export function useGameShellViewModel() {
  const core = useGameShellCoreState();

  const boardPending = useGameShellBoardPendingTargets({
    view: core.view,
    pendingRoll: core.pending.pendingRoll,
    isStakePlacement: core.pending.isStakePlacement,
    stakeSelections: core.stakeSelections,
    isIntimidateChoice: core.pending.isIntimidateChoice,
    isForestTarget: core.pending.isForestTarget,
    isForestMoveDestination: core.pending.isForestMoveDestination,
    isFemtoDivineMoveDestination: core.pending.isFemtoDivineMoveDestination,
    isRiverBoatCarryChoice: core.pending.isRiverBoatCarryChoice,
    isRiverBoatDropDestination: core.pending.isRiverBoatDropDestination,
    isRiverTraLaLaTargetChoice: core.pending.isRiverTraLaLaTargetChoice,
    isRiverTraLaLaDestinationChoice: core.pending.isRiverTraLaLaDestinationChoice,
    isChikatiloPlacement: core.pending.isChikatiloPlacement,
    isGuideTravelerPlacement: core.pending.isGuideTravelerPlacement,
    isJebeKhansShooterTargetChoice: core.pending.isJebeKhansShooterTargetChoice,
    isHassanTrueEnemyTargetChoice: core.pending.isHassanTrueEnemyTargetChoice,
    isAsgoreSoulParadePatienceTargetChoice:
      core.pending.isAsgoreSoulParadePatienceTargetChoice,
    isAsgoreSoulParadePerseveranceTargetChoice:
      core.pending.isAsgoreSoulParadePerseveranceTargetChoice,
    isAsgoreSoulParadeJusticeTargetChoice:
      core.pending.isAsgoreSoulParadeJusticeTargetChoice,
    isAsgoreSoulParadeIntegrityDestination:
      core.pending.isAsgoreSoulParadeIntegrityDestination,
    isHassanAssassinOrderSelection: core.pending.isHassanAssassinOrderSelection,
  });

  const choicePending = useGameShellChoicePendingTargets({
    view: core.view,
    pendingRoll: core.pending.pendingRoll,
    isFriskPacifismChoice: core.pending.isFriskPacifismChoice,
    isFriskPacifismHugsTargetChoice: core.pending.isFriskPacifismHugsTargetChoice,
    isFriskWarmWordsTargetChoice: core.pending.isFriskWarmWordsTargetChoice,
    isFriskGenocideChoice: core.pending.isFriskGenocideChoice,
    isFriskKeenEyeChoice: core.pending.isFriskKeenEyeChoice,
    isLokiLaughtChoice: core.pending.isLokiLaughtChoice,
    isLokiChickenTargetChoice: core.pending.isLokiChickenTargetChoice,
    isLokiMindControlEnemyChoice: core.pending.isLokiMindControlEnemyChoice,
    isLokiMindControlTargetChoice: core.pending.isLokiMindControlTargetChoice,
  });

  const abilityTargets = useGameShellAbilityModeTargets({
    view: core.view,
    effectiveActionMode: core.effectiveActionMode,
    selectedUnit: core.selectedUnit,
  });

  useGameShellPreviewEffects({
    actionMode: core.actionMode,
    selectedUnitId: core.selectedUnitId,
    doraPreviewCenter: core.doraPreviewCenter,
    setDoraPreviewCenter: core.setDoraPreviewCenter,
    doraTargetKeys: abilityTargets.doraTargetKeys,
    jebeHailPreviewCenter: core.jebeHailPreviewCenter,
    setJebeHailPreviewCenter: core.setJebeHailPreviewCenter,
    jebeHailTargetKeys: abilityTargets.jebeHailTargetKeys,
    mettatonPoppinsPreviewCenter: core.mettatonPoppinsPreviewCenter,
    setMettatonPoppinsPreviewCenter: core.setMettatonPoppinsPreviewCenter,
    mettatonLineTargetKeys: abilityTargets.mettatonLineTargetKeys,
    mettatonLaserPreviewTarget: core.mettatonLaserPreviewTarget,
    setMettatonLaserPreviewTarget: core.setMettatonLaserPreviewTarget,
    sansGasterBlasterPreviewTarget: core.sansGasterBlasterPreviewTarget,
    setSansGasterBlasterPreviewTarget: core.setSansGasterBlasterPreviewTarget,
    undyneEnergySpearPreviewTarget: core.undyneEnergySpearPreviewTarget,
    setUndyneEnergySpearPreviewTarget: core.setUndyneEnergySpearPreviewTarget,
    undyneEnergySpearTargetKeys: abilityTargets.undyneEnergySpearTargetKeys,
    kaladinFifthPreviewCenter: core.kaladinFifthPreviewCenter,
    setKaladinFifthPreviewCenter: core.setKaladinFifthPreviewCenter,
    kaladinFifthTargetKeys: abilityTargets.kaladinFifthTargetKeys,
    tisonaPreviewCoord: core.tisonaPreviewCoord,
    setTisonaPreviewCoord: core.setTisonaPreviewCoord,
    tisonaTargetKeys: abilityTargets.tisonaTargetKeys,
    isStakePlacement: core.pending.isStakePlacement,
    pendingRoll: core.pending.pendingRoll,
    setStakeSelections: core.setStakeSelections,
    isHassanAssassinOrderSelection: core.pending.isHassanAssassinOrderSelection,
    setHassanAssassinOrderSelections: core.setHassanAssassinOrderSelections,
    isForestTarget: core.pending.isForestTarget,
    forestPreviewCenter: core.forestPreviewCenter,
    setForestPreviewCenter: core.setForestPreviewCenter,
    forestTargetKeys: boardPending.forestTargetKeys,
  });

  const combatTargets = useGameShellCombatTargets({
    view: core.view,
    selectedUnit: core.selectedUnit,
    selectedUnitId: core.selectedUnitId,
    placeUnitId: core.placeUnitId,
    effectiveActionMode: core.effectiveActionMode,
    pendingMoveForSelected: core.pendingMoveForSelected,
    moveOptions: core.moveOptions,
    hoverActionMode: core.hoverActionMode,
    allowActionHoverPreview: core.allowActionHoverPreview,
  });

  const highlightedCells = useGameShellHighlightedCells({
    effectiveActionMode: core.effectiveActionMode,
    modePreviewKind: core.modePreviewKind,
    ...combatTargets,
    ...abilityTargets,
    ...boardPending,
    ...choicePending,
    view: core.view,
    isStakePlacement: core.pending.isStakePlacement,
    stakeSelections: core.stakeSelections,
    isIntimidateChoice: core.pending.isIntimidateChoice,
    isForestTarget: core.pending.isForestTarget,
    isForestMoveDestination: core.pending.isForestMoveDestination,
    isFemtoDivineMoveDestination: core.pending.isFemtoDivineMoveDestination,
    isRiverBoatCarryChoice: core.pending.isRiverBoatCarryChoice,
    isRiverBoatDropDestination: core.pending.isRiverBoatDropDestination,
    isRiverTraLaLaTargetChoice: core.pending.isRiverTraLaLaTargetChoice,
    isRiverTraLaLaDestinationChoice: core.pending.isRiverTraLaLaDestinationChoice,
    isChikatiloPlacement: core.pending.isChikatiloPlacement,
    isGuideTravelerPlacement: core.pending.isGuideTravelerPlacement,
    isJebeKhansShooterTargetChoice: core.pending.isJebeKhansShooterTargetChoice,
    isHassanTrueEnemyTargetChoice: core.pending.isHassanTrueEnemyTargetChoice,
    isAsgoreSoulParadePatienceTargetChoice:
      core.pending.isAsgoreSoulParadePatienceTargetChoice,
    isAsgoreSoulParadePerseveranceTargetChoice:
      core.pending.isAsgoreSoulParadePerseveranceTargetChoice,
    isAsgoreSoulParadeJusticeTargetChoice:
      core.pending.isAsgoreSoulParadeJusticeTargetChoice,
    isAsgoreSoulParadeIntegrityDestination:
      core.pending.isAsgoreSoulParadeIntegrityDestination,
    isHassanAssassinOrderSelection: core.pending.isHassanAssassinOrderSelection,
    hassanAssassinOrderSelections: core.hassanAssassinOrderSelections,
    isLokiChickenTargetChoice: core.pending.isLokiChickenTargetChoice,
    isLokiMindControlEnemyChoice: core.pending.isLokiMindControlEnemyChoice,
    isLokiMindControlTargetChoice: core.pending.isLokiMindControlTargetChoice,
    isFriskPacifismHugsTargetChoice: core.pending.isFriskPacifismHugsTargetChoice,
    isFriskWarmWordsTargetChoice: core.pending.isFriskWarmWordsTargetChoice,
    selectedUnit: core.selectedUnit,
    pendingMoveForSelected: core.pendingMoveForSelected,
    moveOptions: core.moveOptions,
    tisonaPreviewCoord: core.tisonaPreviewCoord,
  });

  const boardUi = useGameShellBoardUi({
    ...core.pending,
    ...boardPending,
    ...choicePending,
    ...abilityTargets,
    ...combatTargets,
    view: core.view,
    playerId: core.playerId,
    joined: core.joined,
    isSpectator: core.isSpectator,
    actionMode: core.actionMode,
    placeUnitId: core.placeUnitId,
    sendGameAction: core.sendGameAction,
    setActionMode: core.setActionMode,
    setPlaceUnitId: core.setPlaceUnitId,
    setMoveOptions: core.setMoveOptions,
    papyrusLineAxis: core.papyrusLineAxis,
    sendAction: core.sendAction,
    setStakeSelections: core.setStakeSelections,
    setHassanAssassinOrderSelections: core.setHassanAssassinOrderSelections,
    doraPreviewCenter: core.doraPreviewCenter,
    mettatonPoppinsPreviewCenter: core.mettatonPoppinsPreviewCenter,
    mettatonLaserPreviewTarget: core.mettatonLaserPreviewTarget,
    sansGasterBlasterPreviewTarget: core.sansGasterBlasterPreviewTarget,
    undyneEnergySpearPreviewTarget: core.undyneEnergySpearPreviewTarget,
    jebeHailPreviewCenter: core.jebeHailPreviewCenter,
    kaladinFifthPreviewCenter: core.kaladinFifthPreviewCenter,
    forestPreviewCenter: core.forestPreviewCenter,
    setDoraPreviewCenter: core.setDoraPreviewCenter,
    setMettatonPoppinsPreviewCenter: core.setMettatonPoppinsPreviewCenter,
    setMettatonLaserPreviewTarget: core.setMettatonLaserPreviewTarget,
    setSansGasterBlasterPreviewTarget: core.setSansGasterBlasterPreviewTarget,
    setUndyneEnergySpearPreviewTarget: core.setUndyneEnergySpearPreviewTarget,
    setJebeHailPreviewCenter: core.setJebeHailPreviewCenter,
    setKaladinFifthPreviewCenter: core.setKaladinFifthPreviewCenter,
    setTisonaPreviewCoord: core.setTisonaPreviewCoord,
    setForestPreviewCenter: core.setForestPreviewCenter,
    selectedUnit: core.selectedUnit,
  });

  return useMemo(
    () => ({
      ...core,
      ...core.pending,
      ...boardPending,
      ...choicePending,
      ...abilityTargets,
      ...combatTargets,
      ...boardUi,
      highlightedCells,
    }),
    [core, boardPending, choicePending, abilityTargets, combatTargets, boardUi, highlightedCells]
  );
}
