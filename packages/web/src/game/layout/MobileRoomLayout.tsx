import type { GameShellViewModel } from "../gameshell-content/hooks/useGameShellViewModel";
import { MinimalTopBar } from "../components/MinimalTopBar";
import { MinimalConnectionBanner } from "../components/MinimalBattleStatus";
import { GameShellSideColumn } from "../gameshell-content/components/GameShellSideColumn";

/** Phone room screen before the battle: the match header over the staging room. */
export function MobileRoomLayout({ vm }: { vm: GameShellViewModel }) {
  return (
    <div
      className="app-shell mobile-room-shell h-dvh overflow-hidden px-2 pt-2"
      data-layout="mobile"
      data-battle-screen=""
      data-testid="mobile-room-layout"
    >
      <div className="mx-auto flex h-full min-h-0 max-w-xl flex-col gap-2">
        <MinimalTopBar vm={vm} />
        <MinimalConnectionBanner vm={vm} />
        <div className="scroll-panel min-h-0 flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <GameShellSideColumn vm={vm} mobile />
        </div>
      </div>
    </div>
  );
}
