import type { FC } from "react";
import type { UnitState } from "rules";
import { classBadge } from "../rightPanelHelpers";

interface FriendlyUnitsSectionProps {
  friendlyUnits: UnitState[];
  selectedUnitId: string | null;
  onSelectUnit: (unitId: string | null) => void;
}

export const FriendlyUnitsSection: FC<FriendlyUnitsSectionProps> = ({
  friendlyUnits,
  selectedUnitId,
  onSelectUnit,
}) => {
  return (
    <div className="rounded-2xl border-ui bg-surface p-4 shadow-sm shadow-slate-900/5 dark:border-slate-700/60 dark:bg-slate-900/60 dark:shadow-black/40">
      <div className="text-sm text-slate-500 dark:text-slate-400">Units</div>
      <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
        {friendlyUnits.map((unit) => {
          const badge = classBadge(unit.class);
          const berserkCharges = unit.charges?.berserkAutoDefense;
          return (
            <button
              key={unit.id}
              className={`flex items-center gap-3 rounded-lg px-2 py-2 text-left shadow-sm transition hover:shadow ${
                selectedUnitId === unit.id
                  ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
              }`}
              onClick={() => onSelectUnit(unit.id)}
            >
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white shadow-sm dark:bg-slate-100 dark:text-slate-900">
                {badge.label}
                {badge.marker && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-bold text-slate-700 shadow dark:bg-slate-200 dark:text-slate-900">
                    {badge.marker}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <div className="text-[11px] font-semibold">{unit.id}</div>
                <div className="text-[10px] opacity-70">
                  HP {unit.hp}
                  {unit.position
                    ? ` - ${unit.position.col},${unit.position.row}`
                    : " - unplaced"}
                </div>
              </div>
              {(unit.class === "berserker" || unit.transformed) && (
                <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                  BD {berserkCharges ?? 0}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
