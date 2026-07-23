import type { GameAction } from "rules";
import { PendingRollModal } from "./PendingRollModal";

export function GameShellPendingRoll({
  vm,
  onCollapse = () => undefined,
}: {
  vm: any;
  onCollapse?: () => void;
}) {
  if (!vm.pendingRoll || !vm.playerId || vm.boardSelectionPending) return null;

  return (
    <PendingRollModal
      pendingRoll={vm.pendingRoll}
      playerId={vm.playerId}
      view={vm.view}
      lastActionResult={vm.lastActionResult}
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
      onCollapse={onCollapse}
    />
  );
}
