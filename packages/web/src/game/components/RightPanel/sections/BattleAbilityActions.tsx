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
  if (!selectedUnit || actionableAbilities.length === 0) {
    return null;
  }

  return (
    <>
      <div className="col-span-2 text-[11px] text-slate-500 dark:text-slate-400">
        Ability Actions
      </div>
      {actionableAbilities.map((ability) => {
        const hideCharges = ability.id === KAISER_DORA_ID && selectedUnit.transformed;
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
            ? "Action slot already used"
            : ability.slot === "move"
            ? "Move slot already used"
            : ability.slot === "attack"
            ? "Attack slot already used"
            : ability.slot === "stealth"
            ? "Stealth slot already used"
            : undefined;
        const disabledByAvailability = !ability.isAvailable;
        const disabled =
          !canAct || notEnoughCharges || slotDisabled || disabledByAvailability;
        const chargeWarning = notEnoughCharges ? "Not Enough charges" : undefined;
        const tooltip = ability.disabledReason ?? slotReason ?? chargeWarning ?? "";
        const label = `${ability.name}${chargeLabel ? ` (${chargeLabel})` : ""}`;
        const mode = abilityActionMode(ability.id);
        const hoverable = shouldHoverAbilityInActionList(ability.id);

        return (
          <div key={ability.id} className="space-y-1">
            <button
              className={`w-full rounded-lg px-2 py-2 text-left shadow-sm transition hover:shadow ${
                disabled
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed opacity-60 dark:bg-slate-900/50 dark:text-slate-500"
                  : mode && actionMode === mode
                  ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
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
            {chargeWarning && (
              <div className="text-[10px] text-amber-700 dark:text-amber-300">
                {chargeWarning}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
