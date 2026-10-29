import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import { useEffect, type FC, type ReactNode } from "react";
import { GameLoadingState } from "./GameLoadingState";
import { GameShellBoardColumn } from "./GameShellBoardColumn";
import { GameShellSideColumn } from "./GameShellSideColumn";
import { WaitingRoomStage } from "./WaitingRoomStage";
import { GlobalPendingTaskLayer } from "./GlobalPendingTaskLayer";
import { DraftScreen } from "../../../modes/DraftScreen";
import { MinimalMobileMatchLayout } from "../../layout/MinimalMobileMatchLayout";
import { MobileRoomLayout } from "../../layout/MobileRoomLayout";
import { hasMobileMatchStarted } from "../../layout/mobilePanelState";
import { DesktopMatchScaffold } from "../../layout/MatchScaffolds";
import { BattleEndScreen } from "./BattleEndScreen";
import { hasAuthoritativeMatchStarted } from "../../pendingState";
import { DESKTOP_BREAKPOINT, useIsMobile } from "../../../layout/useIsMobile";
import { useI18n } from "../../../i18n";
import { buildMatchPanelModel } from "../matchPanelModel";
import { MinimalTopBar } from "../../components/MinimalTopBar";
import { MinimalMatchInfo } from "./MinimalMatchInfo";
import {
  isMinimalBattleOffline,
  MinimalConnectionBanner,
} from "../../components/MinimalBattleStatus";

interface GameShellLayoutProps {
  vm: GameShellViewModel;
}

export const DesktopMatchLayout: FC<GameShellLayoutProps> = ({ vm }) => {
  const { t } = useI18n();
  const wide = !useIsMobile(DESKTOP_BREAKPOINT);
  const started = hasAuthoritativeMatchStarted(vm.view!, vm.pendingMeta);
  const showInfoColumn = wide && started;
  return (
    <DesktopMatchScaffold
      offline={isMinimalBattleOffline(vm)}
      topBar={
        <>
          <MinimalTopBar vm={vm} />
          <MinimalConnectionBanner vm={vm} />
        </>
      }
      // Before the match the board is empty: the players and their buttons take its place.
      board={started ? <GameShellBoardColumn vm={vm} /> : <WaitingRoomStage vm={vm} />}
      sidePanel={<GameShellSideColumn vm={vm} />}
      infoPanel={
        showInfoColumn ? (
          <MinimalMatchInfo vm={vm} model={buildMatchPanelModel(vm, t)} />
        ) : undefined
      }
    />
  );
};

/**
 * The desktop arrangement holds only where the queue column fits; below that the battle
 * switches to its phone layout. Before the battle phones get the room screen.
 */
export function GameplayLayout({ vm }: GameShellLayoutProps) {
  const narrow = useIsMobile(DESKTOP_BREAKPOINT);
  const phone = useIsMobile();
  if (narrow && hasMobileMatchStarted(vm.view!, vm.pendingMeta)) {
    return <MinimalMobileMatchLayout vm={vm} />;
  }
  return phone ? <MobileRoomLayout vm={vm} /> : <DesktopMatchLayout vm={vm} />;
}

/** Roll windows render in a portal outside the layout, so the battle screen is marked on <html> for CSS. */
function BattleScreenRootMarker() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.battleScreen = "";
    return () => {
      delete document.documentElement.dataset.battleScreen;
    };
  }, []);
  return null;
}

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
    content = <GameplayLayout vm={vm} />;
  }

  return (
    <>
      {content}
      <GlobalPendingTaskLayer vm={vm} />
      <BattleEndScreen vm={vm} />
      <BattleScreenRootMarker />
    </>
  );
};
