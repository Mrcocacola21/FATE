import type { FC } from "react";
import type { MoveMode, PapyrusLineAxis } from "rules";
import type { ActionMode } from "../../../../store";
import { formatMoveMode, getActionModeHint } from "../rightPanelHelpers";

interface BattleBottomHintsProps {
  moveModeOptions: MoveMode[] | null;
  selectedUnitId: string | null;
  moveDisabled: boolean;
  actionMode: ActionMode;
  papyrusLineAxis: PapyrusLineAxis;
  undyneAxis: "row" | "col";
  onMoveRequest: (unitId: string, mode?: MoveMode) => void;
}

export const BattleBottomHints: FC<BattleBottomHintsProps> = ({
  moveModeOptions,
  selectedUnitId,
  moveDisabled,
  actionMode,
  papyrusLineAxis,
  undyneAxis,
  onMoveRequest,
}) => {
  return (
    <>
      {moveModeOptions && selectedUnitId && (
        <div className="mt-3 text-xs">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Choose move mode:
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {moveModeOptions.map((mode) => (
              <button
                key={mode}
                className={`rounded-lg px-2 py-1 text-[10px] shadow-sm transition hover:shadow ${
                  moveDisabled
                    ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
                }`}
                onClick={() => onMoveRequest(selectedUnitId, mode)}
                disabled={moveDisabled}
              >
                {formatMoveMode(mode)}
              </button>
            ))}
          </div>
        </div>
      )}

      {actionMode && (
        <div className="mt-3 text-xs text-slate-400 dark:text-slate-400">
          {getActionModeHint(actionMode, papyrusLineAxis, undyneAxis)}
        </div>
      )}
    </>
  );
};
