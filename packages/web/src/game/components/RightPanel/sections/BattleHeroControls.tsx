import type { FC } from "react";
import type { PapyrusLineAxis, UnitState } from "rules";
import { useI18n } from "../../../../i18n";

interface BattleHeroControlsProps {
  selectedUnit: UnitState | null;
  selectedIsPapyrus: boolean;
  selectedIsUndyne: boolean;
  papyrusLineAxis: PapyrusLineAxis;
  papyrusAxisOptions: { axis: PapyrusLineAxis; label: string }[];
  undyneAxis: "row" | "col";
  undyneAxisOptions: { axis: "row" | "col"; label: string }[];
  selectedPapyrusUnbeliever: boolean;
  selectedPapyrusLongBoneMode: boolean;
  canAct: boolean;
  onSetPapyrusAxis: (axis: PapyrusLineAxis) => void;
  onSetUndyneAxis: (axis: "row" | "col") => void;
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
  selectedPapyrusLongBoneMode,
  canAct,
  onSetPapyrusAxis,
  onSetUndyneAxis,
  onTogglePapyrusLongBone,
}) => {
  const { t } = useI18n();
  return (
    <>
      {selectedIsPapyrus && (
        <>
          <div className="col-span-2 mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t("game.papyrusAxis")}
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
                {axis === "row"
                  ? t("game.rows")
                  : axis === "col"
                    ? t("game.columns")
                    : axis === "diagMain"
                      ? t("game.diagonalMain")
                      : t("game.diagonalAnti")}
              </button>
            ))}
          </div>
        </>
      )}
      {selectedIsUndyne && (
        <>
          <div className="col-span-2 mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t("game.energySpearAxis")}
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
                {axis === "row" ? t("game.rows") : t("game.columns")}
              </button>
            ))}
          </div>
        </>
      )}
      {selectedPapyrusUnbeliever && selectedUnit && (
        <>
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
            {t("game.longBoneMode", {
              state: selectedPapyrusLongBoneMode ? t("game.on") : t("game.off"),
            })}
          </button>
        </>
      )}
    </>
  );
};
