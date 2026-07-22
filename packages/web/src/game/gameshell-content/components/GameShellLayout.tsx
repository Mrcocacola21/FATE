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

interface GameShellLayoutProps {
  vm: any;
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
    vm.roomMeta.draftState.phase !== "complete" &&
    vm.view.phase === "lobby"
  ) {
    content = <DraftScreen vm={vm} />;
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
