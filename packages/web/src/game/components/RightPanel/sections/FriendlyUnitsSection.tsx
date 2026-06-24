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
    <div className="panel-card p-4">
      <div className="section-kicker">Your roster</div>
      <div className="section-title mt-1">Friendly units</div>
      <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
        {friendlyUnits.map((unit) => {
          const badge = classBadge(unit.class);
          const berserkCharges = unit.charges?.berserkAutoDefense;
          return (
            <button
              key={unit.id}
              type="button"
              className={`flex items-center gap-3 rounded-xl border px-2.5 py-2.5 text-left shadow-sm transition focus-visible:ring-4 focus-visible:ring-teal-500/15 ${
                selectedUnitId === unit.id
                  ? "border-teal-500 bg-teal-500 text-white shadow-teal-950/10 dark:bg-teal-500 dark:text-slate-950"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:-translate-y-px hover:border-slate-300 hover:bg-white hover:shadow-md dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
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
                <div className="text-xs font-semibold">{unit.id}</div>
                <div className="text-[11px] opacity-75">
                  HP {unit.hp}
                  {unit.position ? ` - ${unit.position.col},${unit.position.row}` : " - unplaced"}
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
