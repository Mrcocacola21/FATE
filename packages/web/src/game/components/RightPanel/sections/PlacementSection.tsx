import type { FC } from "react";
import type { UnitState } from "rules";
import { FALSE_TRAIL_TOKEN_ID } from "../../../../rulesHints";
import type { ActionMode } from "../../../../store";

interface PlacementSectionProps {
  unplacedUnits: UnitState[];
  friendlyUnits: UnitState[];
  placeUnitId: string | null;
  actionMode: ActionMode;
  placementEnabled: boolean;
  joined: boolean;
  pendingRoll: boolean;
  isSpectator: boolean;
  isMyTurn: boolean;
  onSetPlaceUnit: (unitId: string | null) => void;
  onSetActionMode: (mode: ActionMode) => void;
}

export const PlacementSection: FC<PlacementSectionProps> = ({
  unplacedUnits,
  friendlyUnits,
  placeUnitId,
  actionMode,
  placementEnabled,
  joined,
  pendingRoll,
  isSpectator,
  isMyTurn,
  onSetPlaceUnit,
  onSetActionMode,
}) => {
  return (
    <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:border-slate-700/60 dark:bg-slate-900/60 dark:shadow-black/40">
      <div className="text-sm text-slate-600 dark:text-slate-100">Placement</div>
      <div className="mt-3 space-y-2">
        {unplacedUnits.length === 0 && (
          <div className="text-xs text-slate-400 dark:text-slate-400">
            No unplaced units.
          </div>
        )}
        {unplacedUnits.map((unit) => (
          <button
            key={unit.id}
            className={`w-full rounded-lg px-3 py-2 text-left text-xs shadow-sm transition hover:shadow ${
              placeUnitId === unit.id
                ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
                : "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
            }`}
            onClick={() => {
              onSetPlaceUnit(unit.id);
              onSetActionMode("place");
            }}
            disabled={!placementEnabled}
          >
            {unit.heroId === FALSE_TRAIL_TOKEN_ID ? "False Trail token" : unit.id}
          </button>
        ))}
      </div>
      {actionMode === "place" && placeUnitId && (
        <div className="mt-3 text-xs text-slate-400 dark:text-slate-400">
          {(() => {
            const selected = friendlyUnits.find((u) => u.id === placeUnitId);
            const label =
              selected?.heroId === FALSE_TRAIL_TOKEN_ID
                ? "the False Trail token"
                : placeUnitId;
            return `Click a highlighted cell to place ${label}.`;
          })()}
        </div>
      )}
      {!joined && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
          Waiting for room join to place units.
        </div>
      )}
      {!pendingRoll && joined && !isSpectator && !isMyTurn && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
          Waiting for the other player to place.
        </div>
      )}
      {isSpectator && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
          Spectators cannot place units.
        </div>
      )}
      {pendingRoll && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
          Resolve the pending roll before placing units.
        </div>
      )}
    </div>
  );
};
