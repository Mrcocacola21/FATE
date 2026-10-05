import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import type { FC, ReactNode } from "react";
import { GameLoadingState } from "./GameLoadingState";
import { GameShellBoardColumn } from "./GameShellBoardColumn";
import { GameShellSideColumn } from "./GameShellSideColumn";
import { GlobalPendingTaskLayer } from "./GlobalPendingTaskLayer";
import { DraftScreen } from "../../../modes/DraftScreen";
import { GameTopBar } from "../../components/GameTopBar";
import { MobileMatchLayout } from "../../layout/MobileMatchLayout";
import { DesktopMatchScaffold } from "../../layout/MatchScaffolds";
import { ResponsiveMatchLayout } from "../../../layout/ResponsiveMatchLayout";
import { BattleEndScreen } from "./BattleEndScreen";
import { hasAuthoritativeMatchStarted } from "../../pendingState";

interface GameShellLayoutProps {
  vm: GameShellViewModel;
}

export const DesktopMatchLayout: FC<GameShellLayoutProps> = ({ vm }) => (
  <DesktopMatchScaffold
    topBar={<GameTopBar vm={vm} />}
    board={<GameShellBoardColumn vm={vm} />}
    sidePanel={<GameShellSideColumn vm={vm} />}
  />
);

export const GameShellLayout: FC<GameShellLayoutProps> = ({ vm }) => {
  let content: ReactNode;

  if (!vm.view || !vm.hasSnapshot) {
    content = (
      <GameLoadingState
        connectionStatus={vm.connectionStatus}
        joined={vm.joined}
        roomId={vm.roomId}
        role={vm.role}
        leavingRoom={vm.leavingRoom}
        onLeave={vm.handleLeave}
      />
    );
  } else if (
    vm.roomMeta?.gameMode === "draft" &&
    vm.roomMeta?.draftState &&
    !hasAuthoritativeMatchStarted(vm.view, vm.roomMeta.pendingRoll)
  ) {
    content = (
      <DraftScreen
        vm={{
          ...vm,
          roomMeta: { ...vm.roomMeta, gameMode: "draft", draftState: vm.roomMeta.draftState },
        }}
      />
    );
  } else {
    content = (
      <ResponsiveMatchLayout
        mobile={<MobileMatchLayout vm={vm} />}
        desktop={<DesktopMatchLayout vm={vm} />}
      />
    );
  }

  return (
    <>
      {content}
      <GlobalPendingTaskLayer vm={vm} />
      <BattleEndScreen vm={vm} />
    </>
  );
};
