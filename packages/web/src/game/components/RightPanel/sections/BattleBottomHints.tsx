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
          <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Choose move mode:
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {moveModeOptions.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-sm transition ${
                  moveDisabled
                    ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
                    : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-200 dark:hover:bg-sky-950/55"
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
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-800 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-200">
          {getActionModeHint(actionMode, papyrusLineAxis, undyneAxis)}
        </div>
      )}
    </>
  );
};
