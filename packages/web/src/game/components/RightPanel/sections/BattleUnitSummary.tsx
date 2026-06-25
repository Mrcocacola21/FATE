import type { FC } from "react";
import type { AbilityView, UnitClass, UnitState } from "rules";
import {
  getUnitTokenAsset,
  getUnitVisualVariant,
  getUnitVisualVariantLabelKey,
} from "../../../../assets/registry";
import { EL_CID_KOLADA_ID, getMaxHp, KAISER_DORA_ID } from "../../../../rulesHints";
import { classBadge, formatChargeLabel, getAbilityChargeState } from "../rightPanelHelpers";
import type { ForestMarkerView, TurnEconomyState } from "../types";
import { useI18n } from "../../../../i18n";
import {
  getAbilityDisplay,
  getAbilityTypeLabel,
  getClassLabel,
  getSlotLabel,
  localizeServerText,
} from "../../../../i18n/displayMetadata";

interface BattleUnitSummaryProps {
  selectedUnit: UnitState | null;
  selectedHeroName: string | null;
  showUnitIdInClassLabel: boolean;
  selectedMettatonRating: number | null;
  forestMarkers: ForestMarkerView[];
  selectedInsideForest: boolean;
  stormActive: boolean;
  selectedStormExempt: boolean;
  moveRoll: number | null | undefined;
  economy: TurnEconomyState;
  abilityViews: AbilityView[];
  onHoverAbility: (abilityId: string | null) => void;
}

function abilityTone(kind: AbilityView["kind"], unavailable: boolean) {
  if (unavailable) {
    return {
      card: "border-slate-200 bg-slate-100/80 dark:border-slate-800 dark:bg-slate-950/45",
      badge:
        "border-slate-300 bg-slate-200 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
    };
  }
  switch (kind) {
    case "passive":
      return {
        card: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/25",
        badge:
          "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
      };
    case "impulse":
      return {
        card: "border-amber-200 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/25",
        badge:
          "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
      };
    case "phantasm":
      return {
        card: "border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50/60 dark:border-violet-800/80 dark:from-violet-950/40 dark:to-fuchsia-950/20",
        badge:
          "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-700 dark:bg-violet-900/60 dark:text-violet-200",
      };
    default:
      return {
        card: "border-sky-200 bg-sky-50/70 dark:border-sky-900/70 dark:bg-sky-950/25",
        badge:
          "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
      };
  }
}

export const BattleUnitSummary: FC<BattleUnitSummaryProps> = ({
  selectedUnit,
  selectedHeroName,
  showUnitIdInClassLabel,
  selectedMettatonRating,
  forestMarkers,
  selectedInsideForest,
  stormActive,
  selectedStormExempt,
  moveRoll,
  economy,
  abilityViews,
  onHoverAbility,
}) => {
  const { language, t } = useI18n();
  if (!selectedUnit) {
    return (
      <div className="panel-card-muted mt-3 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        {t("game.selectUnitHint")}
      </div>
    );
  }

  const badge = classBadge(selectedUnit.class);
  const tokenAsset = getUnitTokenAsset(selectedUnit);
  const visualVariant = getUnitVisualVariant(selectedUnit);
  const visualVariantLabelKey = getUnitVisualVariantLabelKey(visualVariant);
  const maxHp = getMaxHp(selectedUnit.class as UnitClass, selectedUnit.heroId);

  return (
    <div className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-200">
      <div className="panel-card-muted flex items-center gap-3 p-3">
        <div className="relative h-14 w-14 shrink-0">
          <img
            src={tokenAsset.src}
            alt=""
            className="h-full w-full rounded-xl bg-white object-contain shadow-md ring-2 ring-teal-400/70 dark:bg-slate-900"
          />
          <span className="absolute -bottom-1 -right-1 rounded-lg bg-slate-950 px-1.5 py-0.5 text-[10px] font-bold text-white shadow dark:bg-white dark:text-slate-950">
            {badge.label}
            {badge.marker ?? ""}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-slate-950 dark:text-white">
            {selectedHeroName}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {t("game.class", { class: getClassLabel(selectedUnit.class, t) })}
            {showUnitIdInClassLabel ? ` (${selectedUnit.id})` : ""}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, Math.round((selectedUnit.hp / maxHp) * 100)),
                  )}%`,
                }}
              />
            </div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {selectedUnit.hp}/{maxHp} {t("game.healthShort")}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {visualVariantLabelKey ? (
          <span className="status-pill border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/45 dark:text-violet-200">
            {t(visualVariantLabelKey)}
          </span>
        ) : null}
        <span className="status-pill border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {t("game.position", {
            position: selectedUnit.position
              ? `${selectedUnit.position.col},${selectedUnit.position.row}`
              : t("common.unplaced"),
          })}
        </span>
        {selectedUnit.sansMoveLockArmed ? (
          <span className="status-pill border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-200">
            {t("game.moveLocked")}
          </span>
        ) : null}
        {selectedUnit.sansLastAttackCurseSourceId ? (
          <span className="status-pill border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/45 dark:text-fuchsia-200">
            {t("game.cursed")}
          </span>
        ) : null}
        {selectedUnit.sansBoneFieldStatus ? (
          <span className="status-pill border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/45 dark:text-cyan-200">
            {t("game.boneStatus", {
              bone:
                selectedUnit.sansBoneFieldStatus.kind === "orange"
                  ? t("game.orange")
                  : t("game.blue"),
            })}
          </span>
        ) : null}
        {selectedMettatonRating !== null ? (
          <span className="status-pill border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-200">
            {t("game.rating", { rating: selectedMettatonRating })}
          </span>
        ) : null}
        {selectedUnit.undyneImmortalActive ? (
          <span className="status-pill border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-200">
            {t("game.immortal")}
          </span>
        ) : null}
      </div>
      {forestMarkers.length > 0 && selectedUnit.position && (
        <div className="text-xs text-emerald-700 dark:text-emerald-300">
          {t("game.forestAura", {
            state: selectedInsideForest ? t("game.inside") : t("game.outside"),
          })}
        </div>
      )}
      {stormActive && selectedUnit.position && (
        <div
          className={`text-xs ${
            selectedStormExempt
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-amber-700 dark:text-amber-300"
          }`}
        >
          {t("game.stormState", {
            state: selectedStormExempt ? t("game.exempt") : t("game.restricted"),
          })}
        </div>
      )}
      {moveRoll !== null && moveRoll !== undefined && (
        <div className="text-xs text-slate-500 dark:text-slate-300">
          {t("game.moveRoll", { roll: moveRoll })}
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-200">
        <span
          className={`rounded-full px-2 py-0.5 ${
            economy.moveUsed
              ? "bg-slate-200 dark:bg-slate-800"
              : "bg-emerald-100 dark:bg-emerald-900/40"
          }`}
        >
          {t("game.move")} {economy.moveUsed ? "X" : "-"}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 ${
            economy.attackUsed
              ? "bg-slate-200 dark:bg-slate-800"
              : "bg-emerald-100 dark:bg-emerald-900/40"
          }`}
        >
          {t("game.attack")} {economy.attackUsed ? "X" : "-"}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 ${
            economy.actionUsed
              ? "bg-slate-200 dark:bg-slate-800"
              : "bg-emerald-100 dark:bg-emerald-900/40"
          }`}
        >
          {t("game.action")} {economy.actionUsed ? "X" : "-"}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 ${
            economy.stealthUsed
              ? "bg-slate-200 dark:bg-slate-800"
              : "bg-emerald-100 dark:bg-emerald-900/40"
          }`}
        >
          {t("game.stealth")} {economy.stealthUsed ? "X" : "-"}
        </span>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
          {t("game.abilities")}
        </div>
        {abilityViews.length === 0 && (
          <div className="mt-2 text-sm text-slate-400 dark:text-slate-400">
            {t("game.noAbilities")}
          </div>
        )}
        <div className="mt-2 space-y-2">
          {abilityViews.map((ability) => {
            const hideCharges = ability.id === KAISER_DORA_ID && !!selectedUnit.transformed;
            const chargeState = getAbilityChargeState(ability.id, selectedUnit, ability);
            const chargeLabel = formatChargeLabel(ability, chargeState, hideCharges);
            const isChargeBlocked = ability.kind !== "passive" && !chargeState.enabled;
            const showChargeWarning =
              !!chargeState.reason && chargeState.reason !== ability.disabledReason;
            const slotLabel = getSlotLabel(ability.slot, t);
            const kindLabel = getAbilityTypeLabel(ability.kind, t);
            const display = getAbilityDisplay(
              ability.id,
              ability.name,
              ability.description,
              language,
            );
            const tone = abilityTone(ability.kind, !ability.isAvailable || isChargeBlocked);
            return (
              <div
                key={ability.id}
                className={`rounded-xl border p-3 text-xs shadow-sm ${tone.card} ${
                  ability.isAvailable ? "" : "opacity-70"
                }`}
                title={localizeServerText(ability.disabledReason, t)}
                onMouseEnter={() => {
                  if (ability.id === EL_CID_KOLADA_ID) {
                    onHoverAbility(ability.id);
                  }
                }}
                onMouseLeave={() => {
                  if (ability.id === EL_CID_KOLADA_ID) {
                    onHoverAbility(null);
                  }
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {display.name}
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.badge}`}
                  >
                    {kindLabel}
                  </span>
                </div>
                <div className="mt-2 leading-5 text-slate-600 dark:text-slate-300">
                  {display.description}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t("game.slot", { slot: slotLabel })}
                  {chargeLabel !== null ? (
                    <span>{t("game.charges", { charges: chargeLabel })}</span>
                  ) : null}
                </div>
                {ability.disabledReason && (
                  <div className="mt-1 text-amber-700 dark:text-amber-300">
                    {localizeServerText(ability.disabledReason, t)}
                  </div>
                )}
                {showChargeWarning && (
                  <div className="mt-1 text-amber-700 dark:text-amber-300">
                    {chargeState.reason ? t(chargeState.reason) : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
