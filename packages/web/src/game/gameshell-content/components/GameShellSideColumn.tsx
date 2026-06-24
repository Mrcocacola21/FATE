import type { FC } from "react";
import { EventLog } from "../../../components/EventLog";
import { TurnQueueTracker } from "../../../components/TurnQueueTracker";
import { PanelCard, SectionHeader, StatusBadge } from "../../../components/ui";
import { PAPYRUS_LONG_BONE_ID, PAPYRUS_ORANGE_BONE_ID } from "../../../rulesHints";
import { RightPanel } from "../../components/RightPanel/RightPanel";

interface GameShellSideColumnProps {
  vm: any;
}

export const GameShellSideColumn: FC<GameShellSideColumnProps> = ({ vm }) => {
  return (
    <aside className="scroll-panel min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
      {vm.view.phase === "lobby" ? (
        <PanelCard className="p-5">
          <SectionHeader
            kicker="Staging room"
            title="Match lobby"
            description="Both players must occupy a seat and ready up before the host can start."
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(["P1", "P2"] as const).map((seat) => (
              <div key={seat} className="panel-card-muted p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {seat}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge tone={vm.roomMeta?.players[seat] ? "success" : "neutral"}>
                    {vm.roomMeta?.players[seat] ? "Occupied" : "Open"}
                  </StatusBadge>
                  <StatusBadge tone={vm.readyStatus[seat] ? "success" : "warning"}>
                    {vm.readyStatus[seat] ? "Ready" : "Waiting"}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge tone="info">{vm.roomMeta?.spectators ?? 0} spectators</StatusBadge>
            <StatusBadge tone={vm.isHost ? "special" : "neutral"}>
              You: {vm.role ?? "-"}
              {vm.isHost ? " / Host" : ""}
            </StatusBadge>
          </div>
          {vm.seat ? (
            <button
              type="button"
              className={`btn mt-4 w-full ${vm.playerReady ? "btn-warning" : "btn-primary"}`}
              onClick={() => vm.setReady(!vm.playerReady)}
              disabled={!vm.joined || !!vm.pendingMeta}
            >
              {vm.playerReady ? "Mark not ready" : "Ready up"}
            </button>
          ) : null}
          {vm.seat ? (
            <button
              type="button"
              className="btn btn-secondary mt-2 w-full"
              onClick={() => vm.switchRole("spectator")}
              disabled={!vm.joined || !!vm.pendingMeta}
            >
              Switch to spectator
            </button>
          ) : null}
          {vm.isHost ? (
            <button
              type="button"
              className="btn btn-strong mt-3 w-full"
              onClick={() => vm.startGame()}
              disabled={!vm.canStartGame}
              title={vm.canStartGame ? "Start the match" : "Both players must be seated and ready"}
            >
              Start game
            </button>
          ) : null}
        </PanelCard>
      ) : null}

      {vm.view.phase !== "lobby" ? (
        <>
          <TurnQueueTracker view={vm.view} playerId={vm.playerId} />
          <RightPanel
            view={vm.view}
            role={vm.role}
            selectedUnitId={vm.selectedUnitId}
            actionMode={vm.actionMode}
            placeUnitId={vm.placeUnitId}
            moveOptions={vm.moveOptions}
            joined={vm.joined}
            pendingRoll={vm.hasBlockingRoll}
            onHoverAbility={vm.setHoveredAbilityId}
            onHoverActionMode={(mode) =>
              vm.setHoverPreview(mode ? { type: "actionMode", mode } : null)
            }
            onSelectUnit={(id) => {
              vm.setSelectedUnit(id);
              vm.setActionMode(null);
            }}
            onSetActionMode={vm.setActionMode}
            onSetPlaceUnit={vm.setPlaceUnitId}
            onMoveRequest={(unitId, mode) => {
              vm.requestMove(unitId, mode);
              if (mode) {
                vm.setMoveOptions(null);
              }
              vm.setActionMode("move");
            }}
            onSendAction={(action) => {
              vm.sendGameAction(action);
              const preserveMode =
                action.type === "useAbility" &&
                (action.abilityId === PAPYRUS_ORANGE_BONE_ID ||
                  action.abilityId === PAPYRUS_LONG_BONE_ID);
              if (action.type !== "requestMoveOptions" && !preserveMode) {
                vm.setActionMode(null);
              }
            }}
            papyrusLineAxis={vm.papyrusLineAxis}
            onSetPapyrusLineAxis={vm.setPapyrusLineAxis}
          />
        </>
      ) : null}
      <EventLog events={vm.events} clientLog={vm.clientLog} />
    </aside>
  );
};
