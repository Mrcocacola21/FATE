import type { FC } from "react";
import { GameLoadingState } from "./GameLoadingState";
import { GameShellBoardColumn } from "./GameShellBoardColumn";
import { GameShellSideColumn } from "./GameShellSideColumn";
import { GameShellPendingRoll } from "./GameShellPendingRoll";
import { DraftScreen } from "../../../modes/DraftScreen";
import { GameTopBar } from "../../components/GameTopBar";
import { useIsMobile } from "../../../layout/useIsMobile";
import { MobileMatchLayout } from "../../layout/MobileMatchLayout";

interface GameShellLayoutProps {
  vm: any;
}

export const GameShellLayout: FC<GameShellLayoutProps> = ({ vm }) => {
  const isMobile = useIsMobile();
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

  if (isMobile) {
    return <MobileMatchLayout vm={vm} />;
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
      <GameShellPendingRoll vm={vm} />
    </div>
  );
};
