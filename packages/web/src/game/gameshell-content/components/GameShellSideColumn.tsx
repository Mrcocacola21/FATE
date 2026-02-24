import type { FC } from "react";
import { EventLog } from "../../../components/EventLog";
import { TurnQueueTracker } from "../../../components/TurnQueueTracker";
import { PAPYRUS_LONG_BONE_ID, PAPYRUS_ORANGE_BONE_ID } from "../../../rulesHints";
import { RightPanel } from "../../components/RightPanel/RightPanel";

interface GameShellSideColumnProps {
  vm: any;
}

export const GameShellSideColumn: FC<GameShellSideColumnProps> = ({ vm }) => {
  return (
    <div className="space-y-6">
      {vm.view.phase === "lobby" && (
        <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:shadow-black/40">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Room Lobby
          </div>
          <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            <div>Room: {vm.roomId ?? "-"}</div>
            <div>
              P1: {vm.roomMeta?.players.P1 ? "occupied" : "open"}{" "}
              {vm.readyStatus.P1 ? "(ready)" : "(not ready)"}
            </div>
            <div>
              P2: {vm.roomMeta?.players.P2 ? "occupied" : "open"}{" "}
              {vm.readyStatus.P2 ? "(ready)" : "(not ready)"}
            </div>
            <div>Spectators: {vm.roomMeta?.spectators ?? 0}</div>
            <div>
              You: {vm.role ?? "-"}
              {vm.seat ? ` (${vm.seat})` : ""} {vm.isHost ? "• host" : ""}
            </div>
          </div>
          {vm.seat && (
            <button
              className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition hover:shadow ${
                vm.playerReady
                  ? "bg-amber-500 text-white dark:bg-amber-400"
                  : "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
              }`}
              onClick={() => vm.setReady(!vm.playerReady)}
              disabled={!vm.joined || !!vm.pendingMeta}
            >
              {vm.playerReady ? "Unready" : "Ready"}
            </button>
          )}
          {vm.seat && (
            <button
              className="mt-2 w-full rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={() => vm.switchRole("spectator")}
              disabled={!vm.joined || !!vm.pendingMeta}
            >
              Switch to Spectator
            </button>
          )}
          {vm.isHost && (
            <button
              className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold shadow-sm transition hover:shadow ${
                vm.canStartGame
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
              }`}
              onClick={() => vm.startGame()}
              disabled={!vm.canStartGame}
            >
              Start Game
            </button>
          )}
        </div>
      )}
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
      <EventLog events={vm.events} clientLog={vm.clientLog} />
    </div>
  );
};
