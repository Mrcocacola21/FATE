import { testActionModuleBoundaries } from "./core/boundaries.test";
import {
  testCombatVisualChainCompletesOnlyAfterNestedFollowups,
  testCombatVisualChainIdsStayStableAcrossRelatedRolls,
  testCombatVisualMetadataProjectionDoesNotLeakHiddenUnits,
} from "./core/combatVisualChain.test";
import {
  testDonWindmillsAdjacentTargetsAndResolution,
  testNewPlayableBatchLineAndRevealEffects,
  testNewPlayableBatchCombatCountersAndReactions,
  testNewPlayableBatchStatsResourcesAndMovement,
  testArtemidaAndKanekiMovementModes,
  testArtemidaSilverSickleStopsAtSelectedEndpoint,
  testNewPlayableBatchTransactionalActives,
  testLucheRadiancePassiveAndLightRayModes,
} from "./heroes/newPlayableBatch.test";
import {
  testJackCoveringTracksSixthSnareFlow,
  testJackKeepsAssassinStealthBaseDamageWithoutOldBonus,
  testJackSnareActivatesOncePerTarget,
  testJackSnareIsRemovedWithDeadTarget,
} from "./heroes/jack.test";
import {
  testActiveQueuedRollProjectsAsPending,
  testPendingRollActionsExportsStable,
  testPendingRollResolverCoverage,
  testPendingRollPresentationMetadata,
  testUnknownPendingRollKindDoesNotClear,
} from "./core/pendingRoll.test";
import {
  testChargedLineImpulsesCreateForcedPendingAtTurnStart,
  testEventDrivenImpulsesAutoTrigger,
  testImpulseMetadataAllAutoManaged,
} from "./core/impulses.test";
import {
  testPlacementToBattleAndTurnOrder,
  testLobbyReadyAndStartRequiresBothReady,
  testInitiativeRollSequenceNoAutoroll,
  testInitiativeWinnerSetsPlacementFirstPlayerAndPhasePlacement,
  testGetHeroMetaReturnsCorrectData,
  testHeroRegistryContainsPlayableHeroes,
  testBattleAbilityViewsCoverHeroRegistryMetadata,
} from "./core/setup.test";
import {
  testAdvantageThresholdValidationAndWin,
  testChessKingDeathAndDraw,
  testCourtRoundEndRollsEffectsAndSwapsRoles,
  testMoonGameStraightMovementBonus,
  testNormalRuleVictoryAndNoRoundEffect,
  testRuleDeclarationChooserAndPlacementGate,
  testRuleDeclarationSetupBranches,
} from "./core/ruleDeclarations.test";
import {
  testGameEndCondition,
  testBattleTurnOrderFollowsPlacementOrder,
} from "./core/turnFlow.test";
import {
  testActionsRejectedAfterGameOver,
  testAuthoritativeGameOverResultAndTokenRule,
  testVictoryWaitsForPendingDeathResolution,
} from "./core/gameOver.test";
import {
  testBoundedCountersStillClamp,
  testUnboundedCountersExceedCommonChargeLimits,
} from "./core/counters.test";
import {
  testCannotMoveTwicePerTurn,
  testTricksterMoveOptionsGeneratedAndUsed,
  testBerserkerMoveOptionsGeneratedAndUsed,
  testBerserkerMoveRoll1GeneratesTopRoof,
  testBerserkerMoveRoll3GeneratesLeftVertical,
  testBerserkerMoveRoll5GeneratesMooreRadius1,
  testBerserkerMoveRoll6GeneratesStarShape,
  testBerserkerMoveFiltersOutOfBounds,
  testBerserkerMoveCannotEndOnAlly,
  testBerserkerMoveRequiresManualRollNoAutoroll,
  testTricksterMoveRequiresPendingOptions,
  testBerserkerMoveRequiresPendingRollAndGeneratesOptions,
} from "./core/movement.test";
import {
  testBerserkerAutoDefenseEnabled,
  testBerserkerAutoDefenseDeclined,
  testBerserkerAutoDefenseNoCharges,
  testBerserkerDefenseChoiceAutoDodgeSpends6,
  testBerserkerDefenseChoiceRollUsesNormalCombat,
  testCannotAutoDodgeIfChargesNot6,
  testCannotAttackTwicePerTurn,
  testAttackConsumesActionSlot,
  testTricksterAoEIs5x5Radius2,
  testTricksterAoEHitsAllies,
  testTricksterAoEDoesNotDamageSelf,
  testTricksterAoEAttackerRollOnce,
  testTricksterAoEMultipleDefendersRollSeparately,
  testTricksterAoEConsumesAttack,
  testSpearmanAttackIncludesAdjacentRing,
  testSpearmanAttackKeepsDistance2Directions,
  testSpearmanAttackExcludesSelf,
  testSpearmanAttackRespectsBounds,
  testArcherCanShootThroughAllies,
  testArcherCannotShootThroughEnemies,
  testArcherAttacksFirstOnLine,
  testArcherCanAttackDiagonalFirstTargetOnly,
  testArcherCanShootThroughAlliesDiagonal,
  testArcherCannotShootThroughEnemiesDiagonal,
  testAbilityConsumesMultipleSlots,
} from "./core/combat.test";
import {
  testRiderPathIgnoresHiddenEnemies,
  testRiderPathHitsVisibleEnemy,
  testAssassinAttackFromStealth,
  testHiddenHassanMissesDuolingoAndReveals,
  testHiddenHassanHitsDuolingoAndReveals,
  testHiddenAttackAutoDefendedStillReveals,
  testAssassinAttackWithoutStealth,
  testSearchRevealsOnlyInRadius,
  testSearchUpdatesOnlyPlayerKnowledge,
  testSearchStealthRollsLogged,
  testSearchActionBlockedAfterAttack,
  testSearchMoveBlockedAfterMove,
  testSearchActionWorksBeforeAttack,
  testSearchMoveWorksBeforeMove,
  testSearchButtonsEnabledOnFreshUnitTurn,
  testAttackAlreadyRevealedUnit,
  testAdjacentHiddenEnemyStaysHiddenAfterMove,
  testCannotAttackAfterSearchAction,
  testCannotSearchMoveAfterMove,
  testRiderCannotEnterStealth,
  testAssassinCanEnterStealth,
  testStealthOnlyForUnitsWithAbility,
  testAllyCannotStepOnStealthedAlly,
  testEnemyCanStepOnUnknownStealthedWithoutReveal,
  testHiddenAllyOnEnemyCellDoesNotBlockAttackOrReveal,
  testUnknownStealthedEnemyDoesNotBlockArcherLine,
  testStealthEntryClearsOpponentExactKnowledge,
  testPathPassingAdjacentAfterStealthEntryDoesNotReveal,
  testEnemyCanStepOnRealStealthEntryCellWithoutReveal,
  testRevealDisplacesCoLocatedHiddenUnitDeterministically,
  testRealStealthEntryDoesNotBlockArcherLine,
  testKnownHiddenEnemyBlocksMovementAndArcherLine,
  testNonRevealingAoEProjectionRedactsHiddenTargets,
  testCannotAttackStealthedEnemyDirectly,
  testNoStealthStackingOnEnter,
  testStealthLasts3OwnTurnsThenExpiresOn4thStart,
  testStealthRollLogged,
  testLastKnownPositionsInView,
  testLastKnownPositionPersistsWhileHidden,
  testLastKnownClearedOnStealthExit,
  testTricksterAoERevealsHiddenInArea,
  testTricksterAoERevealsAllInArea,
  testTricksterAoERevealsStealthedUnits,
  testArcherCannotTargetHiddenEnemy,
  testCannotStealthTwicePerTurn,
  testSearchStealthSlots,
} from "./core/visibility.test";
import {
  testHassanGrantedStealthUsesGrantedUnitsOwnTurns,
  testLokiStealthUsesOwnTurnDuration,
  testNormalStealthCountsOnlyHiddenFiguresOwnTurnStarts,
  testStealthLegacyFallbackAndDebugInitialization,
  testStealthTurnStartContinuationIsIdempotent,
} from "./core/stealthDuration.test";
import {
  testGoldenSnapshotAoeWithIntimidateChain,
  testGoldenSnapshotPendingRollSequence,
  testGoldenActionSnapshot,
} from "./core/snapshots.test";
import {
  testKaiserBunkerVisibleAndDamageClampedTo1,
  testTransformedKaiserHasNoStealthOrBunkerActions,
  testKaiserBunkerExpiresOnFourthOwnTurn,
  testKaiserBunkerExitOnAttackButNotDoraOrImpulse,
  testCarpetStrikeRollsCenterThenAttackThenDefenders,
  testCarpetStrikeUsesSingleSharedAttackRollForAllTargets,
  testCarpetStrikeDamageIsFixed1IgnoresBuffs,
  testCarpetStrikeHighlightsAreaMetadataInEvents,
  testCarpetStrikeRevealsStealthedUnitsInArea,
  testKaiserCarpetStrikeDoesNotHitSelfInBunker,
  testKaiserCarpetStrikeHitsAlliesAndEnemies,
  testKaiserDoraDoesNotRequireBunker,
  testKaiserDoraOneAttackerRollManyDefenders,
  testKaiserDoraTriggersDonMadnessDirectionBeforeFinalAttack,
  testKaiserDoraDoesNotDuplicateDefenderRollsWithIntimidate,
  testKaiserDoraCenterMustBeOnArcherLine,
  testKaiserEngineeringMiracleTransformsStats,
  testKaiserEngineeringMiracleImpulseNoActionNoSpend,
  testKaiserEngineeringMiracleTriggersAtFourAndPersistsNextTurn,
  testTransformedKaiserHasDoraAbility,
  testTransformedKaiserHasBerserkerFeatureAndCharges,
  testKaiserInitialChargesStartAtZeroThenIncrementToOneOnFirstTurn,
  testKaiserChargesIncrementEachOwnTurn,
  testChargesAreNotResetByViewOrStartTurn,
  testKaiserMulticlassMovementAndRiderPath,
} from "./heroes/grandKaiser.test";
import {
  testIntimidateTriggersOncePerSuccessfulDefense,
  testTricksterAoEDoesNotDuplicateDefenderRollsWithIntimidate,
  testVladForestDoesNotDuplicateDefenderRollsWithIntimidate,
  testForestIsAutomaticImpulseAndRejectsManualUse,
  testVladIntimidatePromptsAfterSuccessfulDefense,
  testVladIntimidatePushesAttackerOneCell,
  testVladIntimidateNoOptionsAutoSkips,
  testVladStakesPromptOnBattleStart,
  testVladStakesPromptOnSecondOwnTurnStart,
  testStakeCannotBePlacedOnVisibleUnit,
  testStakeCanBePlacedOnStealthedUnitNoEffect,
  testLinePathOrthogonalIsExact,
  testLinePathDiagonalIsExact,
  testTricksterTeleportDoesNotTriggerIntermediateStakes,
  testRiderStopsOnStakeInPath,
  testStakeDoesNotTriggerOnHiddenUnitCell,
  testStakeTriggersOnVisibleUnitStopsAndDamagesAndReveals,
  testStakeDoesNotTriggerOnUnknownStealthedUnit,
  testAssassinStopsExactlyOnStakeCell,
  testStakesDoNotGetRemovedOnTriggerOnlyRevealed,
  testTwoTepesHiddenStakesSameCellDamageOnly1,
  testTriggerRevealsAllStakesOnCell,
  testForestRequires9Stakes,
  testForestConsumes9AndSkipsStakesPlacementThatTurn,
  testForestEmptyAreaClearsPendingState,
  testForestAoeDeals2AndRootsOnFail,
  testRootBlocksMovementNextTurnOnly,
} from "./heroes/vladTepes.test";
import {
  testPolkovodetsAppliesToAdjacentAlliesNotSelf,
  testPolkovodetsDoesNotStack,
  testPolkovodetsRiderOnlyIfStartOrEndInAura,
  testGenghisHpIs7,
  testKhansDecreeDoesNotConsumeMoveSlot,
  testKhansDecreeAllowsDiagonalMoveThenConsumesMove,
  testKhansDecreeRejectsDiagonalMoveWithoutStatus,
  testKhansDecreeDiagonalMoveTriggersRiderAttacksForTouchedEnemies,
  testKhansDecreeIgnoresHiddenTouchedEnemies,
  testKhansDecreeDiagonalMoveTriggersDestinationHazardOnce,
  testKhansDecreeCannotBeUsedAfterMove,
  testGenghisMongolChargeRequires4SpendsAll4,
  testGenghisLegendOfSteppesBonusOnlyVsLastTurnTarget,
  testGenghisMongolChargeSweepTriggersAlliedAttacksInCorridor,
  testGenghisMongolChargeInfluenceIncludesFullPathAndSides,
  testGenghisMongolChargeMultipleTargetsCreatesChoiceAndResolves,
  testGenghisMongolChargeSkipsAlliesWithoutTargets,
  testGenghisMongolChargeMultipleAlliesPauseInStableOrder,
} from "./heroes/genghisKhan.test";
import {
  testElCidLongLiverAdds2Hp,
  testElCidWarriorDoubleIsAutoHitNoDefenderRoll,
  testElCidTisonaIsRayOnlyRightDirection,
  testElCidTisonaIsRayOnlyUpDirection,
  testElCidTisonaResolvesOnceAndCannotReplayAfterward,
  testElCidKoladaImpulseTriggersAtStartTurnSpends3SharedAttackerRollHitsAllies,
  testElCidDemonDuelistChainHitsUntilMissThenChoicePayHpOrStop,
  testElCidDemonDuelistRequires5AndSpends5,
  testElCidTisonaAndKoladaHitAllies,
} from "./heroes/elCid.test";
import {
  testGroznyTyrantDoesNotTriggerIfOnlyBuffWouldMakeKillPossible,
  testGroznyTyrantTriggersAndKillsWhenBaseDamageIsEnough,
  testGroznyTyrantPromptsForAttackCellAndSkipsWithoutSpending,
  testGroznyTyrantInvadeTimeOptionSpendsOnlyAfterCellChoice,
  testGroznyTyrantOmitsInvadeTimeWhenUnavailableButKeepsNormal,
  testGroznyTyrantOffersNormalAndInvadeTimeWhenBothLegal,
  testGroznyTyrantRequiresAllyChoiceWhenMultipleQualify,
  testGroznyTyrantRejectsInvalidOriginWithoutSpending,
  testGroznyTyrantDuplicateOriginResolutionDoesNotRepeatEffects,
  testGroznyTyrantPendingChoiceProjectsOnlyToOwner,
  testGroznyTyrantRequiresReachableAttackPositionWithinRoll6,
  testGroznyTyrantChainGrantsExtraMovesFromSecondKill,
  testGroznyInvadeTimeRequiresFullChargesAndConsumesMove,
} from "./heroes/grozny.test";
import {
  testChikatiloPlacementListSubstitution,
  testFalseTrailTokenPlacementLegalTargets,
  testChikatiloPlacementAfterToken,
  testPlacementFlowWithoutChikatilo,
  testChikatiloTokenDeathRevealsChikatilo,
  testChikatiloAssassinMarkDoesNotRevealAndGrantsBonusDamage,
  testChikatiloAssassinMarkApplicationFlowAndRedaction,
  testChikatiloAssassinMarkTrackingProjectionAttackAndExpiry,
  testChikatiloDecoyReducesDamageAndConsumesCharges,
  testFalseTrailExplosionHitsAlliesAndEnemiesSingleRoll,
  testChikatiloMarkOnlyBonusesStealthAttack,
  testChikatiloDecoyPointsGainAndStealthTransaction,
  testFalseTrailRevealAutoExplodesWithoutChoice,
  testFalseTrailTokenRestrictedActionSet,
  testFalseTrailStealthTimerAndLastFigureRule,
  testFalseTrailExplosionSuccessfulDefenseAvoidsDamage,
} from "./heroes/chikatilo.test";
import {
  testLechyHpBonus,
  testLechyNaturalStealthThreshold,
  testLechyGuideTravelerGatingAndBehavior,
  testForestExitRestrictionOnFail,
  testForestExitRestrictionOnSuccess,
  testForestCrossRestrictionOnFail,
  testLechyConfuseTerrainPerSideMarkersAndReplacement,
  testLechyStormGatingEffectsAndExemptions,
} from "./heroes/lechy.test";
import {
  testJebeHpBonus,
  testJebeStealthThresholdIs6,
  testJebeHailOfArrowsGatingTargetingAndDamage,
  testJebeKhansShooterGatingConsumesAndRicochets,
} from "./heroes/jebe.test";
import {
  testHassanHpBonus,
  testHassanStealthThresholdIs4,
  testHassanTrueEnemyGatingConsumesAndForcesOneAttack,
  testHassanAssassinOrderBattleStartSelectionAndPerSideIndependence,
  testHassanAssassinOrderResumesAfterChikatiloAndRejectsSafely,
} from "./heroes/hassan.test";
import {
  testGutsHpBonus,
  testGutsKnightMulticlassMovementAndDoubleAutoHit,
  testGutsArbaletRangedFixedDamage,
  testGutsCannonGatingAndChargeSpend,
  testGutsBerserkModeGatingAndActivation,
  testGutsBerserkEndTurnSelfDamage,
  testGutsBerserkMeleeBonusAndRangedNoBonus,
  testGutsBerserkMovementAndAoEAndIncomingCap,
  testGutsBerserkAoEOffersAlliedBerserkerAutoDefense,
  testGutsBerserkAttackChoiceSingleTargetSpearmanRange,
  testGutsBerserkAttackChoiceSingleTargetAdjacentBonus,
  testGutsExitBerserkOnceAndNoReentry,
} from "./heroes/guts.test";
import {
  testGriffithWretchedManDamageReductionClamped,
  testGriffithWarriorDoubleAutoHit,
  testGriffithBasicAttackAndReadOnlyRebirth,
  testGriffithFemtoRebirthOnDeath,
  testFemtoSpearmanReachAndBerserkerDamage,
  testFemtoDivineMoveUsesMoveSlotAndRollRanges,
  testFemtoBerserkAutoDefenseGatingAndBehavior,
} from "./heroes/griffithFemto.test";
import {
  testKaladinHpBonus,
  testKaladinFirstOathGatingHealingAndCosts,
  testKaladinSecondOathTricksterMoveAndAoeTrait,
  testKaladinThirdOathSpearmanBonusOnlyOnSpearmanAttack,
  testKaladinFourthOathBerserkerTraitMovementMode,
  testKaladinFifthOathGatingDamageAndImmobilizeDuration,
} from "./heroes/kaladin.test";
import {
  testOdinHpBonus,
  testOdinMuninnStartsFullyCharged,
  testOdinGungnirAutoHitOnAttackDouble,
  testOdinHuginnStealthVisibilityRadius,
  testOdinSleipnirGatingTeleportAndNoMoveSpend,
  testOdinSleipnirAutoPendingAndDestinationStakeTrigger,
  testOdinSleipnirDoesNotLeakUnknownHiddenOccupants,
  testOdinMuninnPostDefenseChoice,
} from "./heroes/odin.test";
import {
  testLokiLaughterIncrementsOnAnyDouble,
  testLokiNaturalStealthThresholdAndPassiveView,
  testLokiLaughDirectOptionPayloadStartsResolution,
  testLokiLaughDirectOptionsSpendOnlyAfterValidStart,
  testLokiLaughterSpendingAndGating,
  testLokiLaughOptionAvailabilityThresholds,
  testLokiOptionOneMoveLockDuration,
  testLokiOptionTwoChickenBlocksAndRestrictsMove,
  testLokiOptionThreeMindControlForcedAttackAndSlots,
  testLokiSpinWheelPoolFallbackAndCost,
  testLokiOptionFiveMassChickenFailOnlyAlliesAndEnemies,
} from "./heroes/loki.test";
import {
  testFriskPacifismIncrementsOnMissIncludingCleanSoul,
  testFriskGenocideIncrementsOnHit,
  testFriskCleanSoulShieldFlow,
  testFriskChildsCryNegatesDamageAndSpendsPoints,
  testFriskPacifismActiveOptionsSpendOnResolutionOnly,
  testFriskGenocideActiveOptionsSpendOnResolutionOnly,
  testFriskSubstitutionTakesOneDamageBeforeDefenseRoll,
  testFriskOnePathConvertsAndDisablesPacifism,
  testFriskKillBonusesFirstAndSecondKill,
  testFriskPowerOfFriendshipWinCondition,
} from "./heroes/frisk.test";
import {
  testAsgoreHpBonus,
  testAsgoreSpearmanReachAndDefenseDouble,
  testAsgoreFireballTargetingChargesAndDamage,
  testAsgoreFireParadeAreaResolutionAndChargeSpend,
  testAsgoreSoulParadePatienceAttackAndTempStealth,
  testAsgoreSoulParadeBraveryAutoDefenseOneTime,
  testAsgoreSoulParadeIntegrityPerseveranceKindnessJustice,
} from "./heroes/asgore.test";
import {
  testRiverPersonHpBonus,
  testRiverPersonNoRiderPathFeature,
  testRiverPersonBoatCarryFlowAndConstraints,
  testRiverPersonBoatmanConvertsActionToMoveAndSupportsCarry,
  testRiverPersonGuideOfSoulsStormImmunity,
  testRiverPersonTraLaLaGatingAndFlow,
} from "./heroes/riverPerson.test";
import {
  testPapyrusLongLiverAdds2Hp,
  testPapyrusBlueBoneApplyPunishRefreshAndExpiry,
  testPapyrusSpaghettiGatingHealingClampAndChargeSpend,
  testPapyrusCoolGuyGatingLineHitsAndBlueBone,
  testPapyrusUnbelieverTriggersOnAlliedHeroDeathAndPersists,
  testPapyrusOrangeBoneToggleAndFirstNonMovePunish,
  testPapyrusTransformedAoeQueuesPerTargetBoneChoices,
  testPapyrusTransformedMissCreatesNoBoneChoice,
  testPapyrusLongBoneAttackAndCoolGuyCostReduction,
  testPapyrusOssifiedBerserkerFeatureAfterTransformationOnly,
} from "./heroes/papyrus.test";
import { testOrangeBoneRequiresMovementFirst } from "./heroes/orangeBone.test";
import {
  testSansBaseDamageIsOne,
  testSansLongLiverAndSpearmanFeature,
  testSansGasterBlasterGatingLineAndSpend,
  testSansBadassJokeDebuffAndMovementLock,
  testSansUnbelieverBoneFieldAndSleep,
  testSansLastAttackCurse,
} from "./heroes/sans.test";
import {
  testUndyneToughSpearmanFeatureAndReach,
  testUndyneThrowSpearFixedDamageAndSpearRain,
  testUndyneEnergySpearGatingLineAndFreeImmortalCost,
  testUndyneDirectionShiftDefenseRedirect,
  testUndyneImmortalTriggerCapDrainBonusAndOnce,
} from "./heroes/undyne.test";
import {
  testMettatonLongLiverCannotHideAndRiderMovement,
  testMettatonRatingPassiveAndThresholdUnlock,
  testMettatonPoppinsGatingAreaAndRating,
  testMettatonExStageAndLaser,
  testMettatonNeoGraceAndRiderPathUnlocks,
  testMettatonBerserkerFeatureOnlyAfterNeo,
  testMettatonFinalChordGatingTargetsDamageAndSpend,
} from "./heroes/mettaton.test";
import {
  testDebugChargeAndStatusMutation,
  testDebugDiceQueueControlsRolls,
  testDebugSpawnUsesCatalogMetadata,
} from "./core/debug.test";
import {
  testClassicRosterCreationUsesOnlyBaseUnits,
  testClassicRosterIgnoresCustomFigureSets,
  testDraftCompletionCreatesValidRosters,
  testDraftPickOrderIsSnake,
  testDraftPoolExcludesBaseUnits,
  testDraftPoolRequiresExplicitImplementedEligibility,
  testDraftValidationRulesWork,
  testGameModeConfigsExposeExpectedModes,
  testSafeClassDraftPoolAvailabilityIsValidated,
  testStandardRosterRejectsStubFigureSets,
  testStubHeroesAreRejectedWithoutDraftMutation,
} from "./core/modes.test";

function main(): void {
  testActiveQueuedRollProjectsAsPending();
  // Full test run: preserve the historical simpleTests.ts execution order.
  console.log("Running full simpleTests suite");
  testPendingRollActionsExportsStable();
  testCombatVisualChainIdsStayStableAcrossRelatedRolls();
  testCombatVisualChainCompletesOnlyAfterNestedFollowups();
  testCombatVisualMetadataProjectionDoesNotLeakHiddenUnits();
  testDebugSpawnUsesCatalogMetadata();
  testDebugChargeAndStatusMutation();
  testDebugDiceQueueControlsRolls();
  testPendingRollResolverCoverage();
  testPendingRollPresentationMetadata();
  testUnknownPendingRollKindDoesNotClear();
  testImpulseMetadataAllAutoManaged();
  testChargedLineImpulsesCreateForcedPendingAtTurnStart();
  testEventDrivenImpulsesAutoTrigger();
  testUnboundedCountersExceedCommonChargeLimits();
  testBoundedCountersStillClamp();
  testGameModeConfigsExposeExpectedModes();
  testClassicRosterCreationUsesOnlyBaseUnits();
  testClassicRosterIgnoresCustomFigureSets();
  testDraftPoolExcludesBaseUnits();
  testDraftPoolRequiresExplicitImplementedEligibility();
  testSafeClassDraftPoolAvailabilityIsValidated();
  testStubHeroesAreRejectedWithoutDraftMutation();
  testStandardRosterRejectsStubFigureSets();
  testDraftPickOrderIsSnake();
  testDraftValidationRulesWork();
  testDraftCompletionCreatesValidRosters();
  testPlacementToBattleAndTurnOrder();
  testLobbyReadyAndStartRequiresBothReady();
  testInitiativeRollSequenceNoAutoroll();
  testInitiativeWinnerSetsPlacementFirstPlayerAndPhasePlacement();
  testRuleDeclarationChooserAndPlacementGate();
  testRuleDeclarationSetupBranches();
  testNormalRuleVictoryAndNoRoundEffect();
  testAdvantageThresholdValidationAndWin();
  testChessKingDeathAndDraw();
  testMoonGameStraightMovementBonus();
  testCourtRoundEndRollsEffectsAndSwapsRoles();
  testRiderPathIgnoresHiddenEnemies();
  testRiderPathHitsVisibleEnemy();
  testGameEndCondition();
  testAuthoritativeGameOverResultAndTokenRule();
  testVictoryWaitsForPendingDeathResolution();
  testActionsRejectedAfterGameOver();
  testBerserkerAutoDefenseEnabled();
  testBerserkerAutoDefenseDeclined();
  testBerserkerAutoDefenseNoCharges();
  testBerserkerDefenseChoiceAutoDodgeSpends6();
  testBerserkerDefenseChoiceRollUsesNormalCombat();
  testCannotAutoDodgeIfChargesNot6();
  testAssassinAttackFromStealth();
  testHiddenHassanMissesDuolingoAndReveals();
  testHiddenHassanHitsDuolingoAndReveals();
  testHiddenAttackAutoDefendedStillReveals();
  testAssassinAttackWithoutStealth();
  testSearchRevealsOnlyInRadius();
  testSearchUpdatesOnlyPlayerKnowledge();
  testSearchStealthRollsLogged();
  testSearchActionBlockedAfterAttack();
  testSearchMoveBlockedAfterMove();
  testSearchActionWorksBeforeAttack();
  testSearchMoveWorksBeforeMove();
  testSearchButtonsEnabledOnFreshUnitTurn();
  testAttackAlreadyRevealedUnit();
  testAdjacentHiddenEnemyStaysHiddenAfterMove();
  testCannotAttackTwicePerTurn();
  testAttackConsumesActionSlot();
  testCannotAttackAfterSearchAction();
  testCannotSearchMoveAfterMove();
  testRiderCannotEnterStealth();
  testAssassinCanEnterStealth();
  testStealthOnlyForUnitsWithAbility();
  testBattleTurnOrderFollowsPlacementOrder();
  testAllyCannotStepOnStealthedAlly();
  testEnemyCanStepOnUnknownStealthedWithoutReveal();
  testHiddenAllyOnEnemyCellDoesNotBlockAttackOrReveal();
  testUnknownStealthedEnemyDoesNotBlockArcherLine();
  testStealthEntryClearsOpponentExactKnowledge();
  testPathPassingAdjacentAfterStealthEntryDoesNotReveal();
  testEnemyCanStepOnRealStealthEntryCellWithoutReveal();
  testRevealDisplacesCoLocatedHiddenUnitDeterministically();
  testRealStealthEntryDoesNotBlockArcherLine();
  testKnownHiddenEnemyBlocksMovementAndArcherLine();
  testNonRevealingAoEProjectionRedactsHiddenTargets();
  testCannotAttackStealthedEnemyDirectly();
  testNoStealthStackingOnEnter();
  testStealthLasts3OwnTurnsThenExpiresOn4thStart();
  testNormalStealthCountsOnlyHiddenFiguresOwnTurnStarts();
  testLokiStealthUsesOwnTurnDuration();
  testHassanGrantedStealthUsesGrantedUnitsOwnTurns();
  testStealthLegacyFallbackAndDebugInitialization();
  testStealthTurnStartContinuationIsIdempotent();
  testStealthRollLogged();
  testLastKnownPositionsInView();
  testLastKnownPositionPersistsWhileHidden();
  testLastKnownClearedOnStealthExit();
  testTricksterAoERevealsHiddenInArea();
  testTricksterAoEIs5x5Radius2();
  testTricksterAoEHitsAllies();
  testTricksterAoEDoesNotDamageSelf();
  testTricksterAoERevealsAllInArea();
  testTricksterAoEAttackerRollOnce();
  testTricksterAoEMultipleDefendersRollSeparately();
  testTricksterAoERevealsStealthedUnits();
  testTricksterAoEConsumesAttack();
  testSpearmanAttackIncludesAdjacentRing();
  testSpearmanAttackKeepsDistance2Directions();
  testSpearmanAttackExcludesSelf();
  testSpearmanAttackRespectsBounds();
  testArcherCanShootThroughAllies();
  testArcherCannotShootThroughEnemies();
  testArcherAttacksFirstOnLine();
  testArcherCannotTargetHiddenEnemy();
  testArcherCanAttackDiagonalFirstTargetOnly();
  testArcherCanShootThroughAlliesDiagonal();
  testArcherCannotShootThroughEnemiesDiagonal();
  testCannotMoveTwicePerTurn();
  testCannotStealthTwicePerTurn();
  testSearchStealthSlots();
  testAbilityConsumesMultipleSlots();
  testTricksterMoveOptionsGeneratedAndUsed();
  testBerserkerMoveOptionsGeneratedAndUsed();
  testBerserkerMoveRoll1GeneratesTopRoof();
  testBerserkerMoveRoll3GeneratesLeftVertical();
  testBerserkerMoveRoll5GeneratesMooreRadius1();
  testBerserkerMoveRoll6GeneratesStarShape();
  testBerserkerMoveFiltersOutOfBounds();
  testBerserkerMoveCannotEndOnAlly();
  testBerserkerMoveRequiresManualRollNoAutoroll();
  testTricksterMoveRequiresPendingOptions();
  testKaiserBunkerVisibleAndDamageClampedTo1();
  testTransformedKaiserHasNoStealthOrBunkerActions();
  testKaiserBunkerExpiresOnFourthOwnTurn();
  testKaiserBunkerExitOnAttackButNotDoraOrImpulse();
  testCarpetStrikeRollsCenterThenAttackThenDefenders();
  testCarpetStrikeUsesSingleSharedAttackRollForAllTargets();
  testCarpetStrikeDamageIsFixed1IgnoresBuffs();
  testCarpetStrikeHighlightsAreaMetadataInEvents();
  testCarpetStrikeRevealsStealthedUnitsInArea();
  testKaiserCarpetStrikeDoesNotHitSelfInBunker();
  testKaiserCarpetStrikeHitsAlliesAndEnemies();
  testKaiserDoraDoesNotRequireBunker();
  testKaiserDoraOneAttackerRollManyDefenders();
  testKaiserDoraTriggersDonMadnessDirectionBeforeFinalAttack();
  testKaiserDoraDoesNotDuplicateDefenderRollsWithIntimidate();
  testIntimidateTriggersOncePerSuccessfulDefense();
  testTricksterAoEDoesNotDuplicateDefenderRollsWithIntimidate();
  testVladForestDoesNotDuplicateDefenderRollsWithIntimidate();
  testKaiserDoraCenterMustBeOnArcherLine();
  testKaiserEngineeringMiracleTransformsStats();
  testKaiserEngineeringMiracleImpulseNoActionNoSpend();
  testKaiserEngineeringMiracleTriggersAtFourAndPersistsNextTurn();
  testTransformedKaiserHasDoraAbility();
  testTransformedKaiserHasBerserkerFeatureAndCharges();
  testBerserkerMoveRequiresPendingRollAndGeneratesOptions();
  testKaiserInitialChargesStartAtZeroThenIncrementToOneOnFirstTurn();
  testKaiserChargesIncrementEachOwnTurn();
  testChargesAreNotResetByViewOrStartTurn();
  testKaiserMulticlassMovementAndRiderPath();
  testPolkovodetsAppliesToAdjacentAlliesNotSelf();
  testPolkovodetsDoesNotStack();
  testPolkovodetsRiderOnlyIfStartOrEndInAura();
  testGenghisHpIs7();
  testKhansDecreeDoesNotConsumeMoveSlot();
  testKhansDecreeAllowsDiagonalMoveThenConsumesMove();
  testKhansDecreeRejectsDiagonalMoveWithoutStatus();
  testKhansDecreeDiagonalMoveTriggersRiderAttacksForTouchedEnemies();
  testKhansDecreeIgnoresHiddenTouchedEnemies();
  testKhansDecreeDiagonalMoveTriggersDestinationHazardOnce();
  testKhansDecreeCannotBeUsedAfterMove();
  testGenghisMongolChargeRequires4SpendsAll4();
  testGenghisLegendOfSteppesBonusOnlyVsLastTurnTarget();
  testGenghisMongolChargeSweepTriggersAlliedAttacksInCorridor();
  testGenghisMongolChargeInfluenceIncludesFullPathAndSides();
  testGenghisMongolChargeMultipleTargetsCreatesChoiceAndResolves();
  testGenghisMongolChargeSkipsAlliesWithoutTargets();
  testGenghisMongolChargeMultipleAlliesPauseInStableOrder();
  testJebeHpBonus();
  testJebeStealthThresholdIs6();
  testJebeHailOfArrowsGatingTargetingAndDamage();
  testJebeKhansShooterGatingConsumesAndRicochets();
  testHassanHpBonus();
  testHassanStealthThresholdIs4();
  testHassanTrueEnemyGatingConsumesAndForcesOneAttack();
  testHassanAssassinOrderBattleStartSelectionAndPerSideIndependence();
  testHassanAssassinOrderResumesAfterChikatiloAndRejectsSafely();
  testGriffithWretchedManDamageReductionClamped();
  testGriffithWarriorDoubleAutoHit();
  testGriffithBasicAttackAndReadOnlyRebirth();
  testGriffithFemtoRebirthOnDeath();
  testFemtoSpearmanReachAndBerserkerDamage();
  testFemtoDivineMoveUsesMoveSlotAndRollRanges();
  testFemtoBerserkAutoDefenseGatingAndBehavior();
  testGutsHpBonus();
  testGutsKnightMulticlassMovementAndDoubleAutoHit();
  testGutsArbaletRangedFixedDamage();
  testGutsCannonGatingAndChargeSpend();
  testGutsBerserkModeGatingAndActivation();
  testGutsBerserkEndTurnSelfDamage();
  testGutsBerserkMeleeBonusAndRangedNoBonus();
  testGutsBerserkMovementAndAoEAndIncomingCap();
  testGutsBerserkAoEOffersAlliedBerserkerAutoDefense();
  testGutsBerserkAttackChoiceSingleTargetSpearmanRange();
  testGutsBerserkAttackChoiceSingleTargetAdjacentBonus();
  testGutsExitBerserkOnceAndNoReentry();
  testKaladinHpBonus();
  testKaladinFirstOathGatingHealingAndCosts();
  testKaladinSecondOathTricksterMoveAndAoeTrait();
  testKaladinThirdOathSpearmanBonusOnlyOnSpearmanAttack();
  testKaladinFourthOathBerserkerTraitMovementMode();
  testKaladinFifthOathGatingDamageAndImmobilizeDuration();
  testAsgoreHpBonus();
  testAsgoreSpearmanReachAndDefenseDouble();
  testAsgoreFireballTargetingChargesAndDamage();
  testAsgoreFireParadeAreaResolutionAndChargeSpend();
  testAsgoreSoulParadePatienceAttackAndTempStealth();
  testAsgoreSoulParadeBraveryAutoDefenseOneTime();
  testAsgoreSoulParadeIntegrityPerseveranceKindnessJustice();
  testOdinHpBonus();
  testOdinMuninnStartsFullyCharged();
  testOdinGungnirAutoHitOnAttackDouble();
  testOdinHuginnStealthVisibilityRadius();
  testOdinSleipnirGatingTeleportAndNoMoveSpend();
  testOdinSleipnirAutoPendingAndDestinationStakeTrigger();
  testOdinSleipnirDoesNotLeakUnknownHiddenOccupants();
  testOdinMuninnPostDefenseChoice();
  testRiverPersonHpBonus();
  testRiverPersonNoRiderPathFeature();
  testRiverPersonBoatCarryFlowAndConstraints();
  testRiverPersonBoatmanConvertsActionToMoveAndSupportsCarry();
  testRiverPersonGuideOfSoulsStormImmunity();
  testRiverPersonTraLaLaGatingAndFlow();
  testPapyrusLongLiverAdds2Hp();
  testPapyrusBlueBoneApplyPunishRefreshAndExpiry();
  testPapyrusSpaghettiGatingHealingClampAndChargeSpend();
  testPapyrusCoolGuyGatingLineHitsAndBlueBone();
  testPapyrusUnbelieverTriggersOnAlliedHeroDeathAndPersists();
  testPapyrusOrangeBoneToggleAndFirstNonMovePunish();
  testPapyrusTransformedAoeQueuesPerTargetBoneChoices();
  testPapyrusTransformedMissCreatesNoBoneChoice();
  testOrangeBoneRequiresMovementFirst();
  testPapyrusLongBoneAttackAndCoolGuyCostReduction();
  testPapyrusOssifiedBerserkerFeatureAfterTransformationOnly();
  testSansBaseDamageIsOne();
  testSansLongLiverAndSpearmanFeature();
  testSansGasterBlasterGatingLineAndSpend();
  testSansBadassJokeDebuffAndMovementLock();
  testSansUnbelieverBoneFieldAndSleep();
  testSansLastAttackCurse();
  testUndyneToughSpearmanFeatureAndReach();
  testUndyneThrowSpearFixedDamageAndSpearRain();
  testUndyneEnergySpearGatingLineAndFreeImmortalCost();
  testUndyneDirectionShiftDefenseRedirect();
  testUndyneImmortalTriggerCapDrainBonusAndOnce();
  testMettatonLongLiverCannotHideAndRiderMovement();
  testMettatonRatingPassiveAndThresholdUnlock();
  testMettatonPoppinsGatingAreaAndRating();
  testMettatonExStageAndLaser();
  testMettatonNeoGraceAndRiderPathUnlocks();
  testMettatonBerserkerFeatureOnlyAfterNeo();
  testMettatonFinalChordGatingTargetsDamageAndSpend();
  testLokiNaturalStealthThresholdAndPassiveView();
  testLokiLaughDirectOptionPayloadStartsResolution();
  testLokiLaughDirectOptionsSpendOnlyAfterValidStart();
  testLokiLaughterIncrementsOnAnyDouble();
  testLokiLaughterSpendingAndGating();
  testLokiLaughOptionAvailabilityThresholds();
  testLokiOptionOneMoveLockDuration();
  testLokiOptionTwoChickenBlocksAndRestrictsMove();
  testLokiOptionThreeMindControlForcedAttackAndSlots();
  testLokiSpinWheelPoolFallbackAndCost();
  testLokiOptionFiveMassChickenFailOnlyAlliesAndEnemies();
  testFriskPacifismIncrementsOnMissIncludingCleanSoul();
  testFriskGenocideIncrementsOnHit();
  testFriskCleanSoulShieldFlow();
  testFriskChildsCryNegatesDamageAndSpendsPoints();
  testFriskPacifismActiveOptionsSpendOnResolutionOnly();
  testFriskGenocideActiveOptionsSpendOnResolutionOnly();
  testFriskSubstitutionTakesOneDamageBeforeDefenseRoll();
  testFriskOnePathConvertsAndDisablesPacifism();
  testFriskKillBonusesFirstAndSecondKill();
  testFriskPowerOfFriendshipWinCondition();
  testGroznyTyrantDoesNotTriggerIfOnlyBuffWouldMakeKillPossible();
  testGroznyTyrantTriggersAndKillsWhenBaseDamageIsEnough();
  testGroznyTyrantPromptsForAttackCellAndSkipsWithoutSpending();
  testGroznyTyrantInvadeTimeOptionSpendsOnlyAfterCellChoice();
  testGroznyTyrantOmitsInvadeTimeWhenUnavailableButKeepsNormal();
  testGroznyTyrantOffersNormalAndInvadeTimeWhenBothLegal();
  testGroznyTyrantRequiresAllyChoiceWhenMultipleQualify();
  testGroznyTyrantRejectsInvalidOriginWithoutSpending();
  testGroznyTyrantDuplicateOriginResolutionDoesNotRepeatEffects();
  testGroznyTyrantPendingChoiceProjectsOnlyToOwner();
  testGroznyTyrantRequiresReachableAttackPositionWithinRoll6();
  testGroznyTyrantChainGrantsExtraMovesFromSecondKill();
  testGroznyInvadeTimeRequiresFullChargesAndConsumesMove();
  testChikatiloPlacementListSubstitution();
  testFalseTrailTokenPlacementLegalTargets();
  testChikatiloPlacementAfterToken();
  testPlacementFlowWithoutChikatilo();
  testChikatiloTokenDeathRevealsChikatilo();
  testChikatiloAssassinMarkDoesNotRevealAndGrantsBonusDamage();
  testChikatiloAssassinMarkApplicationFlowAndRedaction();
  testChikatiloAssassinMarkTrackingProjectionAttackAndExpiry();
  testChikatiloDecoyReducesDamageAndConsumesCharges();
  testChikatiloMarkOnlyBonusesStealthAttack();
  testChikatiloDecoyPointsGainAndStealthTransaction();
  testFalseTrailRevealAutoExplodesWithoutChoice();
  testFalseTrailTokenRestrictedActionSet();
  testFalseTrailStealthTimerAndLastFigureRule();
  testFalseTrailExplosionSuccessfulDefenseAvoidsDamage();
  testLechyHpBonus();
  testLechyNaturalStealthThreshold();
  testLechyGuideTravelerGatingAndBehavior();
  testForestExitRestrictionOnFail();
  testForestExitRestrictionOnSuccess();
  testForestCrossRestrictionOnFail();
  testLechyConfuseTerrainPerSideMarkersAndReplacement();
  testLechyStormGatingEffectsAndExemptions();
  testFalseTrailExplosionHitsAlliesAndEnemiesSingleRoll();
  testElCidLongLiverAdds2Hp();
  testElCidWarriorDoubleIsAutoHitNoDefenderRoll();
  testElCidTisonaIsRayOnlyRightDirection();
  testElCidTisonaIsRayOnlyUpDirection();
  testElCidTisonaResolvesOnceAndCannotReplayAfterward();
  testElCidKoladaImpulseTriggersAtStartTurnSpends3SharedAttackerRollHitsAllies();
  testElCidDemonDuelistChainHitsUntilMissThenChoicePayHpOrStop();
  testElCidDemonDuelistRequires5AndSpends5();
  testElCidTisonaAndKoladaHitAllies();
  testVladIntimidatePromptsAfterSuccessfulDefense();
  testVladIntimidatePushesAttackerOneCell();
  testVladIntimidateNoOptionsAutoSkips();
  testVladStakesPromptOnBattleStart();
  testVladStakesPromptOnSecondOwnTurnStart();
  testStakeCannotBePlacedOnVisibleUnit();
  testStakeCanBePlacedOnStealthedUnitNoEffect();
  testLinePathOrthogonalIsExact();
  testLinePathDiagonalIsExact();
  testTricksterTeleportDoesNotTriggerIntermediateStakes();
  testRiderStopsOnStakeInPath();
  testStakeDoesNotTriggerOnHiddenUnitCell();
  testStakeTriggersOnVisibleUnitStopsAndDamagesAndReveals();
  testStakeDoesNotTriggerOnUnknownStealthedUnit();
  testAssassinStopsExactlyOnStakeCell();
  testStakesDoNotGetRemovedOnTriggerOnlyRevealed();
  testTwoTepesHiddenStakesSameCellDamageOnly1();
  testTriggerRevealsAllStakesOnCell();
  testForestIsAutomaticImpulseAndRejectsManualUse();
  testForestRequires9Stakes();
  testForestConsumes9AndSkipsStakesPlacementThatTurn();
  testForestEmptyAreaClearsPendingState();
  testForestAoeDeals2AndRootsOnFail();
  testRootBlocksMovementNextTurnOnly();
  testNewPlayableBatchStatsResourcesAndMovement();
  testArtemidaAndKanekiMovementModes();
  testArtemidaSilverSickleStopsAtSelectedEndpoint();
  testNewPlayableBatchTransactionalActives();
  testDonWindmillsAdjacentTargetsAndResolution();
  testNewPlayableBatchLineAndRevealEffects();
  testLucheRadiancePassiveAndLightRayModes();
  testNewPlayableBatchCombatCountersAndReactions();
  testJackSnareActivatesOncePerTarget();
  testJackSnareIsRemovedWithDeadTarget();
  testJackCoveringTracksSixthSnareFlow();
  testJackKeepsAssassinStealthBaseDamageWithoutOldBonus();
  testGetHeroMetaReturnsCorrectData();
  testHeroRegistryContainsPlayableHeroes();
  testBattleAbilityViewsCoverHeroRegistryMetadata();
  testGoldenSnapshotAoeWithIntimidateChain();
  testGoldenSnapshotPendingRollSequence();
  testGoldenActionSnapshot();
}

function mainBoundaries(): void {
  testActionModuleBoundaries();
}

if (process.argv.includes("--boundaries")) {
  mainBoundaries();
} else {
  main();
}
