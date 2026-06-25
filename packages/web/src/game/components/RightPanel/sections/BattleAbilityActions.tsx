import type { FC } from "react";
import type { AbilityView, UnitState } from "rules";
import { KAISER_DORA_ID } from "../../../../rulesHints";
import type { ActionMode, ActionPreviewMode } from "../../../../store";
import {
  abilityActionMode,
  formatChargeLabel,
  getAbilityChargeState,
  shouldHoverAbilityInActionList,
} from "../rightPanelHelpers";
import type { TurnEconomyState } from "../types";
import { useI18n } from "../../../../i18n";
import { getAbilityDisplay, localizeServerText } from "../../../../i18n/displayMetadata";
import { getAbilityDisplayDetails, isResourceAbilityDetails } from "../../../abilityDisplayDetails";

interface BattleAbilityActionsProps {
  actionableAbilities: AbilityView[];
  selectedUnit: UnitState | null;
  canAct: boolean;
  economy: TurnEconomyState;
  actionMode: ActionMode;
  onUseAbility: (abilityId: string) => void;
  onToggleMode: (mode: ActionPreviewMode) => void;
  onModePreview: (mode: ActionPreviewMode | null) => void;
  onHoverAbility: (abilityId: string | null) => void;
}

export const BattleAbilityActions: FC<BattleAbilityActionsProps> = ({
  actionableAbilities,
  selectedUnit,
  canAct,
  economy,
  actionMode,
  onUseAbility,
  onToggleMode,
  onModePreview,
  onHoverAbility,
}) => {
  const { language, t } = useI18n();
  if (!selectedUnit || actionableAbilities.length === 0) {
    return null;
  }

  return (
    <>
      <div className="col-span-2 mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
        {t("game.abilityActions")}
      </div>
      {actionableAbilities.map((ability) => {
        const hideCharges = ability.id === KAISER_DORA_ID && !!selectedUnit.transformed;
        const chargeState = getAbilityChargeState(ability.id, selectedUnit, ability);
        const chargeLabel = formatChargeLabel(ability, chargeState, hideCharges);
        const notEnoughCharges = !chargeState.enabled;
        const slotDisabled =
          ability.slot === "action"
            ? economy.actionUsed
            : ability.slot === "move"
              ? economy.moveUsed
              : ability.slot === "attack"
                ? economy.attackUsed
                : ability.slot === "stealth"
                  ? economy.stealthUsed
                  : false;
        const slotReason =
          ability.slot === "action"
            ? t("game.actionSlotUsed")
            : ability.slot === "move"
              ? t("game.moveSlotUsed")
              : ability.slot === "attack"
                ? t("game.attackSlotUsed")
                : ability.slot === "stealth"
                  ? t("game.stealthSlotUsed")
                  : undefined;
        const disabledByAvailability = !ability.isAvailable;
        const disabled = !canAct || notEnoughCharges || slotDisabled || disabledByAvailability;
        const chargeWarning = notEnoughCharges ? t("game.notEnoughCharges") : undefined;
        const tooltip =
          localizeServerText(ability.disabledReason, t) || slotReason || chargeWarning || "";
        const display = getAbilityDisplay(ability.id, ability.name, ability.description, language);
        const label = `${display.name}${chargeLabel ? ` (${chargeLabel})` : ""}`;
        const mode = abilityActionMode(ability.id);
        const hoverable = shouldHoverAbilityInActionList(ability.id);
        const details = getAbilityDisplayDetails(ability.id);
        const enabledClass = isResourceAbilityDetails(details)
          ? "border-cyan-300 bg-cyan-50 text-cyan-900 hover:border-cyan-400 hover:bg-cyan-100 dark:border-cyan-900/70 dark:bg-cyan-950/35 dark:text-cyan-100 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/55"
          : ability.kind === "phantasm"
            ? "border-violet-400 bg-violet-600 text-white shadow-violet-950/20 hover:bg-violet-500 dark:border-violet-500"
            : ability.kind === "impulse"
              ? "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100 dark:hover:bg-amber-900/60"
              : mode && actionMode === mode
                ? "border-amber-500 bg-amber-500 text-stone-950"
                : "border-sky-300 bg-sky-50 text-sky-900 hover:border-sky-400 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-100 dark:hover:border-sky-800 dark:hover:bg-sky-950/55";

        return (
          <div key={ability.id} className="space-y-1">
            <button
              type="button"
              aria-pressed={mode ? actionMode === mode : undefined}
              className={`min-h-10 w-full rounded-lg border px-3 py-2.5 text-left text-xs font-bold shadow-sm transition focus-visible:ring-4 focus-visible:ring-sky-500/15 ${
                disabled
                  ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
                  : enabledClass
              }`}
              onClick={() => {
                if (disabled) return;
                if (mode) {
                  onToggleMode(mode);
                  return;
                }
                onUseAbility(ability.id);
              }}
              onMouseEnter={() => {
                if (hoverable) {
                  onHoverAbility(ability.id);
                }
                if (mode && !disabled) {
                  onModePreview(mode);
                }
              }}
              onMouseLeave={() => {
                if (hoverable) {
                  onHoverAbility(null);
                }
                if (mode) {
                  onModePreview(null);
                }
              }}
              onFocus={() => {
                if (hoverable) {
                  onHoverAbility(ability.id);
                }
                if (mode && !disabled) {
                  onModePreview(mode);
                }
              }}
              onBlur={() => {
                if (hoverable) {
                  onHoverAbility(null);
                }
                if (mode) {
                  onModePreview(null);
                }
              }}
              disabled={disabled}
              title={tooltip}
            >
              {label}
            </button>
            {disabled && tooltip ? (
              <div className="px-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
                {tooltip}
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
};
