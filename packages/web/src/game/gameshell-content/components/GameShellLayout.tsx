import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import { useEffect, useRef, type FC, type ReactNode } from "react";
import { conjure, proclaim } from "../../../features/runes/runeMagic";
import { lowerVeil } from "../../../features/runes/pageRunes";
import { useSealing } from "../../../matchmaking/sealing";
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

/**
 * The battle begins in runes: when the match starts while the player is watching, "To battle"
 * is written in the middle of the page and gathered up into the head, and every figure on the
 * board is conjured out of a small whirl of runes. Figures set down later are conjured too.
 */
function BattleRunes({ vm }: GameShellLayoutProps) {
  const { t } = useI18n();
  const started =
    !!vm.view && !!vm.hasSnapshot && hasAuthoritativeMatchStarted(vm.view, vm.pendingMeta);
  const was = useRef<boolean | null>(null);
  useEffect(() => {
    const before = was.current;
    was.current = started;
    if (!started || before !== false || typeof document === "undefined") return;
    const timer = window.setTimeout(() => {
      void proclaim(t("game.toBattle"), {
        into: document.querySelector(".minimal-top-bar__center"),
      });
      document
        .querySelectorAll(".unit-token")
        .forEach((token, index) => void conjure(token, { delay: 500 + index * 90, tone: "gold" }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [started, t]);
  useEffect(() => {
    if (!started || typeof MutationObserver === "undefined" || typeof document === "undefined")
      return;
    const observer = new MutationObserver((records) => {
      for (const record of records)
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          const tokens = node.matches(".unit-token")
            ? [node]
            : Array.from(node.querySelectorAll(".unit-token"));
          tokens.slice(0, 4).forEach((token) => void conjure(token, { count: 6 }));
        });
    });
    const board = document.querySelector(".board-row")?.parentElement ?? document.body;
    observer.observe(board, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [started]);
  return null;
}

/** A matched room waits behind the accepted offer while its seals are set. */
function SealGate({ children }: { children: ReactNode }) {
  const sealing = useSealing();
  return sealing ? <MatchedRoomEntering /> : <>{children}</>;
}

function VeilLift({ ready }: { ready: boolean }) {
  const sealing = useSealing();
  useEffect(() => {
    if (ready && !sealing) lowerVeil();
  }, [ready, sealing]);
  return null;
}

function MatchedRoomEntering() {
  const { t } = useI18n();
  return (
    <div
      className="app-shell grid h-dvh place-items-center px-4"
      data-battle-screen=""
      data-testid="matched-room-entering"
    >
      <p className="text-sm text-muted" role="status">
        {t("waitingRoom.matchedStarts")}
      </p>
    </div>
  );
}

export const GameShellLayout: FC<GameShellLayoutProps> = ({ vm }) => {
  let content: ReactNode;
  let entering = false;

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
    vm.roomMeta?.origin === "MATCHMAKING" &&
    !vm.roomMeta.draftState &&
    !hasAuthoritativeMatchStarted(vm.view, vm.roomMeta.pendingRoll)
  ) {
    // A matched room starts by itself: there is no waiting room to show, only the moment before
    // the draft or the battle (under the runes of the accepted offer, when it was just made).
    content = <MatchedRoomEntering />;
    entering = true;
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

  // A matched room waits behind its accepted offer while the seals are set.
  if (vm.roomMeta?.origin === "MATCHMAKING") content = <SealGate>{content}</SealGate>;
  // The veil of an accepted offer lifts once the draft or the battle is on screen; the desktop
  // pages lift it as they gather, the phone layout here.
  const ready = !!vm.view && !!vm.hasSnapshot && content !== null && !entering;
  return (
    <>
      {content}
      <VeilLift ready={ready} />
      <GlobalPendingTaskLayer vm={vm} />
      <BattleEndScreen vm={vm} />
      <BattleScreenRootMarker />
      <BattleRunes vm={vm} />
    </>
  );
};
