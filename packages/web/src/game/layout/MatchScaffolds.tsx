import type { ReactNode } from "react";

/** Phone battle: queue and header on top, a square board, the task in the thumb zone below it. */
export function MobileBattleScaffold({
  topBar,
  board,
  currentTask,
  bottomNav,
  bottomSheet,
  offline = false,
}: {
  /** The board and panels stop taking input until the room session is back. */
  offline?: boolean;
  topBar: ReactNode;
  board: ReactNode;
  currentTask: ReactNode;
  bottomNav: ReactNode;
  bottomSheet: ReactNode;
}) {
  return (
    <div
      className="app-shell mobile-match-shell h-dvh w-full overflow-hidden px-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]"
      data-layout="mobile"
      data-battle-screen=""
      data-offline={offline ? "true" : undefined}
      data-testid="mobile-match-layout"
    >
      <div className="mobile-match-content mx-auto flex h-full min-h-0 max-w-xl flex-col gap-1">
        {topBar}
        <main className="min-h-0 flex-1" data-testid="mobile-board-stage">
          {board}
        </main>
        {currentTask ? (
          <div className="mobile-current-task shrink-0" data-testid="mobile-current-task">
            {currentTask}
          </div>
        ) : null}
      </div>
      {bottomNav}
      {bottomSheet}
    </div>
  );
}

export function DesktopMatchScaffold({
  topBar,
  board,
  sidePanel,
  infoPanel,
  offline = false,
}: {
  topBar: ReactNode;
  board: ReactNode;
  sidePanel: ReactNode;
  /** The board and panels stop taking input until the room session is back. */
  offline?: boolean;
  /** Turn queue and match-wide state, docked left on wide screens once battle starts. */
  infoPanel?: ReactNode;
}) {
  return (
    <div
      className="app-shell h-dvh overflow-hidden px-2 py-2 sm:px-3"
      data-layout="desktop"
      data-battle-screen=""
      data-offline={offline ? "true" : undefined}
      data-testid="desktop-match-layout"
    >
      <div className="mx-auto flex h-full min-h-0 max-w-[1800px] flex-col gap-2">
        {topBar}
        <div
          className={`grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(15rem,38dvh)] gap-3 lg:grid-rows-[minmax(0,1fr)] ${
            infoPanel
              ? "lg:grid-cols-[minmax(200px,230px)_minmax(0,1fr)_minmax(320px,370px)] xl:grid-cols-[250px_minmax(0,1fr)_400px]"
              : "lg:grid-cols-[minmax(0,1fr)_minmax(320px,390px)] xl:grid-cols-[minmax(0,1fr)_400px]"
          }`}
        >
          {infoPanel ? (
            <aside
              className="hidden min-h-0 min-w-0 flex-col lg:flex"
              data-testid="desktop-match-info"
            >
              {infoPanel}
            </aside>
          ) : null}
          {board}
          <div className="min-h-0 min-w-0" data-testid="desktop-match-panel">
            {sidePanel}
          </div>
        </div>
      </div>
    </div>
  );
}
