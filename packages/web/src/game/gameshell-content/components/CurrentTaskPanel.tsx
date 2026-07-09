import type { FC } from "react";
import type { GameAction } from "rules";
import type { ActionPreviewMode } from "../../../store";
import { getActionModeHint } from "../../components/RightPanel/rightPanelHelpers";
import {
  getCostPreview,
  getUsingName,
} from "../../components/RightPanel/sections/BattleBottomHints";
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
          isFriskPacifismHugsTargetChoice={vm.isFriskPacifismHugsTargetChoice}
          isFriskWarmWordsTargetChoice={vm.isFriskWarmWordsTargetChoice}
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

  if (vm.actionMode && vm.targetingMode) {
    const abilityViews =
      vm.selectedUnitId && vm.view.abilitiesByUnitId
        ? vm.view.abilitiesByUnitId[vm.selectedUnitId] ?? []
        : [];
    const undyneAxis =
      vm.undyneAxis === "col" || vm.papyrusLineAxis === "col" ? "col" : "row";

    return (
      <div aria-live="polite">
        <PanelCard variant="hud" className="p-3">
          <SectionHeader
            kicker={t("game.currentTask")}
            title={t("game.usingTargeting", {
              name: getUsingName(vm.targetingMode, abilityViews, language, t),
            })}
            action={<StatusBadge tone="warning">{t("game.boardSelectionActive")}</StatusBadge>}
          />
          <p className="mt-2 text-xs leading-5 text-stone-600 dark:text-stone-300">
            {t("game.targetingInstruction", {
              instruction: getActionModeHint(
                vm.actionMode as ActionPreviewMode,
                vm.papyrusLineAxis ?? "row",
                undyneAxis,
                language,
              ),
            })}
          </p>
          <p className="mt-1 text-xs leading-5 text-sky-700 dark:text-sky-200">
            {t("game.targetingCost", {
              cost: getCostPreview(vm.targetingMode, abilityViews, t),
            })}
          </p>
          <button
            type="button"
            className="mt-2 rounded-md border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-bold text-sky-800 shadow-sm transition hover:border-sky-400 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100 dark:hover:bg-sky-900/50"
            onClick={() => vm.setActionMode(null)}
          >
            {t("common.cancel")}
          </button>
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
