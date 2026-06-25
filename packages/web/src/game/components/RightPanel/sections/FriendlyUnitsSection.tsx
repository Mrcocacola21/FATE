import type { FC } from "react";
import type { UnitState } from "rules";
import { classBadge } from "../rightPanelHelpers";
import { useI18n } from "../../../../i18n";
import { getUnitTokenAsset } from "../../../../assets/registry";

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
  const { t } = useI18n();
  return (
    <div className="panel-card panel-hud p-4">
      <div className="section-kicker">{t("game.yourRoster")}</div>
      <div className="section-title mt-1">{t("game.friendlyUnits")}</div>
      <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
        {friendlyUnits.map((unit) => {
          const badge = classBadge(unit.class);
          const berserkCharges = unit.charges?.berserkAutoDefense;
          const tokenAsset = getUnitTokenAsset(unit);
          return (
            <button
              key={unit.id}
              type="button"
              className={`flex items-center gap-3 rounded-xl border px-2.5 py-2.5 text-left shadow-sm transition focus-visible:ring-4 focus-visible:ring-teal-500/15 ${
                selectedUnitId === unit.id
                  ? "border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-500/15 dark:bg-amber-950/35 dark:text-amber-100"
                  : "border-stone-300/70 bg-stone-100/55 text-stone-700 hover:-translate-y-px hover:border-amber-500/45 hover:bg-white hover:shadow-md dark:border-stone-800 dark:bg-black/20 dark:text-stone-200 dark:hover:border-amber-500/40 dark:hover:bg-stone-900"
              }`}
              onClick={() => onSelectUnit(unit.id)}
            >
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/40 bg-stone-950 text-[10px] font-semibold text-white shadow-md dark:border-black/50">
                <img
                  src={tokenAsset.src}
                  alt=""
                  className="h-full w-full rounded-xl object-contain"
                />
                {badge.marker && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold text-stone-950 shadow">
                    {badge.marker}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold">{unit.id}</div>
                <div className="text-[11px] opacity-75">
                  {t("game.hp", { hp: unit.hp })}
                  {unit.position
                    ? ` - ${unit.position.col},${unit.position.row}`
                    : ` - ${t("common.unplaced")}`}
                </div>
              </div>
              {(unit.class === "berserker" || unit.transformed) && (
                <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                  {t("game.berserkerDefenseShort")} {berserkCharges ?? 0}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
