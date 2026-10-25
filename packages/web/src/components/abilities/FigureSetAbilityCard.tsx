import type { AbilityMeta } from "rules";
import { useI18n } from "../../i18n";
import { getAbilityDisplay, getAbilityTypeLabel } from "../../i18n/displayMetadata";
import {
  getAbilityDisplayDetails,
  isResourceAbilityDetails,
  type AbilityDisplayAbility,
} from "../../game/abilityDisplayDetails";
import { GrimoireAbilityRow, GrimoirePips, grimoireRune } from "../grimoire";
import { AbilityDetails } from "./AbilityDetails";

interface FigureSetAbilityCardProps {
  ability: AbilityMeta;
  /** Draft on phones: the name line toggles the details open. */
  collapsible?: boolean;
}

/** Read-only ability line for the Figure Set and Draft, drawn as a grimoire rune row. */
export function FigureSetAbilityCard({ ability, collapsible = false }: FigureSetAbilityCardProps) {
  const { language, t } = useI18n();
  const details = getAbilityDisplayDetails(ability.id);
  const display = getAbilityDisplay(ability.id, ability.name, ability.description, language);
  const kindLabel = details?.categoryKey
    ? t(details.categoryKey)
    : getAbilityTypeLabel(ability.type, t);
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

  const body = (
    <>
      {details ? (
        <AbilityDetails ability={displayAbility} details={details} readOnly />
      ) : (
        <p className="grimoire-ability__text">{display.description}</p>
      )}
      {!isResourceAbilityDetails(details) ? (
        <div className="grimoire-ability__meta">
          <span className="inline-flex items-center gap-1.5">
            {typeof ability.chargeRequired === "number" ? (
              <GrimoirePips
                current={ability.chargeRequired}
                max={ability.chargeRequired}
                tone="charge"
              />
            ) : null}
            {chargeLabel}
          </span>
          <span>{costLabel}</span>
        </div>
      ) : null}
    </>
  );

  if (collapsible) {
    return (
      <details className="grimoire-ability-fold" data-ability-kind={ability.type}>
        <summary>
          <span className="grimoire-ability__rune" aria-hidden="true">
            <span>{grimoireRune(ability.type)}</span>
          </span>
          <span className="grimoire-ability__head">
            <strong>{display.name}</strong>
            <span className="grimoire-ability__kind">{kindLabel}</span>
          </span>
          <span className="grimoire-ability-fold__chevron" aria-hidden="true">
            ▾
          </span>
          <span className="sr-only">{t("draft.showAbility", { ability: display.name })}</span>
        </summary>
        <div className="grimoire-ability-fold__body">{body}</div>
      </details>
    );
  }

  return (
    <GrimoireAbilityRow kind={ability.type} name={display.name} kindLabel={kindLabel}>
      {body}
    </GrimoireAbilityRow>
  );
}
