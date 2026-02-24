import type { FC } from "react";
import type { PlayerView } from "rules";
import { ARENA_BONE_FIELD_ID } from "../../../../rulesHints";
import type { ForestMarkerView, TurnEconomyState } from "../types";

interface StatusSectionProps {
  view: PlayerView;
  stormActive: boolean;
  forestMarkers: ForestMarkerView[];
  isSpectator: boolean;
  canStartTurn: boolean;
  expectedUnitId: string | undefined;
  legalIntents: PlayerView["legalIntents"];
  economy: TurnEconomyState;
  pendingRoll: boolean;
  onStartTurn: (unitId: string) => void;
}

export const StatusSection: FC<StatusSectionProps> = ({
  view,
  stormActive,
  forestMarkers,
  isSpectator,
  canStartTurn,
  expectedUnitId,
  legalIntents,
  economy,
  pendingRoll,
  onStartTurn,
}) => {
  return (
    <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:border-slate-700/60 dark:bg-slate-900/60 dark:shadow-black/40">
      <div className="text-sm text-slate-600 dark:text-slate-100">Status</div>
      <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
        <div>Phase: {view.phase}</div>
        <div>Current Player: {view.currentPlayer}</div>
        <div>Round: {view.roundNumber}</div>
        <div>Turn: {view.turnNumber}</div>
        <div>Active Unit: {view.activeUnitId ?? "-"}</div>
        <div>Arena: {view.arenaId ?? "-"}</div>
        {view.arenaId === ARENA_BONE_FIELD_ID && (
          <div className="text-[11px] text-cyan-700 dark:text-cyan-300">
            Bone Field turns left: {Math.max(0, view.boneFieldTurnsLeft ?? 0)}
          </div>
        )}
        {stormActive && (
          <div className="text-[11px] text-amber-700 dark:text-amber-300">
            Storm active: non-exempt units can only attack adjacent targets.
          </div>
        )}
        {forestMarkers.length > 0 && (
          <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
            Forest markers:{" "}
            {forestMarkers
              .map(
                (marker) =>
                  `${marker.owner}:${marker.position.col},${marker.position.row}`
              )
              .join(" | ")}
          </div>
        )}
        {isSpectator && (
          <div className="text-xs text-amber-600 dark:text-amber-300">
            Spectating
          </div>
        )}
      </div>
      {canStartTurn && expectedUnitId && (
        <button
          className="mt-3 w-full rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:shadow dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
          onClick={() => onStartTurn(expectedUnitId)}
        >
          Start Turn: {expectedUnitId}
        </button>
      )}
      {legalIntents && (
        <div className="mt-3 space-y-1 text-[10px] text-slate-500 dark:text-slate-400">
          <div>
            Legal: SM={legalIntents.canSearchMove ? "true" : "false"} SA=
            {legalIntents.canSearchAction ? "true" : "false"} (reasons:{" "}
            {legalIntents.searchMoveReason ?? "-"} /{" "}
            {legalIntents.searchActionReason ?? "-"})
          </div>
          <div>
            Economy: moveUsed={economy.moveUsed ? "true" : "false"} actionUsed=
            {economy.actionUsed ? "true" : "false"} attackUsed=
            {economy.attackUsed ? "true" : "false"} stealthUsed=
            {economy.stealthUsed ? "true" : "false"}
          </div>
          <div>pendingRoll: {pendingRoll ? "true" : "false"}</div>
        </div>
      )}
    </div>
  );
};
