import type { FC } from "react";
import type { GameAction } from "rules";
import { PanelCard, SectionHeader, StatusBadge } from "../../../components/ui";
import { useI18n } from "../../../i18n";
import { getPendingRollLabel } from "../helpers";
import { PendingBoardNotice } from "./PendingBoardNotice";

interface CurrentTaskPanelProps {
  vm: any;
}

export const CurrentTaskPanel: FC<CurrentTaskPanelProps> = ({ vm }) => {
  const { language, t } = useI18n();

  if (vm.pendingRoll) {
    return (
      <div aria-live="polite">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="section-kicker">{t("game.currentTask")}</div>
            <div className="section-title mt-0.5 text-base">
              {getPendingRollLabel(vm.pendingRoll.kind, language)}
            </div>
          </div>
          <StatusBadge tone={vm.pendingRoll.player === vm.playerId ? "warning" : "neutral"} dot>
            {t("pending.pendingFor", { player: vm.pendingRoll.player })}
          </StatusBadge>
        </div>
        <PendingBoardNotice
          className="mt-0"
          pendingRollKind={vm.pendingRoll.kind}
          pendingRollContext={(vm.pendingRoll.context ?? {}) as Record<string, unknown>}
          pendingQueueCount={vm.pendingQueueCount}
          stakeSelections={vm.stakeSelections}
          stakeLimit={vm.stakeLimit}
          hassanAssassinOrderSelections={vm.hassanAssassinOrderSelections}
          isStakePlacement={vm.isStakePlacement}
          isIntimidateChoice={vm.isIntimidateChoice}
          isForestTarget={vm.isForestTarget}
          isForestMoveDestination={vm.isForestMoveDestination}
          isForestChoice={vm.isForestChoice}
          isForestMoveCheck={vm.isForestMoveCheck}
          isDuelistChoice={vm.isDuelistChoice}
          isChikatiloPlacement={vm.isChikatiloPlacement}
          isGroznyTyrantOptionChoice={vm.isGroznyTyrantOptionChoice}
          isGroznyTyrantAllyChoice={vm.isGroznyTyrantAllyChoice}
          isGroznyTyrantAttackCellChoice={vm.isGroznyTyrantAttackCellChoice}
          groznyTyrantAllowSkip={vm.groznyTyrantAllowSkip}
          isGuideTravelerPlacement={vm.isGuideTravelerPlacement}
          isRiverBoatCarryChoice={vm.isRiverBoatCarryChoice}
          isRiverBoatDestinationChoice={vm.isRiverBoatDestinationChoice}
          isRiverBoatDropDestination={vm.isRiverBoatDropDestination}
          isRiverTraLaLaTargetChoice={vm.isRiverTraLaLaTargetChoice}
          isRiverTraLaLaDestinationChoice={vm.isRiverTraLaLaDestinationChoice}
          isRiverTraLaLaDropDestinationChoice={vm.isRiverTraLaLaDropDestinationChoice}
          isJebeKhansShooterTargetChoice={vm.isJebeKhansShooterTargetChoice}
          isLokiLaughtChoice={vm.isLokiLaughtChoice}
          isLokiChickenTargetChoice={vm.isLokiChickenTargetChoice}
          isLokiMindControlEnemyChoice={vm.isLokiMindControlEnemyChoice}
          isLokiMindControlTargetChoice={vm.isLokiMindControlTargetChoice}
          isHassanTrueEnemyTargetChoice={vm.isHassanTrueEnemyTargetChoice}
          isAsgoreSoulParadePatienceTargetChoice={vm.isAsgoreSoulParadePatienceTargetChoice}
          isAsgoreSoulParadePerseveranceTargetChoice={
            vm.isAsgoreSoulParadePerseveranceTargetChoice
          }
          isAsgoreSoulParadeJusticeTargetChoice={vm.isAsgoreSoulParadeJusticeTargetChoice}
          isAsgoreSoulParadeIntegrityDestination={vm.isAsgoreSoulParadeIntegrityDestination}
          isHassanAssassinOrderSelection={vm.isHassanAssassinOrderSelection}
          isChikatiloRevealChoice={vm.isChikatiloRevealChoice}
          isChikatiloDecoyChoice={vm.isChikatiloDecoyChoice}
          isFriskPrecisionStrikeTargetChoice={vm.isFriskPrecisionStrikeTargetChoice}
          onResolveChoice={(choice) => {
            vm.sendAction({
              type: "resolvePendingRoll",
              pendingRollId: vm.pendingRoll.id,
              choice,
            } as GameAction);
          }}
          onResolveSkip={() => {
            vm.sendAction({
              type: "resolvePendingRoll",
              pendingRollId: vm.pendingRoll.id,
              choice: "skip",
            } as GameAction);
          }}
          onConfirmStakePlacement={() => {
            vm.sendAction({
              type: "resolvePendingRoll",
              pendingRollId: vm.pendingRoll.id,
              choice: { type: "placeStakes", positions: vm.stakeSelections },
            } as GameAction);
          }}
          onClearStakeSelections={() => vm.setStakeSelections([])}
          onConfirmHassanAssassinOrder={() => {
            vm.sendAction({
              type: "resolvePendingRoll",
              pendingRollId: vm.pendingRoll.id,
              choice: {
                type: "hassanAssassinOrderPick",
                unitIds: vm.hassanAssassinOrderSelections,
              },
            } as GameAction);
          }}
          onClearHassanAssassinOrder={() => vm.setHassanAssassinOrderSelections([])}
        />
      </div>
    );
  }

  if (vm.pendingMeta) {
    return (
      <div aria-live="polite">
        <PanelCard variant="arcane" className="p-3">
          <SectionHeader
            kicker={t("game.currentTask")}
            title={t("game.choicePending")}
            action={<StatusBadge tone="warning">{vm.pendingMeta.player}</StatusBadge>}
          />
          <p className="mt-2 text-xs leading-5 text-violet-800 dark:text-violet-200">
            {t("game.resolvingRoll", { player: vm.pendingMeta.player })}
          </p>
        </PanelCard>
      </div>
    );
  }

  return (
    <div aria-live="polite">
      <PanelCard variant="hud" className="p-3">
        <SectionHeader
          kicker={t("game.currentTask")}
          title={vm.actionMode ? t("game.boardSelectionActive") : t("game.noCurrentTask")}
          action={
            <StatusBadge tone={vm.view.currentPlayer === vm.playerId ? "success" : "neutral"}>
              {vm.view.currentPlayer
                ? t("game.playerTurn", { player: vm.view.currentPlayer })
                : t("common.waiting")}
            </StatusBadge>
          }
        />
        {vm.actionMode ? (
          <p className="mt-2 text-xs leading-5 text-stone-600 dark:text-stone-300">
            {t("game.boardSelectionHint")}
          </p>
        ) : null}
      </PanelCard>
    </div>
  );
};
