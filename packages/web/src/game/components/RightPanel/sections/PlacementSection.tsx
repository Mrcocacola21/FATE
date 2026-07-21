import type { FC } from "react";
import type { UnitState } from "rules";
import type { ActionMode } from "../../../../store";
import { useI18n } from "../../../../i18n";
import { getPlacementUnitLabel } from "../../../../i18n/displayMetadata";
import { getUnitTokenAsset } from "../../../../assets/registry";

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

interface PlacementUnitRowProps {
  unit: UnitState;
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: (unitId: string) => void;
}

export const PlacementUnitRow: FC<PlacementUnitRowProps> = ({
  unit,
  label,
  selected,
  disabled,
  onSelect,
}) => {
  const tokenAsset = getUnitTokenAsset(unit);
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left text-sm font-medium shadow-sm transition focus-visible:ring-4 focus-visible:ring-teal-500/15 ${
        selected
          ? "border-teal-500 bg-teal-500 text-white ring-2 ring-teal-500/15 dark:bg-teal-500 dark:text-slate-950"
          : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
      }`}
      onClick={() => onSelect(unit.id)}
      disabled={disabled}
    >
      <img
        src={tokenAsset.src}
        alt=""
        className="h-9 w-9 shrink-0 rounded-lg border border-white/40 bg-slate-950 object-contain shadow-sm dark:border-black/50"
      />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
};

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
  const { language, t } = useI18n();
  const displayOptions = { language, t };
  return (
    <div className="panel-card p-4">
      <div className="section-kicker">{t("game.deployment")}</div>
      <div className="section-title mt-1">{t("game.placeUnits")}</div>
      <div className="mt-3 space-y-2">
        {unplacedUnits.length === 0 && (
          <div className="text-xs text-slate-400 dark:text-slate-400">{t("game.noUnplaced")}</div>
        )}
        {unplacedUnits.map((unit) => (
          <PlacementUnitRow
            key={unit.id}
            unit={unit}
            label={getPlacementUnitLabel(unit, displayOptions)}
            selected={placeUnitId === unit.id}
            disabled={!placementEnabled}
            onSelect={(unitId) => {
              onSetPlaceUnit(unitId);
              onSetActionMode("place");
            }}
          />
        ))}
      </div>
      {actionMode === "place" && placeUnitId && (
        <div className="mt-3 text-xs text-slate-400 dark:text-slate-400">
          {(() => {
            const selected = friendlyUnits.find((u) => u.id === placeUnitId);
            const label = selected
              ? getPlacementUnitLabel(selected, displayOptions)
              : t("common.unknown");
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
