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
  getAbilityDisplayDetails,
  isAbilityDetailStateActive,
  isResourceAbilityDetails,
} from "../../../abilityDisplayDetails";
import {
  getAbilityDisplay,
  getAbilityTypeLabel,
  getClassLabel,
  getSlotLabel,
  localizeServerText,
} from "../../../../i18n/displayMetadata";
import { Badge } from "../../../../ui";
import { AbilityDetails } from "../../../../components/abilities/AbilityDetails";
import { getAbilityDisplayTone } from "../../../../components/abilities/abilityDisplayTone";

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
      <div className="panel-card-muted relative overflow-hidden p-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-amber-500/70" />
        <div className="flex items-center gap-3">
          <div className="relative h-20 w-20 shrink-0">
            <img
              src={tokenAsset.src}
              alt=""
              className="h-full w-full rounded-xl border border-amber-500/25 bg-white object-contain shadow-xl shadow-black/15 ring-2 ring-amber-500/55 dark:bg-slate-900"
            />
            <span className="absolute -bottom-1 -right-1 rounded-lg border border-white/20 bg-stone-950 px-1.5 py-0.5 text-[10px] font-bold text-white shadow dark:bg-amber-400 dark:text-stone-950">
              {badge.label}
              {badge.marker ?? ""}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="fate-brand truncate text-lg">{selectedHeroName}</div>
              <Badge variant={selectedUnit.owner === "P1" ? "ownerP1" : "ownerP2"}>
                {selectedUnit.owner}
              </Badge>
            </div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {t("game.class", { class: getClassLabel(selectedUnit.class, t) })}
              {showUnitIdInClassLabel ? ` (${selectedUnit.id})` : ""}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-3 flex-1 overflow-hidden rounded-full border border-black/10 bg-stone-200 shadow-inner dark:border-white/10 dark:bg-stone-900">
                <div
                  className={`h-full rounded-full transition-[width] ${
                    selectedUnit.hp / maxHp <= 0.3 ? "bg-rose-500" : "bg-emerald-500"
                  }`}
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
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="status-pill border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-200">
          {t("game.damage", { value: selectedUnit.attack })}
        </span>
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
      <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold">
        {[
          [t("game.move"), economy.moveUsed],
          [t("game.attack"), economy.attackUsed],
          [t("game.action"), economy.actionUsed],
          [t("game.stealth"), economy.stealthUsed],
        ].map(([label, used]) => (
          <span
            key={String(label)}
            className={`rounded-lg border px-1 py-2 text-center ${
              used
                ? "border-stone-300 bg-stone-100 text-stone-400 line-through dark:border-stone-800 dark:bg-black/20 dark:text-stone-500"
                : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-200"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="mt-4 border-t border-amber-900/10 pt-4 dark:border-amber-500/15">
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
            const details = getAbilityDisplayDetails(ability.id);
            const structuredResource = isResourceAbilityDetails(details);
            const structuredStateActive = details
              ? isAbilityDetailStateActive(details, selectedUnit)
              : false;
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
            const tone = getAbilityDisplayTone(
              ability.kind,
              (!ability.isAvailable && !structuredStateActive) || isChargeBlocked,
              details?.presentation,
            );
            return (
              <div
                key={ability.id}
                className={`ability-card ${tone.card} ${
                  ability.isAvailable || structuredStateActive ? "" : "opacity-70"
                }`}
                title={
                  structuredStateActive ? undefined : localizeServerText(ability.disabledReason, t)
                }
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
                    {details?.categoryKey ? t(details.categoryKey) : kindLabel}
                  </span>
                </div>
                {details ? (
                  <AbilityDetails ability={ability} details={details} unit={selectedUnit} />
                ) : (
                  <div className="mt-2 leading-5 text-slate-600 dark:text-slate-300">
                    {display.description}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t("game.slot", { slot: slotLabel })}
                  {!structuredResource && chargeLabel !== null ? (
                    <span>{t("game.charges", { charges: chargeLabel })}</span>
                  ) : null}
                </div>
                {chargeState.max !== null && !hideCharges && !structuredResource ? (
                  <div className="ability-charge-track mt-2" aria-hidden="true">
                    <div
                      className="ability-charge-fill"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            Math.round((chargeState.current / Math.max(1, chargeState.max)) * 100),
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                ) : null}
                {ability.disabledReason && !structuredStateActive && (
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
