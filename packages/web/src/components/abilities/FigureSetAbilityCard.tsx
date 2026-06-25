import type { AbilityMeta } from "rules";
import { useI18n } from "../../i18n";
import { getAbilityDisplay, getAbilityTypeLabel } from "../../i18n/displayMetadata";
import {
  getAbilityDisplayDetails,
  isResourceAbilityDetails,
  type AbilityDisplayAbility,
} from "../../game/abilityDisplayDetails";
import { AbilityDetails } from "./AbilityDetails";
import { getAbilityDisplayTone } from "./abilityDisplayTone";

interface FigureSetAbilityCardProps {
  ability: AbilityMeta;
}

export function FigureSetAbilityCard({ ability }: FigureSetAbilityCardProps) {
  const { language, t } = useI18n();
  const details = getAbilityDisplayDetails(ability.id);
  const display = getAbilityDisplay(ability.id, ability.name, ability.description, language);
  const kindLabel = getAbilityTypeLabel(ability.type, t);
  const tone = getAbilityDisplayTone(ability.type, false, details?.presentation);
  const displayAbility: AbilityDisplayAbility = {
    id: ability.id,
    isAvailable: true,
  };
  const chargeLabel =
    ability.chargeRequired === null
      ? t("figureSet.chargeUnlimited")
      : typeof ability.chargeRequired === "number"
        ? t("figureSet.charge", { value: ability.chargeRequired })
        : t("figureSet.noCharge");
  const costLabel = ability.consumesAction
    ? t("figureSet.consumesAction")
    : ability.consumesMove
      ? t("figureSet.consumesMove")
      : t("figureSet.freeImpulse");

  return (
    <div className={`ability-card ${tone.card}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {display.name}
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.badge}`}
        >
          {details?.categoryKey ? t(details.categoryKey) : kindLabel}
        </span>
      </div>

      {details ? (
        <AbilityDetails ability={displayAbility} details={details} readOnly />
      ) : (
        <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {display.description}
        </div>
      )}

      {!isResourceAbilityDetails(details) ? (
        <div className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          {chargeLabel} / {costLabel}
        </div>
      ) : null}
    </div>
  );
}
