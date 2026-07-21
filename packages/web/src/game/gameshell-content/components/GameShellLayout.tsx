import type { FC } from "react";
import { GameLoadingState } from "./GameLoadingState";
import { GameShellBoardColumn } from "./GameShellBoardColumn";
import { GameShellSideColumn } from "./GameShellSideColumn";
import { GameShellPendingRoll } from "./GameShellPendingRoll";
import { DraftScreen } from "../../../modes/DraftScreen";
import { GameTopBar } from "../../components/GameTopBar";
import { MobileMatchLayout } from "../../layout/MobileMatchLayout";
import { DesktopMatchScaffold } from "../../layout/MatchScaffolds";
import { ResponsiveMatchLayout } from "../../../layout/ResponsiveMatchLayout";

interface GameShellLayoutProps {
  vm: any;
}

export const DesktopMatchLayout: FC<GameShellLayoutProps> = ({ vm }) => (
  <DesktopMatchScaffold
    topBar={<GameTopBar vm={vm} />}
    board={<GameShellBoardColumn vm={vm} />}
    sidePanel={<GameShellSideColumn vm={vm} />}
    pendingRoll={<GameShellPendingRoll vm={vm} />}
  />
);

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
    <ResponsiveMatchLayout
      mobile={<MobileMatchLayout vm={vm} />}
      desktop={<DesktopMatchLayout vm={vm} />}
    />
  );
};
