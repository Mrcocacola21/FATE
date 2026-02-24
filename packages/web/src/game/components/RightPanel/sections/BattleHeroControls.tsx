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
          <div className="col-span-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Papyrus line axis
          </div>
          <div className="col-span-2 grid grid-cols-4 gap-2">
            {papyrusAxisOptions.map(({ axis, label }) => (
              <button
                key={axis}
                className={`rounded-lg px-2 py-2 text-[10px] shadow-sm transition hover:shadow ${
                  papyrusLineAxis === axis
                    ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
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
          <div className="col-span-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Energy Spear axis
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2">
            {undyneAxisOptions.map(({ axis, label }) => (
              <button
                key={axis}
                className={`rounded-lg px-2 py-2 text-[10px] shadow-sm transition hover:shadow ${
                  undyneAxis === axis
                    ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
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
          <div className="col-span-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Bone type on hit
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <button
              className={`rounded-lg px-2 py-2 text-[10px] shadow-sm transition hover:shadow ${
                selectedPapyrusBoneMode === "blue"
                  ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
              }`}
              onClick={() => onSetPapyrusBoneType("blue")}
              disabled={!canAct}
            >
              Blue
            </button>
            <button
              className={`rounded-lg px-2 py-2 text-[10px] shadow-sm transition hover:shadow ${
                selectedPapyrusBoneMode === "orange"
                  ? "bg-orange-500 text-white dark:bg-orange-800/60 dark:text-slate-100"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
              }`}
              onClick={() => onSetPapyrusBoneType("orange")}
              disabled={!canAct}
            >
              Orange
            </button>
          </div>
          <button
            className={`col-span-2 rounded-lg px-2 py-2 text-left text-[10px] shadow-sm transition hover:shadow ${
              selectedPapyrusLongBoneMode
                ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100"
                : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
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
