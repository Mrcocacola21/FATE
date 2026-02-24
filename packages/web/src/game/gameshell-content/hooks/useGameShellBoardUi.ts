import { createCellClickHandler, createCellHoverHandler } from "../cellHandlers";
import { PAPYRUS_ID } from "../../../rulesHints";

export function useGameShellBoardUi(params: any) {
  const {
    view,
    playerId,
    joined,
    isSpectator,
    hasBlockingRoll,
    boardSelectionPending,
    isStakePlacement,
    stakeLegalKeys,
    stakeLimit,
    setStakeSelections,
    isIntimidateChoice,
    intimidateKeys,
    pendingRoll,
    isForestTarget,
    forestTargetKeys,
    isForestMoveDestination,
    forestMoveDestinationKeys,
    isFemtoDivineMoveDestination,
    femtoDivineMoveKeys,
    isRiverBoatCarryChoice,
    riverBoatCarryOptionIds,
    isRiverBoatDropDestination,
    riverBoatDropDestinationKeys,
    isRiverTraLaLaTargetChoice,
    riverTraLaLaTargetIds,
    isRiverTraLaLaDestinationChoice,
    riverTraLaLaDestinationKeys,
    isChikatiloPlacement,
    chikatiloPlacementKeys,
    isGuideTravelerPlacement,
    guideTravelerPlacementKeys,
    isJebeKhansShooterTargetChoice,
    jebeKhansShooterTargetIds,
    isHassanTrueEnemyTargetChoice,
    hassanTrueEnemyTargetIds,
    isAsgoreSoulParadePatienceTargetChoice,
    asgorePatienceTargetIds,
    isAsgoreSoulParadePerseveranceTargetChoice,
    asgorePerseveranceTargetIds,
    isAsgoreSoulParadeJusticeTargetChoice,
    asgoreJusticeTargetIds,
    isAsgoreSoulParadeIntegrityDestination,
    asgoreIntegrityDestinationKeys,
    isFriskPacifismHugsTargetChoice,
    friskPacifismHugsTargetIds,
    isFriskWarmWordsTargetChoice,
    friskWarmWordsTargetIds,
    isLokiChickenTargetChoice,
    lokiChickenTargetIds,
    isLokiMindControlEnemyChoice,
    lokiMindControlEnemyIds,
    isLokiMindControlTargetChoice,
    lokiMindControlTargetIds,
    isHassanAssassinOrderSelection,
    hassanAssassinOrderEligibleIds,
    setHassanAssassinOrderSelections,
    actionMode,
    placeUnitId,
    legalPlacementCoords,
    sendGameAction,
    setActionMode,
    setPlaceUnitId,
    selectedUnitId,
    legalMoveCoords,
    setMoveOptions,
    invadeTimeKeys,
    legalAttackTargets,
    gutsRangedTargetIds,
    asgoreFireballTargetIds,
    undyneSpearThrowTargetIds,
    hassanTrueEnemyCandidateIds,
    guideTravelerTargetIds,
    papyrusLongBoneAttackTargetIds,
    assassinMarkTargetIds,
    doraTargetKeys,
    mettatonLineTargetKeys,
    undyneEnergySpearTargetKeys,
    jebeHailTargetKeys,
    kaladinFifthTargetKeys,
    tisonaTargetKeys,
    papyrusLineAxis,
    sendAction,
    doraPreviewCenter,
    mettatonPoppinsPreviewCenter,
    mettatonLaserPreviewTarget,
    sansGasterBlasterPreviewTarget,
    undyneEnergySpearPreviewTarget,
    jebeHailPreviewCenter,
    kaladinFifthPreviewCenter,
    forestPreviewCenter,
    setDoraPreviewCenter,
    setMettatonPoppinsPreviewCenter,
    setMettatonLaserPreviewTarget,
    setSansGasterBlasterPreviewTarget,
    setUndyneEnergySpearPreviewTarget,
    setJebeHailPreviewCenter,
    setKaladinFifthPreviewCenter,
    setTisonaPreviewCoord,
    setForestPreviewCenter,
    selectedUnit,
  } = params;

  const handleCellClick = createCellClickHandler({
    view,
    playerId,
    joined,
    isSpectator,
    hasBlockingRoll,
    boardSelectionPending,
    isStakePlacement,
    stakeLegalKeys,
    stakeLimit,
    setStakeSelections,
    isIntimidateChoice,
    intimidateKeys,
    pendingRoll,
    isForestTarget,
    forestTargetKeys,
    isForestMoveDestination,
    forestMoveDestinationKeys,
    isFemtoDivineMoveDestination,
    femtoDivineMoveKeys,
    isRiverBoatCarryChoice,
    riverBoatCarryOptionIds,
    isRiverBoatDropDestination,
    riverBoatDropDestinationKeys,
    isRiverTraLaLaTargetChoice,
    riverTraLaLaTargetIds,
    isRiverTraLaLaDestinationChoice,
    riverTraLaLaDestinationKeys,
    isChikatiloPlacement,
    chikatiloPlacementKeys,
    isGuideTravelerPlacement,
    guideTravelerPlacementKeys,
    isJebeKhansShooterTargetChoice,
    jebeKhansShooterTargetIds,
    isHassanTrueEnemyTargetChoice,
    hassanTrueEnemyTargetIds,
    isAsgoreSoulParadePatienceTargetChoice,
    asgorePatienceTargetIds,
    isAsgoreSoulParadePerseveranceTargetChoice,
    asgorePerseveranceTargetIds,
    isAsgoreSoulParadeJusticeTargetChoice,
    asgoreJusticeTargetIds,
    isAsgoreSoulParadeIntegrityDestination,
    asgoreIntegrityDestinationKeys,
    isFriskPacifismHugsTargetChoice,
    friskPacifismHugsTargetIds,
    isFriskWarmWordsTargetChoice,
    friskWarmWordsTargetIds,
    isLokiChickenTargetChoice,
    lokiChickenTargetIds,
    isLokiMindControlEnemyChoice,
    lokiMindControlEnemyIds,
    isLokiMindControlTargetChoice,
    lokiMindControlTargetIds,
    isHassanAssassinOrderSelection,
    hassanAssassinOrderEligibleIds,
    setHassanAssassinOrderSelections,
    actionMode,
    placeUnitId,
    legalPlacementCoords,
    sendGameAction,
    setActionMode,
    setPlaceUnitId,
    selectedUnitId,
    legalMoveCoords,
    setMoveOptions,
    invadeTimeKeys,
    legalAttackTargets,
    gutsRangedTargetIds,
    asgoreFireballTargetIds,
    undyneSpearThrowTargetIds,
    hassanTrueEnemyCandidateIds,
    guideTravelerTargetIds,
    papyrusLongBoneAttackTargetIds,
    assassinMarkTargetIds,
    doraTargetKeys,
    mettatonLineTargetKeys,
    undyneEnergySpearTargetKeys,
    jebeHailTargetKeys,
    kaladinFifthTargetKeys,
    tisonaTargetKeys,
    papyrusLineAxis,
    sendAction,
  });

  const handleCellHover = createCellHoverHandler({
    actionMode,
    isForestTarget,
    doraTargetKeys,
    mettatonLineTargetKeys,
    undyneEnergySpearTargetKeys,
    jebeHailTargetKeys,
    kaladinFifthTargetKeys,
    tisonaTargetKeys,
    forestTargetKeys,
    setDoraPreviewCenter,
    setMettatonPoppinsPreviewCenter,
    setMettatonLaserPreviewTarget,
    setSansGasterBlasterPreviewTarget,
    setUndyneEnergySpearPreviewTarget,
    setJebeHailPreviewCenter,
    setKaladinFifthPreviewCenter,
    setTisonaPreviewCoord,
    setForestPreviewCenter,
  });
  const boardPreviewCenter =
    actionMode === "dora"
      ? doraPreviewCenter
      : actionMode === "mettatonPoppins"
      ? mettatonPoppinsPreviewCenter
      : actionMode === "mettatonLaser"
      ? mettatonLaserPreviewTarget
      : actionMode === "sansGasterBlaster"
      ? sansGasterBlasterPreviewTarget
      : actionMode === "undyneEnergySpear"
      ? undyneEnergySpearPreviewTarget
      : actionMode === "jebeHailOfArrows"
      ? jebeHailPreviewCenter
      : actionMode === "kaladinFifth"
      ? kaladinFifthPreviewCenter
      : isForestTarget
      ? forestPreviewCenter
      : null;
  const boardDisabled =
    !joined ||
    isSpectator ||
    view?.phase === "lobby" ||
    (hasBlockingRoll && !boardSelectionPending);
  const papyrusLongBoneAttackMode =
    actionMode === "attack" &&
    selectedUnit?.heroId === PAPYRUS_ID &&
    !!selectedUnit.papyrusUnbelieverActive &&
    !!selectedUnit.papyrusLongBoneMode;
  const allowUnitPick =
    !boardSelectionPending &&
    actionMode !== "dora" &&
    actionMode !== "mettatonPoppins" &&
    actionMode !== "mettatonLaser" &&
    actionMode !== "sansGasterBlaster" &&
    actionMode !== "undyneSpearThrow" &&
    actionMode !== "undyneEnergySpear" &&
    actionMode !== "jebeHailOfArrows" &&
    actionMode !== "kaladinFifth" &&
    actionMode !== "tisona" &&
    actionMode !== "demonDuelist" &&
    actionMode !== "assassinMark" &&
    actionMode !== "guideTraveler" &&
    actionMode !== "jebeKhansShooter" &&
    actionMode !== "gutsArbalet" &&
    actionMode !== "gutsCannon" &&
    actionMode !== "asgoreFireball" &&
    actionMode !== "odinSleipnir" &&
    actionMode !== "hassanTrueEnemy" &&
    actionMode !== "papyrusCoolGuy" &&
    !papyrusLongBoneAttackMode;

  return {
    handleCellClick,
    handleCellHover,
    boardPreviewCenter,
    boardDisabled,
    allowUnitPick,
  };
}
