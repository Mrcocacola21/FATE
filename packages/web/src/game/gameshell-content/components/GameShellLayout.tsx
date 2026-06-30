import type { FC } from "react";
import type { GameAction } from "rules";
import { GameLoadingState } from "./GameLoadingState";
import { GameShellBoardColumn } from "./GameShellBoardColumn";
import { GameShellSideColumn } from "./GameShellSideColumn";
import { PendingRollModal } from "./PendingRollModal";
import { DraftScreen } from "../../../modes/DraftScreen";
import { GameTopBar } from "../../components/GameTopBar";

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

  if (
    vm.roomMeta?.gameMode === "draft" &&
    vm.roomMeta?.draftState &&
    vm.roomMeta.draftState.phase !== "complete" &&
    vm.view.phase === "lobby"
  ) {
    return <DraftScreen vm={vm} />;
  }

  return (
    <div className="app-shell h-dvh overflow-hidden px-2 py-2 sm:px-3">
      <div className="mx-auto flex h-full min-h-0 max-w-[1800px] flex-col gap-2">
        <GameTopBar vm={vm} />
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(15rem,38dvh)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,390px)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_400px]">
          <GameShellBoardColumn vm={vm} />
          <GameShellSideColumn vm={vm} />
        </div>
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
          isGutsBerserkAttackChoice={vm.isGutsBerserkAttackChoice}
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
          friskPacifismPowerOfFriendshipEnabled={vm.friskPacifismPowerOfFriendshipEnabled}
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
