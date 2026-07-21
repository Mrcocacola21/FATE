import { createCellClickHandler, createCellHoverHandler } from "../cellHandlers";
import { PAPYRUS_ID } from "../../../rulesHints";
import { useEffect, useState } from "react";

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
    isOdinSleipnirDestination,
    odinSleipnirKeys,
    isChargedImpulseTargetChoice,
    chargedImpulseTargetKeys,
    isRiverBoatCarryChoice,
    riverBoatCarryOptionIds,
    isRiverBoatDestinationChoice,
    riverBoatDestinationKeys,
    isRiverBoatDropDestination,
    riverBoatDropDestinationKeys,
    isRiverTraLaLaTargetChoice,
    riverTraLaLaTargetIds,
    isRiverTraLaLaDestinationChoice,
    riverTraLaLaDestinationKeys,
    isRiverTraLaLaDropDestinationChoice,
    riverTraLaLaDropDestinationKeys,
    isChikatiloPlacement,
    chikatiloPlacementKeys,
    isGroznyTyrantAllyChoice,
    groznyTyrantAllyOptionIds,
    isGroznyTyrantAttackCellChoice,
    groznyTyrantAttackCellOptions,
    groznyTyrantAttackCellKeys,
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
    isFriskPrecisionStrikeTargetChoice,
    friskPrecisionStrikeTargetIds,
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
  const [newHeroAbilityTargetId, setNewHeroAbilityTargetId] = useState<string | null>(null);
  const [zoroAttackTargetIds, setZoroAttackTargetIds] = useState<string[]>([]);
  useEffect(() => {
    if (actionMode !== "duolingoPush" && actionMode !== "zoroOniGiri") {
      setNewHeroAbilityTargetId(null);
    }
  }, [actionMode, selectedUnitId]);
  useEffect(() => {
    if (actionMode !== "attack") setZoroAttackTargetIds([]);
  }, [actionMode, selectedUnitId]);

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
    isOdinSleipnirDestination,
    odinSleipnirKeys,
    isChargedImpulseTargetChoice,
    chargedImpulseTargetKeys,
    isRiverBoatCarryChoice,
    riverBoatCarryOptionIds,
    isRiverBoatDestinationChoice,
    riverBoatDestinationKeys,
    isRiverBoatDropDestination,
    riverBoatDropDestinationKeys,
    isRiverTraLaLaTargetChoice,
    riverTraLaLaTargetIds,
    isRiverTraLaLaDestinationChoice,
    riverTraLaLaDestinationKeys,
    isRiverTraLaLaDropDestinationChoice,
    riverTraLaLaDropDestinationKeys,
    isChikatiloPlacement,
    chikatiloPlacementKeys,
    isGroznyTyrantAllyChoice,
    groznyTyrantAllyOptionIds,
    isGroznyTyrantAttackCellChoice,
    groznyTyrantAttackCellOptions,
    groznyTyrantAttackCellKeys,
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
    isFriskPrecisionStrikeTargetChoice,
    friskPrecisionStrikeTargetIds,
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
    newHeroAbilityTargetId,
    setNewHeroAbilityTargetId,
    zoroAttackTargetIds,
    setZoroAttackTargetIds,
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
    actionMode !== "attack" &&
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
    actionMode !== "asgoreFireParade" &&
    actionMode !== "odinSleipnir" &&
    actionMode !== "hassanTrueEnemy" &&
    actionMode !== "papyrusCoolGuy" &&
    actionMode !== "duolingoPush" &&
    actionMode !== "zoroOniGiri" &&
    actionMode !== "donWindmills" &&
    actionMode !== "jackHolyMother" &&
    !papyrusLongBoneAttackMode;

  return {
    handleCellClick,
    handleCellHover,
    boardPreviewCenter,
    boardDisabled,
    allowUnitPick,
    zoroAttackTargetIds,
  };
}
