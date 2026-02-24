import type { FC } from "react";
import type { GameAction } from "rules";
import { GameLoadingState } from "./GameLoadingState";
import { GameShellBoardColumn } from "./GameShellBoardColumn";
import { GameShellSideColumn } from "./GameShellSideColumn";
import { PendingRollModal } from "./PendingRollModal";

interface GameShellLayoutProps {
  vm: any;
}

export const GameShellLayout: FC<GameShellLayoutProps> = ({ vm }) => {
  if (!vm.view || !vm.hasSnapshot) {
    return (
      <GameLoadingState
        connectionStatus={vm.connectionStatus}
        joined={vm.joined}
        roomId={vm.roomId}
        role={vm.role}
        leavingRoom={vm.leavingRoom}
        onLeave={vm.handleLeave}
      />
    );
  }

  return (
    <div className="min-h-screen bg-app p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <GameShellBoardColumn vm={vm} />
        <GameShellSideColumn vm={vm} />
      </div>
      {vm.pendingRoll && vm.playerId && !vm.boardSelectionPending && (
        <PendingRollModal
          pendingRoll={vm.pendingRoll}
          view={vm.view}
          showAttackerRoll={vm.showAttackerRoll}
          attackerDice={vm.attackerDice}
          tieBreakAttacker={vm.tieBreakAttacker}
          isForestMoveCheck={vm.isForestMoveCheck}
          isForestChoice={vm.isForestChoice}
          isDuelistChoice={vm.isDuelistChoice}
          isAsgoreBraveryDefenseChoice={vm.isAsgoreBraveryDefenseChoice}
          isLokiLaughtChoice={vm.isLokiLaughtChoice}
          isFriskPacifismChoice={vm.isFriskPacifismChoice}
          isFriskGenocideChoice={vm.isFriskGenocideChoice}
          isFriskKeenEyeChoice={vm.isFriskKeenEyeChoice}
          isFriskSubstitutionChoice={vm.isFriskSubstitutionChoice}
          isFriskChildsCryChoice={vm.isFriskChildsCryChoice}
          isOdinMuninnDefenseChoice={vm.isOdinMuninnDefenseChoice}
          isChikatiloRevealChoice={vm.isChikatiloRevealChoice}
          isChikatiloDecoyChoice={vm.isChikatiloDecoyChoice}
          isBerserkerDefenseChoice={vm.isBerserkerDefenseChoice}
          lokiLaughtCurrent={vm.lokiLaughtCurrent}
          lokiCanAgainSomeNonsense={vm.lokiCanAgainSomeNonsense}
          lokiCanChicken={vm.lokiCanChicken}
          lokiCanMindControl={vm.lokiCanMindControl}
          lokiCanSpinTheDrum={vm.lokiCanSpinTheDrum}
          lokiCanGreatLokiJoke={vm.lokiCanGreatLokiJoke}
          lokiLaughtChickenOptions={vm.lokiLaughtChickenOptions}
          lokiLaughtMindControlEnemyOptions={vm.lokiLaughtMindControlEnemyOptions}
          lokiLaughtSpinCandidateIds={vm.lokiLaughtSpinCandidateIds}
          friskPacifismPoints={vm.friskPacifismPoints}
          friskPacifismDisabled={vm.friskPacifismDisabled}
          friskPacifismHugsOptions={vm.friskPacifismHugsOptions}
          friskPacifismWarmWordsOptions={vm.friskPacifismWarmWordsOptions}
          friskPacifismPowerOfFriendshipEnabled={
            vm.friskPacifismPowerOfFriendshipEnabled
          }
          friskGenocidePoints={vm.friskGenocidePoints}
          friskKeenEyeTargetIds={vm.friskKeenEyeTargetIds}
          defenderFriskGenocidePoints={vm.defenderFriskGenocidePoints}
          defenderFriskPacifismPoints={vm.defenderFriskPacifismPoints}
          defenderBerserkCharges={vm.defenderBerserkCharges}
          defenderMuninnCharges={vm.defenderMuninnCharges}
          defenderAsgoreBraveryReady={vm.defenderAsgoreBraveryReady}
          decoyCharges={vm.decoyCharges}
          duelistAttackerHp={vm.duelistAttackerHp}
          onResolvePendingRoll={(choice) => {
            if (choice === undefined) {
              vm.sendAction({
                type: "resolvePendingRoll",
                pendingRollId: vm.pendingRoll.id,
              } as GameAction);
              return;
            }
            vm.sendAction({
              type: "resolvePendingRoll",
              pendingRollId: vm.pendingRoll.id,
              choice,
            } as GameAction);
          }}
        />
      )}
    </div>
  );
};
