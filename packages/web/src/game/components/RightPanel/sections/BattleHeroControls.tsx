import type { FC } from "react";
import type { PapyrusLineAxis, UnitState } from "rules";

interface BattleHeroControlsProps {
  selectedUnit: UnitState | null;
  selectedIsPapyrus: boolean;
  selectedIsUndyne: boolean;
  papyrusLineAxis: PapyrusLineAxis;
  papyrusAxisOptions: { axis: PapyrusLineAxis; label: string }[];
  undyneAxis: "row" | "col";
  undyneAxisOptions: { axis: "row" | "col"; label: string }[];
  selectedPapyrusUnbeliever: boolean;
  selectedPapyrusBoneMode: "blue" | "orange";
  selectedPapyrusLongBoneMode: boolean;
  canAct: boolean;
  onSetPapyrusAxis: (axis: PapyrusLineAxis) => void;
  onSetUndyneAxis: (axis: "row" | "col") => void;
  onSetPapyrusBoneType: (boneType: "blue" | "orange") => void;
  onTogglePapyrusLongBone: () => void;
}

export const BattleHeroControls: FC<BattleHeroControlsProps> = ({
  selectedUnit,
  selectedIsPapyrus,
  selectedIsUndyne,
  papyrusLineAxis,
  papyrusAxisOptions,
  undyneAxis,
  undyneAxisOptions,
  selectedPapyrusUnbeliever,
  selectedPapyrusBoneMode,
  selectedPapyrusLongBoneMode,
  canAct,
  onSetPapyrusAxis,
  onSetUndyneAxis,
  onSetPapyrusBoneType,
  onTogglePapyrusLongBone,
}) => {
  return (
    <>
      {selectedIsPapyrus && (
        <>
          <div className="col-span-2 mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Papyrus line axis
          </div>
          <div className="col-span-2 grid grid-cols-4 gap-2">
            {papyrusAxisOptions.map(({ axis, label }) => (
              <button
                key={axis}
                type="button"
                className={`rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition ${
                  papyrusLineAxis === axis
                    ? "border-teal-500 bg-teal-500 text-white dark:text-slate-950"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:bg-slate-800"
                }`}
                onClick={() => onSetPapyrusAxis(axis)}
                disabled={!canAct && selectedPapyrusUnbeliever}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {selectedIsUndyne && (
        <>
          <div className="col-span-2 mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Energy Spear axis
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2">
            {undyneAxisOptions.map(({ axis, label }) => (
              <button
                key={axis}
                type="button"
                className={`rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition ${
                  undyneAxis === axis
                    ? "border-teal-500 bg-teal-500 text-white dark:text-slate-950"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:bg-slate-800"
                }`}
                onClick={() => onSetUndyneAxis(axis)}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {selectedPapyrusUnbeliever && selectedUnit && (
        <>
          <div className="col-span-2 mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Bone type on hit
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition ${
                selectedPapyrusBoneMode === "blue"
                  ? "border-sky-500 bg-sky-500 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:bg-slate-800"
              }`}
              onClick={() => onSetPapyrusBoneType("blue")}
              disabled={!canAct}
            >
              Blue
            </button>
            <button
              type="button"
              className={`rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition ${
                selectedPapyrusBoneMode === "orange"
                  ? "border-orange-500 bg-orange-500 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:bg-slate-800"
              }`}
              onClick={() => onSetPapyrusBoneType("orange")}
              disabled={!canAct}
            >
              Orange
            </button>
          </div>
          <button
            type="button"
            className={`col-span-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold shadow-sm transition ${
              selectedPapyrusLongBoneMode
                ? "border-teal-500 bg-teal-500 text-white dark:text-slate-950"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:bg-slate-800"
            }`}
            onClick={onTogglePapyrusLongBone}
            disabled={!canAct}
          >
            Long Bone line attack: {selectedPapyrusLongBoneMode ? "ON" : "OFF"}
          </button>
        </>
      )}
    </>
  );
};
