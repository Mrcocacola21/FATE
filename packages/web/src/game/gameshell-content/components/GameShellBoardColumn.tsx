import type { FC } from "react";
import type { GameAction } from "rules";
import { Board } from "../../../components/Board";
import { ThemeToggle } from "../../../components/ThemeToggle";
import { LanguageSwitcher } from "../../../components/LanguageSwitcher";
import { PanelCard, StatusBadge } from "../../../components/ui";
import { PendingBoardNotice } from "./PendingBoardNotice";
import { useI18n } from "../../../i18n";
import { getConnectionLabel, getPhaseLabel } from "../../../i18n/displayMetadata";
import { StatPill } from "../../../ui";
import { getGameModeName } from "../../../modes/modeLabels";

interface GameShellBoardColumnProps {
  vm: any;
}

export const GameShellBoardColumn: FC<GameShellBoardColumnProps> = ({ vm }) => {
  const { t } = useI18n();
  return (
    <PanelCard variant="hud" className="min-w-0 overflow-hidden">
      <div className="border-b border-amber-900/10 px-4 py-4 dark:border-amber-500/15 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="brand-sigil hidden h-11 w-11 sm:flex" aria-hidden="true" />
            <div className="min-w-0">
              <div className="section-kicker">{t("game.tacticalArena")}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="fate-brand text-xl">{t("game.matchTitle")}</h1>
                <StatusBadge tone={vm.connectionStatus === "connected" ? "success" : "danger"} dot>
                  {getConnectionLabel(vm.connectionStatus, t)}
                </StatusBadge>
                <StatusBadge tone={vm.role === "spectator" ? "info" : "neutral"}>
                  {vm.role ? t(`roles.${vm.role}`) : t("roles.noRole")}
                </StatusBadge>
                {vm.roomMeta?.roomMode === "test" ? (
                  <StatusBadge tone="special">{t("testRoom.badgeSandbox")}</StatusBadge>
                ) : null}
                {vm.roomMeta?.roomMode === "normal" ? (
                  <StatusBadge tone="info">
                    {getGameModeName(vm.roomMeta?.gameMode ?? "standard", t)}
                  </StatusBadge>
                ) : null}
              </div>
              <div className="mt-1 max-w-full truncate font-mono text-[11px] text-stone-500 dark:text-stone-400">
                {t("game.room")} {vm.roomId ?? "-"}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={vm.handleLeave}
              disabled={vm.leavingRoom}
            >
              {vm.leavingRoom ? t("game.leaving") : t("game.leaveMatch")}
            </button>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <div className="hud-strip mt-4">
          <StatPill label={t("game.phase")} value={getPhaseLabel(vm.view.phase, t)} tone="amber" />
          <StatPill
            label={t("game.currentPlayer")}
            value={vm.view.currentPlayer ?? "-"}
            tone="sky"
          />
          <StatPill
            label={t("game.roundTurn")}
            value={`${vm.view.roundNumber} / ${vm.view.turnNumber}`}
            tone="neutral"
          />
          <StatPill
            label={t("game.activeUnit")}
            value={vm.view.activeUnitId ?? "-"}
            tone="violet"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-semibold text-stone-500 dark:text-stone-400">
          {[
            [t("game.legalMove"), "bg-sky-400 ring-sky-500"],
            [t("game.legalAttack"), "bg-rose-400 ring-rose-500"],
            [t("game.abilityArea"), "bg-amber-400 ring-amber-500"],
          ].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ring-1 ${color}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="p-2 sm:p-4">
        <Board
          view={vm.view}
          playerId={vm.playerId}
          selectedUnitId={vm.selectedUnitId}
          highlightedCells={vm.highlightedCells}
          hoveredAbilityId={vm.hoveredAbilityId}
          doraPreview={
            vm.boardPreviewCenter
              ? {
                  center: vm.boardPreviewCenter,
                  radius:
                    vm.actionMode === "kaladinFifth"
                      ? 2
                      : vm.actionMode === "mettatonLaser" ||
                          vm.actionMode === "sansGasterBlaster" ||
                          vm.actionMode === "undyneEnergySpear"
                        ? 0
                        : 1,
                }
              : null
          }
          allowUnitSelection={vm.allowUnitPick}
          allowAnyUnitSelection={vm.canControlTestRoom}
          visualEffectsEnabled={vm.connectionStatus === "connected" && vm.hasSnapshot}
          eventBatch={vm.latestEventBatch}
          effectSessionKey={vm.roomId}
          previewLine={
            vm.boardPreviewCenter &&
            vm.selectedUnit?.position &&
            (vm.actionMode === "mettatonLaser" ||
              vm.actionMode === "sansGasterBlaster" ||
              vm.actionMode === "undyneEnergySpear")
              ? {
                  from: vm.selectedUnit.position,
                  to: vm.boardPreviewCenter,
                  tone: "magic",
                }
              : null
          }
          disabled={vm.boardDisabled}
          onSelectUnit={(id) => {
            vm.setSelectedUnit(id);
            vm.setActionMode(null);
          }}
          onCellClick={vm.handleCellClick}
          onCellHover={vm.handleCellHover}
        />

        {vm.pendingMeta && !vm.pendingRoll ? (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-200">
            {t("game.resolvingRoll", { player: vm.pendingMeta.player })}
          </div>
        ) : null}

        {vm.pendingRoll ? (
          <PendingBoardNotice
            pendingRollKind={vm.pendingRoll.kind}
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
            isGuideTravelerPlacement={vm.isGuideTravelerPlacement}
            isRiverBoatCarryChoice={vm.isRiverBoatCarryChoice}
            isRiverBoatDropDestination={vm.isRiverBoatDropDestination}
            isRiverTraLaLaTargetChoice={vm.isRiverTraLaLaTargetChoice}
            isRiverTraLaLaDestinationChoice={vm.isRiverTraLaLaDestinationChoice}
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
        ) : null}
      </div>
    </PanelCard>
  );
};
