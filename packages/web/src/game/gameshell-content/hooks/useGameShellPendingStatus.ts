import { useMemo } from "react";
import {
  CHIKATILO_DECOY_ID,
  FRISK_GENOCIDE_ID,
  FRISK_PACIFISM_ID,
  ODIN_MUNINN_ID,
} from "../../../rulesHints";
import { useI18n } from "../../../i18n";
import type { PlayerId } from "rules";
import { getPendingRollForPlayer, isPendingRollForPlayer } from "../../pendingState";

interface UseGameShellPendingStatusParams {
  view: any;
  roomMeta: any;
  roomId: string | null;
  leavingRoom: boolean;
  leaveRoom: () => void;
  seat: any;
  playerId: PlayerId | null;
}

export function useGameShellPendingStatus({
  view,
  roomMeta,
  roomId,
  leavingRoom,
  leaveRoom,
  seat,
  playerId,
}: UseGameShellPendingStatusParams) {
  const { t } = useI18n();
  const pendingMeta = roomMeta?.pendingRoll ?? null;
  const pendingRoll = getPendingRollForPlayer(view?.pendingRoll, pendingMeta, playerId);
  const pendingForLocalPlayer = isPendingRollForPlayer(pendingMeta, playerId);
  const hasBlockingRoll = !!pendingMeta;
  const isStakePlacement = pendingRoll?.kind === "vladPlaceStakes";
  const isForestTarget = pendingRoll?.kind === "vladForestTarget";
  const isIntimidateChoice = pendingRoll?.kind === "vladIntimidateChoice";
  const isForestChoice = pendingRoll?.kind === "vladForestChoice";
  const isForestMoveCheck = pendingRoll?.kind === "forestMoveCheck";
  const isForestMoveDestination = pendingRoll?.kind === "forestMoveDestination";
  const isDuelistChoice = pendingRoll?.kind === "elCidDuelistChoice";
  const isChikatiloPlacement = pendingRoll?.kind === "chikatiloFalseTrailPlacement";
  const isGroznyTyrantOptionChoice = pendingRoll?.kind === "groznyTyrantOptionChoice";
  const isGroznyTyrantAllyChoice = pendingRoll?.kind === "groznyTyrantAllyChoice";
  const isGroznyTyrantAttackCellChoice = pendingRoll?.kind === "groznyTyrantAttackCellChoice";
  const isGuideTravelerPlacement = pendingRoll?.kind === "lechyGuideTravelerPlacement";
  const isJebeKhansShooterTargetChoice = pendingRoll?.kind === "jebeKhansShooterTargetChoice";
  const isHassanTrueEnemyTargetChoice = pendingRoll?.kind === "hassanTrueEnemyTargetChoice";
  const isHassanAssassinOrderSelection = pendingRoll?.kind === "hassanAssassinOrderSelection";
  const isAsgoreSoulParadePatienceTargetChoice =
    pendingRoll?.kind === "asgoreSoulParadePatienceTargetChoice";
  const isAsgoreSoulParadePerseveranceTargetChoice =
    pendingRoll?.kind === "asgoreSoulParadePerseveranceTargetChoice";
  const isAsgoreSoulParadeJusticeTargetChoice =
    pendingRoll?.kind === "asgoreSoulParadeJusticeTargetChoice";
  const isAsgoreSoulParadeIntegrityDestination =
    pendingRoll?.kind === "asgoreSoulParadeIntegrityDestination";
  const isLokiLaughtChoice = pendingRoll?.kind === "lokiLaughtChoice";
  const isLokiChickenTargetChoice = pendingRoll?.kind === "lokiChickenTargetChoice";
  const isLokiMindControlEnemyChoice = pendingRoll?.kind === "lokiMindControlEnemyChoice";
  const isLokiMindControlTargetChoice = pendingRoll?.kind === "lokiMindControlTargetChoice";
  const isGutsBerserkAttackChoice = pendingRoll?.kind === "gutsBerserkAttackChoice";
  const isFriskPacifismChoice = pendingRoll?.kind === "friskPacifismChoice";
  const isFriskPacifismHugsTargetChoice = pendingRoll?.kind === "friskPacifismHugsTargetChoice";
  const isFriskWarmWordsTargetChoice = pendingRoll?.kind === "friskWarmWordsTargetChoice";
  const isFriskGenocideChoice = pendingRoll?.kind === "friskGenocideChoice";
  const isFriskKeenEyeChoice = pendingRoll?.kind === "friskKeenEyeChoice";
  const isFriskPrecisionStrikeTargetChoice =
    pendingRoll?.kind === "friskPrecisionStrikeTargetChoice";
  const isFriskSubstitutionChoice = pendingRoll?.kind === "friskSubstitutionChoice";
  const isFriskChildsCryChoice = pendingRoll?.kind === "friskChildsCryChoice";
  const isFemtoDivineMoveDestination = pendingRoll?.kind === "femtoDivineMoveDestination";
  const isOdinSleipnirDestination = pendingRoll?.kind === "odinSleipnirDestination";
  const isDonSorrowfulMoveChoice = pendingRoll?.kind === "donSorrowfulMoveChoice";
  const isDonMadnessDirectionChoice = pendingRoll?.kind === "donMadDelusionDirection";
  const isChargedImpulseTargetChoice =
    pendingRoll?.kind === "chargedImpulseTargetChoice" ||
    isDonSorrowfulMoveChoice ||
    isDonMadnessDirectionChoice ||
    pendingRoll?.kind === "donWindmillsRepositionChoice";
  const isRiverBoatCarryChoice = pendingRoll?.kind === "riverBoatCarryChoice";
  const isRiverBoatDestinationChoice = pendingRoll?.kind === "riverBoatDestinationChoice";
  const isRiverBoatDropDestination = pendingRoll?.kind === "riverBoatDropDestination";
  const isRiverTraLaLaTargetChoice = pendingRoll?.kind === "riverTraLaLaTargetChoice";
  const isRiverTraLaLaDestinationChoice = pendingRoll?.kind === "riverTraLaLaDestinationChoice";
  const isRiverTraLaLaDropDestinationChoice =
    pendingRoll?.kind === "riverTraLaLaDropDestinationChoice";
  const isChikatiloRevealChoice = pendingRoll?.kind === "chikatiloFalseTrailRevealChoice";
  const isChikatiloDecoyChoice = pendingRoll?.kind === "chikatiloDecoyChoice";
  const isDonWindmillsRepositionChoice = pendingRoll?.kind === "donWindmillsRepositionChoice";
  const boardSelectionPending =
    isStakePlacement ||
    isForestTarget ||
    isForestMoveDestination ||
    isIntimidateChoice ||
    isChikatiloPlacement ||
    isGroznyTyrantAllyChoice ||
    isGroznyTyrantAttackCellChoice ||
    isGuideTravelerPlacement ||
    isJebeKhansShooterTargetChoice ||
    isHassanTrueEnemyTargetChoice ||
    isHassanAssassinOrderSelection ||
    isLokiChickenTargetChoice ||
    isLokiMindControlEnemyChoice ||
    isLokiMindControlTargetChoice ||
    isFriskPacifismHugsTargetChoice ||
    isFriskWarmWordsTargetChoice ||
    isFriskPrecisionStrikeTargetChoice ||
    isAsgoreSoulParadePatienceTargetChoice ||
    isAsgoreSoulParadePerseveranceTargetChoice ||
    isAsgoreSoulParadeJusticeTargetChoice ||
    isAsgoreSoulParadeIntegrityDestination ||
    isFemtoDivineMoveDestination ||
    isOdinSleipnirDestination ||
    isChargedImpulseTargetChoice ||
    isRiverBoatCarryChoice ||
    isRiverBoatDestinationChoice ||
    isRiverBoatDropDestination ||
    isRiverTraLaLaTargetChoice ||
    isRiverTraLaLaDestinationChoice ||
    isRiverTraLaLaDropDestinationChoice ||
    isDonWindmillsRepositionChoice;
  const pendingQueueCount = view?.pendingCombatQueueCount ?? 0;
  const attackContext = pendingRoll?.context as
    | {
        attackerId?: string;
        defenderId?: string;
        attackerDice?: number[];
        tieBreakAttacker?: number[];
        stage?: "initial" | "tieBreak";
      }
    | undefined;
  const attackerDice = Array.isArray(attackContext?.attackerDice)
    ? (attackContext?.attackerDice ?? [])
    : [];
  const tieBreakAttacker = Array.isArray(attackContext?.tieBreakAttacker)
    ? (attackContext?.tieBreakAttacker ?? [])
    : [];
  const isBerserkerDefenseChoice =
    pendingRoll?.kind === "berserkerDefenseChoice" ||
    pendingRoll?.kind === "dora_berserkerDefenseChoice" ||
    pendingRoll?.kind === "jebeHailOfArrows_berserkerDefenseChoice" ||
    pendingRoll?.kind === "carpetStrike_berserkerDefenseChoice" ||
    pendingRoll?.kind === "vladForest_berserkerDefenseChoice";
  const isOdinMuninnDefenseChoice = pendingRoll?.kind === "odinMuninnDefenseChoice";
  const isAsgoreBraveryDefenseChoice = pendingRoll?.kind === "asgoreBraveryDefenseChoice";
  const isFriskDefenseChoice = isFriskSubstitutionChoice || isFriskChildsCryChoice;
  const showAttackerRoll =
    pendingRoll?.kind === "attack_defenderRoll" ||
    pendingRoll?.kind === "riderPathAttack_defenderRoll" ||
    pendingRoll?.kind === "tricksterAoE_defenderRoll" ||
    pendingRoll?.kind === "falseTrailExplosion_defenderRoll" ||
    pendingRoll?.kind === "elCidTisona_defenderRoll" ||
    pendingRoll?.kind === "elCidKolada_defenderRoll" ||
    pendingRoll?.kind === "dora_defenderRoll" ||
    pendingRoll?.kind === "jebeHailOfArrows_defenderRoll" ||
    pendingRoll?.kind === "carpetStrike_defenderRoll" ||
    pendingRoll?.kind === "vladForest_defenderRoll" ||
    isBerserkerDefenseChoice ||
    isOdinMuninnDefenseChoice ||
    isAsgoreBraveryDefenseChoice ||
    isFriskDefenseChoice ||
    pendingRoll?.kind === "chikatiloDecoyChoice";
  const defenderId = (() => {
    if (!pendingRoll) return undefined;
    if (
      pendingRoll.kind === "berserkerDefenseChoice" ||
      pendingRoll.kind === "odinMuninnDefenseChoice" ||
      pendingRoll.kind === "asgoreBraveryDefenseChoice"
    ) {
      return (pendingRoll.context as { defenderId?: string }).defenderId;
    }
    if (
      pendingRoll.kind === "dora_berserkerDefenseChoice" ||
      pendingRoll.kind === "jebeHailOfArrows_berserkerDefenseChoice" ||
      pendingRoll.kind === "carpetStrike_berserkerDefenseChoice" ||
      pendingRoll.kind === "vladForest_berserkerDefenseChoice"
    ) {
      const ctx = pendingRoll.context as {
        targetsQueue?: string[];
        currentTargetIndex?: number;
      };
      const targets = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue : [];
      const idx = typeof ctx.currentTargetIndex === "number" ? ctx.currentTargetIndex : 0;
      return targets[idx];
    }
    return undefined;
  })();
  const defenderBerserkCharges =
    defenderId && view?.units[defenderId]
      ? (view.units[defenderId].charges?.berserkAutoDefense ?? 0)
      : 0;
  const defenderMuninnCharges =
    defenderId && view?.units[defenderId]
      ? (view.units[defenderId].charges?.[ODIN_MUNINN_ID] ?? 0)
      : 0;
  const defenderAsgoreBraveryReady = !!(
    defenderId && view?.units[defenderId]?.asgoreBraveryAutoDefenseReady
  );
  const defenderFriskPacifismPoints =
    defenderId && view?.units[defenderId]
      ? (view.units[defenderId].charges?.[FRISK_PACIFISM_ID] ?? 0)
      : 0;
  const defenderFriskGenocidePoints =
    defenderId && view?.units[defenderId]
      ? (view.units[defenderId].charges?.[FRISK_GENOCIDE_ID] ?? 0)
      : 0;
  const decoyDefenderId = isChikatiloDecoyChoice
    ? (pendingRoll?.context as { defenderId?: string } | undefined)?.defenderId
    : undefined;
  const decoyCharges =
    decoyDefenderId && view?.units[decoyDefenderId]
      ? (view.units[decoyDefenderId].charges?.[CHIKATILO_DECOY_ID] ?? 0)
      : 0;
  const duelistContext = isDuelistChoice
    ? (pendingRoll?.context as { attackerId?: string; targetId?: string } | undefined)
    : undefined;
  const duelistAttackerId = duelistContext?.attackerId;
  const duelistAttackerHp =
    duelistAttackerId && view?.units[duelistAttackerId] ? view.units[duelistAttackerId].hp : 0;

  const handleLeave = useMemo(() => {
    return () => {
      if (leavingRoom) return;
      const label = roomId ?? t("game.room").toLowerCase();
      const confirmed = window.confirm(t("game.leaveConfirm", { room: label }));
      if (!confirmed) return;
      leaveRoom();
    };
  }, [leavingRoom, roomId, leaveRoom, t]);

  const readyStatus = roomMeta?.ready ?? { P1: false, P2: false };
  const playerReady = seat ? readyStatus[seat] : false;
  const canStartGame =
    !!roomMeta &&
    roomMeta.players.P1 &&
    roomMeta.players.P2 &&
    readyStatus.P1 &&
    readyStatus.P2 &&
    view?.phase === "lobby" &&
    !pendingMeta;

  return {
    pendingRoll,
    pendingMeta,
    pendingForLocalPlayer,
    hasBlockingRoll,
    isStakePlacement,
    isForestTarget,
    isIntimidateChoice,
    isForestChoice,
    isForestMoveCheck,
    isForestMoveDestination,
    isDuelistChoice,
    isChikatiloPlacement,
    isGroznyTyrantOptionChoice,
    isGroznyTyrantAllyChoice,
    isGroznyTyrantAttackCellChoice,
    isGuideTravelerPlacement,
    isJebeKhansShooterTargetChoice,
    isHassanTrueEnemyTargetChoice,
    isHassanAssassinOrderSelection,
    isAsgoreSoulParadePatienceTargetChoice,
    isAsgoreSoulParadePerseveranceTargetChoice,
    isAsgoreSoulParadeJusticeTargetChoice,
    isAsgoreSoulParadeIntegrityDestination,
    isLokiLaughtChoice,
    isLokiChickenTargetChoice,
    isLokiMindControlEnemyChoice,
    isLokiMindControlTargetChoice,
    isGutsBerserkAttackChoice,
    isFriskPacifismChoice,
    isFriskPacifismHugsTargetChoice,
    isFriskWarmWordsTargetChoice,
    isFriskGenocideChoice,
    isFriskKeenEyeChoice,
    isFriskPrecisionStrikeTargetChoice,
    isFriskSubstitutionChoice,
    isFriskChildsCryChoice,
    isFemtoDivineMoveDestination,
    isOdinSleipnirDestination,
    isChargedImpulseTargetChoice,
    isDonSorrowfulMoveChoice,
    isDonMadnessDirectionChoice,
    isRiverBoatCarryChoice,
    isRiverBoatDestinationChoice,
    isRiverBoatDropDestination,
    isRiverTraLaLaTargetChoice,
    isRiverTraLaLaDestinationChoice,
    isRiverTraLaLaDropDestinationChoice,
    isChikatiloRevealChoice,
    isChikatiloDecoyChoice,
    boardSelectionPending,
    pendingQueueCount,
    attackerDice,
    tieBreakAttacker,
    isBerserkerDefenseChoice,
    isOdinMuninnDefenseChoice,
    isAsgoreBraveryDefenseChoice,
    isFriskDefenseChoice,
    showAttackerRoll,
    defenderId,
    defenderBerserkCharges,
    defenderMuninnCharges,
    defenderAsgoreBraveryReady,
    defenderFriskPacifismPoints,
    defenderFriskGenocidePoints,
    decoyCharges,
    duelistAttackerHp,
    handleLeave,
    readyStatus,
    playerReady,
    canStartGame,
  };
}
