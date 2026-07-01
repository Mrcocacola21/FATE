import type { FC } from "react";
import type { AbilityView, PlayerView, UnitState } from "rules";
import { FALSE_TRAIL_TOKEN_ID, KAISER_DORA_ID, LOKI_LAUGHT_ID } from "../../../../rulesHints";
import type { ActionMode, ActionPreviewMode, LokiLaughtOption } from "../../../../store";
import {
  abilityActionMode,
  formatChargeLabel,
  getAbilityChargeState,
  shouldHoverAbilityInActionList,
} from "../rightPanelHelpers";
import type { TurnEconomyState } from "../types";
import { attackRangeCells, chebyshevDistance, coordKey } from "../../../targeting/previewGeometry";
import { useI18n } from "../../../../i18n";
import { getAbilityDisplay, localizeServerText } from "../../../../i18n/displayMetadata";
import {
  getAbilityDisplayDetails,
  isResourceAbilityDetails,
  type AbilityDisplayOption,
} from "../../../abilityDisplayDetails";

const LOKI_RADIUS = 2;

const LOKI_LAUGHT_OPTION_IDS: LokiLaughtOption[] = [
  "againSomeNonsense",
  "chicken",
  "mindControl",
  "spinTheDrum",
  "greatLokiJoke",
];

const LOKI_LAUGHT_FALLBACK_COSTS: Record<LokiLaughtOption, number> = {
  againSomeNonsense: 3,
  chicken: 5,
  mindControl: 10,
  spinTheDrum: 12,
  greatLokiJoke: 15,
};

function isLokiLaughtOptionId(optionId: string): optionId is LokiLaughtOption {
  return LOKI_LAUGHT_OPTION_IDS.includes(optionId as LokiLaughtOption);
}

function getLokiLaughtOptions(): AbilityDisplayOption[] {
  const options =
    getAbilityDisplayDetails(LOKI_LAUGHT_ID)?.sections?.flatMap((section) => section.options) ?? [];
  const lokiOptions = options.filter((option) => isLokiLaughtOptionId(option.id));
  if (lokiOptions.length > 0) {
    return lokiOptions;
  }
  return LOKI_LAUGHT_OPTION_IDS.map((id) => ({
    id,
    nameKey: `abilityDetails.loki.laughter.options.${id}.name`,
    descriptionKey: `abilityDetails.loki.laughter.options.${id}.description`,
    types: ["active"],
    cost: { amount: LOKI_LAUGHT_FALLBACK_COSTS[id], resourceKey: "abilityDetails.resources.laughter" },
  }));
}

function isVisiblePositionedUnit(unit: UnitState): boolean {
  return unit.isAlive && !!unit.position;
}

function isInLokiRadius(loki: UnitState, unit: UnitState): boolean {
  return !!(
    loki.position &&
    unit.position &&
    unit.id !== loki.id &&
    chebyshevDistance(loki.position, unit.position) <= LOKI_RADIUS
  );
}

function hasProjectedControlledAttackTarget(view: PlayerView, controlled: UnitState): boolean {
  if (!controlled.position) return false;
  if (controlled.turn.attackUsed || controlled.turn.actionUsed) return false;
  if (controlled.hasAttackedThisTurn || controlled.hasActedThisTurn) return false;
  const rangeKeys = new Set(attackRangeCells(view, controlled.id).map(coordKey));
  return Object.values(view.units).some(
    (unit) =>
      unit.id !== controlled.id &&
      unit.owner === controlled.owner &&
      isVisiblePositionedUnit(unit) &&
      rangeKeys.has(coordKey(unit.position!)),
  );
}

function getProjectedLokiOptionTargetCount(
  view: PlayerView,
  loki: UnitState,
  option: LokiLaughtOption,
): number {
  if (!loki.position) return 0;
  const units = Object.values(view.units).filter(isVisiblePositionedUnit);
  switch (option) {
    case "againSomeNonsense":
    case "greatLokiJoke":
      return units.filter((unit) => isInLokiRadius(loki, unit)).length;
    case "chicken":
      return units.filter(
        (unit) =>
          unit.owner !== loki.owner &&
          unit.heroId !== FALSE_TRAIL_TOKEN_ID &&
          isInLokiRadius(loki, unit),
      ).length;
    case "mindControl":
      return units.filter(
        (unit) =>
          unit.owner !== loki.owner &&
          unit.heroId !== FALSE_TRAIL_TOKEN_ID &&
          isInLokiRadius(loki, unit) &&
          hasProjectedControlledAttackTarget(view, unit),
      ).length;
    case "spinTheDrum":
      return units.filter(
        (unit) =>
          unit.owner === loki.owner &&
          unit.id !== loki.id &&
          unit.heroId !== FALSE_TRAIL_TOKEN_ID,
      ).length;
  }
}

function optionNeedsVisibleTarget(option: LokiLaughtOption): boolean {
  return option === "chicken" || option === "mindControl" || option === "spinTheDrum";
}

interface BattleAbilityActionsProps {
  view: PlayerView;
  actionableAbilities: AbilityView[];
  selectedUnit: UnitState | null;
  canAct: boolean;
  economy: TurnEconomyState;
  actionMode: ActionMode;
  targetingActive: boolean;
  lokiLaughtOptionQueued?: boolean;
  onUseAbility: (abilityId: string) => void;
  onUseLokiLaughtOption: (option: LokiLaughtOption) => void;
  onToggleMode: (mode: ActionPreviewMode) => void;
  onModePreview: (mode: ActionPreviewMode | null) => void;
  onHoverAbility: (abilityId: string | null) => void;
}

export const BattleAbilityActions: FC<BattleAbilityActionsProps> = ({
  view,
  actionableAbilities,
  selectedUnit,
  canAct,
  economy,
  actionMode,
  targetingActive,
  lokiLaughtOptionQueued = false,
  onUseAbility,
  onUseLokiLaughtOption,
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
        if (ability.id === LOKI_LAUGHT_ID) {
          const chargeState = getAbilityChargeState(ability.id, selectedUnit, ability);
          const disabledByAvailability = !ability.isAvailable;
          const baseDisabled =
            targetingActive ||
            lokiLaughtOptionQueued ||
            !canAct ||
            economy.actionUsed ||
            disabledByAvailability;
          const baseReason =
            (targetingActive ? t("game.cancelTargetingFirst") : "") ||
            (lokiLaughtOptionQueued ? t("pending.conditionNotMet") : "") ||
            (economy.actionUsed ? t("game.actionSlotUsed") : "") ||
            localizeServerText(ability.disabledReason, t) ||
            (!canAct ? t("pending.conditionNotMet") : "");

          return getLokiLaughtOptions().map((option) => {
            const optionId = option.id as LokiLaughtOption;
            const cost = option.cost?.amount ?? LOKI_LAUGHT_FALLBACK_COSTS[optionId];
            const notEnoughCharges = chargeState.current < cost;
            const targetCount = getProjectedLokiOptionTargetCount(view, selectedUnit, optionId);
            const noVisibleTarget = optionNeedsVisibleTarget(optionId) && targetCount === 0;
            const disabled = baseDisabled || notEnoughCharges || noVisibleTarget;
            const reason =
              baseReason ||
              (notEnoughCharges ? t("game.notEnoughCharges") : "") ||
              (noVisibleTarget ? t("pending.noValidTargets") : "");
            const optionName = t(option.nameKey);

            return (
              <div
                key={`${ability.id}:${optionId}`}
                className="space-y-1"
                data-loki-laught-option={optionId}
                data-loki-laught-cost={cost}
              >
                <button
                  type="button"
                  className={`min-h-10 w-full rounded-lg border px-3 py-2.5 text-left text-xs font-bold shadow-sm transition focus-visible:ring-4 focus-visible:ring-sky-500/15 ${
                    disabled
                      ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
                      : "border-sky-300 bg-sky-50 text-sky-900 hover:border-sky-400 hover:bg-sky-100 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-100 dark:hover:border-sky-800 dark:hover:bg-sky-950/55"
                  }`}
                  onClick={() => {
                    if (disabled) return;
                    onUseLokiLaughtOption(optionId);
                  }}
                  onMouseEnter={() => onHoverAbility(LOKI_LAUGHT_ID)}
                  onMouseLeave={() => onHoverAbility(null)}
                  onFocus={() => onHoverAbility(LOKI_LAUGHT_ID)}
                  onBlur={() => onHoverAbility(null)}
                  disabled={disabled}
                  title={reason}
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{optionName}</span>
                    <span className="shrink-0 text-[11px] opacity-75">-{cost}</span>
                  </span>
                </button>
                {disabled && reason ? (
                  <div className="px-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
                    {reason}
                  </div>
                ) : null}
              </div>
            );
          });
        }
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
        const disabled =
          targetingActive ||
          !canAct ||
          notEnoughCharges ||
          slotDisabled ||
          disabledByAvailability;
        const chargeWarning = notEnoughCharges ? t("game.notEnoughCharges") : undefined;
        const tooltip =
          (targetingActive ? t("game.cancelTargetingFirst") : "") ||
          localizeServerText(ability.disabledReason, t) ||
          slotReason ||
          chargeWarning ||
          "";
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
