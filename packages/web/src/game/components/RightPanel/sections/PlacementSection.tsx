import type { FC } from "react";
import type { UnitState } from "rules";
import { FALSE_TRAIL_TOKEN_ID } from "../../../../rulesHints";
import type { ActionMode } from "../../../../store";
import { useI18n } from "../../../../i18n";

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
  const { t } = useI18n();
  return (
    <div className="panel-card p-4">
      <div className="section-kicker">{t("game.deployment")}</div>
      <div className="section-title mt-1">{t("game.placeUnits")}</div>
      <div className="mt-3 space-y-2">
        {unplacedUnits.length === 0 && (
          <div className="text-xs text-slate-400 dark:text-slate-400">{t("game.noUnplaced")}</div>
        )}
        {unplacedUnits.map((unit) => (
          <button
            key={unit.id}
            className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm font-medium shadow-sm transition focus-visible:ring-4 focus-visible:ring-teal-500/15 ${
              placeUnitId === unit.id
                ? "border-teal-500 bg-teal-500 text-white dark:bg-teal-500 dark:text-slate-950"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
            }`}
            onClick={() => {
              onSetPlaceUnit(unit.id);
              onSetActionMode("place");
            }}
            disabled={!placementEnabled}
          >
            {unit.heroId === FALSE_TRAIL_TOKEN_ID ? t("game.falseTrailToken") : unit.id}
          </button>
        ))}
      </div>
      {actionMode === "place" && placeUnitId && (
        <div className="mt-3 text-xs text-slate-400 dark:text-slate-400">
          {(() => {
            const selected = friendlyUnits.find((u) => u.id === placeUnitId);
            const label =
              selected?.heroId === FALSE_TRAIL_TOKEN_ID ? t("game.falseTrailToken") : placeUnitId;
            return t("game.placeHint", { unit: label });
          })()}
        </div>
      )}
      {!joined && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
          {t("game.waitingJoinPlacement")}
        </div>
      )}
      {!pendingRoll && joined && !isSpectator && !isMyTurn && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
          {t("game.waitingOtherPlacement")}
        </div>
      )}
      {isSpectator && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
          {t("game.spectatorPlacementBlocked")}
        </div>
      )}
      {pendingRoll && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
          {t("game.pendingPlacementBlocked")}
        </div>
      )}
    </div>
  );
};
