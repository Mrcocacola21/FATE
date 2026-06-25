import type { FC } from "react";
import type { UnitState } from "rules";
import type { Translate } from "../../i18n";
import {
  getAbilityDisplayOptionAvailability,
  isAbilityDisplayOptionActive,
  type AbilityDisplayAbility,
  type AbilityDisplayDetails,
  type AbilityDisplayOption,
} from "../../game/abilityDisplayDetails";

interface NestedAbilityOptionsProps {
  ability: AbilityDisplayAbility;
  details: AbilityDisplayDetails;
  options: AbilityDisplayOption[];
  unit?: UnitState;
  t: Translate;
  showAvailability?: boolean;
}

export const NestedAbilityOptions: FC<NestedAbilityOptionsProps> = ({
  ability,
  details,
  options,
  unit,
  t,
  showAvailability = true,
}) => {
  return (
    <div className="space-y-2">
      {options.map((option) => {
        const availability = getAbilityDisplayOptionAvailability(details, option, ability, unit);
        const active = isAbilityDisplayOptionActive(option, unit);
        const showAvailabilityBadge =
          (showAvailability && option.cost !== undefined && option.cost.amount !== null) ||
          (showAvailability && (option.requires !== undefined || option.activeWhen !== undefined));
        const unavailableReason = showAvailability
          ? availability.reasonKey === "abilityDetails.reasons.notEnoughResource" &&
            option.cost?.amount !== null &&
            option.cost?.amount !== undefined
            ? t(availability.reasonKey, {
                amount: option.cost.amount,
                resource: t(option.cost.resourceKey),
              })
            : availability.reasonKey
              ? t(availability.reasonKey, availability.reasonValues)
              : null
          : null;
        const dimmed = showAvailability && !availability.available;

        return (
          <div
            key={option.id}
            className={`rounded-lg border px-2.5 py-2 transition ${
              !dimmed
                ? "border-slate-200 bg-white/75 dark:border-slate-700 dark:bg-slate-950/45"
                : "border-slate-200 bg-slate-100/70 opacity-60 dark:border-slate-800 dark:bg-slate-950/65"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 font-semibold text-slate-900 dark:text-slate-100">
                <span>{t(option.nameKey)}</span>
                {option.roll !== undefined ? (
                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {t("abilityDetails.labels.roll", { roll: option.roll })}
                  </span>
                ) : null}
              </div>
              {showAvailabilityBadge ? (
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    availability.available
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                      : "border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                  }`}
                >
                  {active
                    ? t("abilityDetails.labels.unlocked")
                    : availability.available
                      ? t("abilityDetails.labels.available")
                      : t("abilityDetails.labels.unavailable")}
                </span>
              ) : null}
            </div>

            {option.types?.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {option.types.map((type) => (
                  <span
                    key={type}
                    className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {t(`abilityDetails.types.${type}`)}
                  </span>
                ))}
              </div>
            ) : null}

            {option.cost ? (
              <div className="mt-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {option.cost.amount === null
                  ? t("abilityDetails.labels.noManualCost")
                  : t("abilityDetails.labels.cost", {
                      amount: option.cost.amount,
                      resource: t(option.cost.resourceKey),
                    })}
              </div>
            ) : null}

            <div className="mt-1.5 leading-5 text-slate-600 dark:text-slate-300">
              {t(option.descriptionKey)}
            </div>

            {unavailableReason ? (
              <div className="mt-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                {unavailableReason}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
