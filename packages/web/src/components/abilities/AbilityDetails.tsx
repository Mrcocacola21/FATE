import type { FC } from "react";
import type { UnitState } from "rules";
import { useI18n } from "../../i18n";
import {
  getAbilityResourceMax,
  getAbilityResourceValue,
  isAbilityDetailStateActive,
  type AbilityDisplayAbility,
  type AbilityDisplayDetails,
} from "../../game/abilityDisplayDetails";
import { NestedAbilityOptions } from "./NestedAbilityOptions";

interface AbilityDetailsProps {
  ability: AbilityDisplayAbility;
  details: AbilityDisplayDetails;
  unit?: UnitState;
  readOnly?: boolean;
}

export const AbilityDetails: FC<AbilityDetailsProps> = ({
  ability,
  details,
  unit,
  readOnly = false,
}) => {
  const { t } = useI18n();
  const resourceValue = getAbilityResourceValue(details, ability, unit);
  const resourceMax = getAbilityResourceMax(details, ability);
  const stateActive = isAbilityDetailStateActive(details, unit);

  return (
    <div className="mt-2 space-y-2">
      <div className="leading-5 text-slate-700 dark:text-slate-200">{t(details.summaryKey)}</div>

      {details.resource && resourceValue !== null ? (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50/80 px-2.5 py-2 dark:border-cyan-900/70 dark:bg-cyan-950/30">
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
            {t("abilityDetails.labels.currentResource", {
              resource: t(details.resource.labelKey),
            })}
          </div>
          <div className="mt-0.5 text-lg font-black leading-none text-slate-950 dark:text-white">
            {resourceValue}
            {resourceMax !== null ? (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                /{resourceMax}
              </span>
            ) : null}
          </div>
        </div>
      ) : details.resource && resourceMax !== null ? (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50/80 px-2.5 py-2 dark:border-cyan-900/70 dark:bg-cyan-950/30">
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
            {t("abilityDetails.labels.resourceCapacity", {
              resource: t(details.resource.labelKey),
            })}
          </div>
          <div className="mt-0.5 text-lg font-black leading-none text-slate-950 dark:text-white">
            {resourceMax}
          </div>
        </div>
      ) : null}

      {details.gainRuleKey ? (
        <div className="rounded-lg border border-slate-200 bg-white/65 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950/35">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("abilityDetails.labels.howToGain")}
          </div>
          <div className="mt-1 leading-5 text-slate-700 dark:text-slate-200">
            {t(details.gainRuleKey)}
          </div>
        </div>
      ) : null}

      {details.state && unit ? (
        <div
          className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
            stateActive
              ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
              : "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          {t(stateActive ? details.state.activeLabelKey : details.state.inactiveLabelKey)}
        </div>
      ) : null}

      {details.notesKeys?.map((noteKey) => (
        <div
          key={noteKey}
          className="rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2 leading-5 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100"
        >
          {t(noteKey)}
        </div>
      ))}

      {details.sections?.map((section) => {
        const sectionLabel = t(section.labelKey);
        return (
          <details
            key={section.labelKey}
            className="group rounded-lg border border-slate-200 bg-slate-50/75 dark:border-slate-700 dark:bg-slate-900/45"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 font-bold text-slate-700 marker:hidden dark:text-slate-100">
              <span>{sectionLabel}</span>
              <span
                className="text-sm text-slate-500 transition-transform group-open:rotate-180 dark:text-slate-300"
                aria-hidden="true"
              >
                ▾
              </span>
              <span className="sr-only">
                {t("abilityDetails.labels.showSection", { section: sectionLabel })}
              </span>
            </summary>
            <div className="border-t border-slate-200 p-2 dark:border-slate-700">
              <NestedAbilityOptions
                ability={ability}
                details={details}
                options={section.options}
                unit={unit}
                t={t}
                showAvailability={!readOnly && !!unit}
              />
            </div>
          </details>
        );
      })}
    </div>
  );
};
