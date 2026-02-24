import type { FC } from "react";
import type { GameAction } from "rules";
import { Board } from "../../../components/Board";
import { ThemeToggle } from "../../../components/ThemeToggle";
import { PendingBoardNotice } from "./PendingBoardNotice";

interface GameShellBoardColumnProps {
  vm: any;
}

export const GameShellBoardColumn: FC<GameShellBoardColumnProps> = ({ vm }) => {
  return (
    <div className="min-w-0 rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <div>Room: {vm.roomId ?? "-"}</div>
        <div>Role: {vm.role ?? "-"}</div>
        <div>Connected: {vm.connectionStatus === "connected" ? "yes" : "no"}</div>
        <div>Status: {vm.connectionStatus}</div>
        <div>Joined: {vm.joined ? "yes" : "no"}</div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={vm.handleLeave}
            disabled={vm.leavingRoom}
          >
            {vm.leavingRoom ? "Leaving..." : "Leave"}
          </button>
          <ThemeToggle />
        </div>
      </div>
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
        disabled={vm.boardDisabled}
        onSelectUnit={(id) => {
          vm.setSelectedUnit(id);
          vm.setActionMode(null);
        }}
        onCellClick={vm.handleCellClick}
        onCellHover={vm.handleCellHover}
      />
      {vm.pendingMeta && !vm.pendingRoll && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-200">
          Waiting for {vm.pendingMeta.player} to roll.
        </div>
      )}
      {vm.pendingRoll && (
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
          isAsgoreSoulParadePatienceTargetChoice={
            vm.isAsgoreSoulParadePatienceTargetChoice
          }
          isAsgoreSoulParadePerseveranceTargetChoice={
            vm.isAsgoreSoulParadePerseveranceTargetChoice
          }
          isAsgoreSoulParadeJusticeTargetChoice={
            vm.isAsgoreSoulParadeJusticeTargetChoice
          }
          isAsgoreSoulParadeIntegrityDestination={
            vm.isAsgoreSoulParadeIntegrityDestination
          }
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
      )}
    </div>
  );
};
