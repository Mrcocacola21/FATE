import type { ReactNode } from "react";

export function MobileBattleScaffold({
  topBar,
  board,
  currentTask,
  bottomNav,
  bottomSheet,
  pendingRoll,
}: {
  topBar: ReactNode;
  board: ReactNode;
  currentTask: ReactNode;
  bottomNav: ReactNode;
  bottomSheet: ReactNode;
  pendingRoll: ReactNode;
}) {
  return (
    <div
      className="app-shell mobile-match-shell h-dvh w-full overflow-hidden px-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]"
      data-layout="mobile"
      data-testid="mobile-match-layout"
    >
      <div className="mx-auto flex h-full min-h-0 max-w-xl flex-col gap-1.5">
        {topBar}
        <main className="min-h-0 flex-1" data-testid="mobile-board-stage">
          {board}
        </main>
        <div className="mobile-current-task shrink-0" data-testid="mobile-current-task">
          {currentTask}
        </div>
        {bottomNav}
      </div>
      {bottomSheet}
      {pendingRoll}
    </div>
  );
}

export function DesktopMatchScaffold({
  topBar,
  board,
  sidePanel,
  pendingRoll,
}: {
  topBar: ReactNode;
  board: ReactNode;
  sidePanel: ReactNode;
  pendingRoll: ReactNode;
}) {
  return (
    <div
      className="app-shell h-dvh overflow-hidden px-2 py-2 sm:px-3"
      data-layout="desktop"
      data-testid="desktop-match-layout"
    >
      <div className="mx-auto flex h-full min-h-0 max-w-[1800px] flex-col gap-2">
        {topBar}
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(15rem,38dvh)] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,390px)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_400px]">
          {board}
          <div className="min-h-0 min-w-0" data-testid="desktop-match-panel">
            {sidePanel}
          </div>
        </div>
      </div>
      {pendingRoll}
    </div>
  );
}
