import { useEffect, useState, type FC } from "react";
import type { AbilityUseSource, AbilityView, PlayerView, UnitState } from "rules";
import {
  FALSE_TRAIL_TOKEN_ID,
  KAISER_DORA_ID,
  KANEKI_REGENERATION_ID,
  LOKI_LAUGHT_ID,
  getMaxHp,
} from "../../../../rulesHints";
import type { ActionMode, ActionPreviewMode, LokiLaughtOption } from "../../../../store";
import {
  abilityActionMode,
  getAbilityChargeState,
  shouldHoverAbilityInActionList,
} from "../rightPanelHelpers";
import type { TurnEconomyState } from "../types";
import { attackRangeCells, chebyshevDistance, coordKey } from "../../../targeting/previewGeometry";
import { useI18n } from "../../../../i18n";
import {
  getAbilityDisplay,
  getAbilityTypeLabel,
  localizeServerText,
} from "../../../../i18n/displayMetadata";
import {
  getAbilityDisplayDetails,
  type AbilityDisplayOption,
} from "../../../abilityDisplayDetails";
import { getOrdinaryAbilityCounterView } from "../ActionMenu";

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
    cost: {
      amount: LOKI_LAUGHT_FALLBACK_COSTS[id],
      resourceKey: "abilityDetails.resources.laughter",
    },
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
          unit.owner === loki.owner && unit.id !== loki.id && unit.heroId !== FALSE_TRAIL_TOKEN_ID,
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
  onUseAbility: (abilityId: string, payload?: Record<string, unknown>) => void;
  onUseLokiLaughtOption: (option: LokiLaughtOption) => void;
  onToggleMode: (mode: ActionPreviewMode, useSource?: AbilityUseSource) => void;
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
  const regenerationMax =
    selectedUnit?.heroId === "kaneki"
      ? Math.max(
          0,
          Math.min(
            selectedUnit.charges?.kanekiRcCells ?? 0,
            getMaxHp(selectedUnit.class, selectedUnit.heroId) - selectedUnit.hp,
          ),
        )
      : 0;
  const [regenerationAmount, setRegenerationAmount] = useState(1);
  useEffect(() => {
    setRegenerationAmount((current) =>
      Math.max(1, Math.min(current, Math.max(1, regenerationMax))),
    );
  }, [regenerationMax, selectedUnit?.id]);
  if (!selectedUnit || actionableAbilities.length === 0) {
    return null;
  }

  return (
    <>
      {actionableAbilities.map((ability) => {
        if (ability.useOptions?.length) {
          const display = getAbilityDisplay(
            ability.id,
            ability.name,
            ability.description,
            language,
          );
          const mode = abilityActionMode(ability.id);
          // Keep every authoritative source visible so players can understand
          // both the ordinary counter path and any hero-resource alternative.
          const visibleOptions = ability.useOptions;
          const counter = getOrdinaryAbilityCounterView(ability, selectedUnit);
          return (
            <div
              key={ability.id}
              className="py-1.5"
              data-ability-id={ability.id}
              data-ability-card-id={ability.id}
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="min-w-0 truncate font-bold text-slate-950 dark:text-slate-50">
                  {display.name}
                </div>
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                  {getAbilityTypeLabel(ability.kind, t)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[10px] text-slate-500 dark:text-slate-400">
                {counter ? (
                  <span
                    data-testid={`ability-counter-${ability.id}`}
                    className="font-semibold text-violet-700 dark:text-violet-200"
                  >
                    {t("actionMenu.counterCompact", {
                      current: counter.current,
                      max: counter.max ?? "∞",
                    })}
                  </span>
                ) : null}
                {ability.kind === "impulse" && counter ? (
                  <span className="text-amber-700 dark:text-amber-300">
                    {t("actionMenu.triggersAutomatically")}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {visibleOptions.map((option) => {
                  const disabled = targetingActive || !canAct || !option.isAvailable;
                  const sourceDisplayName =
                    option.source.type === "heroResource"
                      ? getAbilityDisplay(option.source.resourceId, option.sourceName, "", language)
                          .name
                      : option.sourceName;
                  const sourceLabel =
                    option.source.type === "abilityCounter"
                      ? t("actionMenu.useCounter")
                      : t("actionMenu.spendResource", { resource: sourceDisplayName });
                  const costs = [
                    option.consumes?.action ? t("game.action") : null,
                    option.consumes?.move ? t("game.move") : null,
                    option.consumes?.attack ? t("game.attack") : null,
                    option.consumes?.stealth ? t("game.stealth") : null,
                  ].filter((value): value is string => !!value);
                  const tooltip =
                    (targetingActive ? t("game.cancelTargetingFirst") : "") ||
                    (!canAct ? t("pending.conditionNotMet") : "") ||
                    localizeServerText(option.disabledReason, t) ||
                    "";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`min-h-11 rounded-md px-2.5 py-1.5 text-left text-[10px] transition focus-visible:ring-2 focus-visible:ring-sky-500/25 ${
                        disabled
                          ? "bg-stone-500/[0.06] text-stone-600 ring-1 ring-inset ring-stone-500/10 dark:text-stone-400"
                          : "bg-sky-500/10 text-sky-900 ring-1 ring-inset ring-sky-500/20 hover:bg-sky-500/15 dark:text-sky-100"
                      }`}
                      data-ability-use-source={option.source.type}
                      disabled={disabled}
                      title={tooltip}
                      onClick={() => {
                        if (!disabled && mode) onToggleMode(mode, option.source);
                      }}
                      onMouseEnter={() => {
                        if (mode && !disabled) onModePreview(mode);
                      }}
                      onMouseLeave={() => {
                        if (mode) onModePreview(null);
                      }}
                      onFocus={() => {
                        if (mode && !disabled) onModePreview(mode);
                      }}
                      onBlur={() => {
                        if (mode) onModePreview(null);
                      }}
                    >
                      <span className="block font-bold">{sourceLabel}</span>
                      <span className="mt-0.5 block font-semibold opacity-75">
                        {costs.length ? costs.join(" + ") : t("game.noCommitCost")}
                        {option.source.type === "heroResource"
                          ? ` + ${sourceDisplayName} ${option.source.amount}`
                          : ""}
                      </span>
                      {disabled && tooltip ? (
                        <span className="mt-0.5 block leading-tight text-amber-700 dark:text-amber-300">
                          {tooltip}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <details
                data-ability-details={ability.id}
                className="mt-1 px-1 text-[10px] text-slate-600 dark:text-slate-300"
              >
                <summary className="cursor-pointer font-semibold text-slate-400 hover:text-amber-700 dark:hover:text-amber-300">
                  {t("actionMenu.details")}
                </summary>
                <p className="mt-1 leading-4">{display.description}</p>
              </details>
            </div>
          );
        }
        if (ability.id === KANEKI_REGENERATION_ID) {
          const disabled =
            targetingActive ||
            !canAct ||
            economy.actionUsed ||
            !ability.isAvailable ||
            regenerationMax < 1;
          const amount = Math.max(1, Math.min(regenerationAmount, Math.max(1, regenerationMax)));
          return (
            <div
              key={ability.id}
              className="py-1.5"
              data-kaneki-regeneration
              data-ability-card-id={ability.id}
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="font-bold text-emerald-900 dark:text-emerald-100">
                  {getAbilityDisplay(ability.id, ability.name, ability.description, language).name}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                  {getAbilityTypeLabel(ability.kind, t)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  className="min-h-11 min-w-11 rounded-md bg-stone-500/10 px-3 py-2 font-bold disabled:opacity-35"
                  onClick={() => setRegenerationAmount((value) => Math.max(1, value - 1))}
                  disabled={disabled || amount <= 1}
                  aria-label={t("common.decrease")}
                >
                  −
                </button>
                <span
                  className="min-w-0 flex-1 text-center text-[10px] font-semibold"
                  data-regeneration-amount={amount}
                >
                  {t("actionMenu.regenerationSpend", { amount })}
                </span>
                <button
                  type="button"
                  className="min-h-11 min-w-11 rounded-md bg-stone-500/10 px-3 py-2 font-bold disabled:opacity-35"
                  onClick={() =>
                    setRegenerationAmount((value) => Math.min(regenerationMax, value + 1))
                  }
                  disabled={disabled || amount >= regenerationMax}
                  aria-label={t("common.increase")}
                >
                  +
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-md bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white disabled:bg-stone-500/10 disabled:text-stone-400"
                  disabled={disabled}
                  onClick={() => onUseAbility(ability.id, { amount })}
                >
                  {t("common.confirm")}
                </button>
              </div>
              <details
                data-ability-details={ability.id}
                className="mt-1 px-1 text-[10px] text-slate-600 dark:text-slate-300"
              >
                <summary className="cursor-pointer font-semibold text-slate-400">
                  {t("actionMenu.details")}
                </summary>
                <p className="mt-1 leading-4">
                  {
                    getAbilityDisplay(ability.id, ability.name, ability.description, language)
                      .description
                  }
                </p>
              </details>
            </div>
          );
        }
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
                className="py-1"
                data-loki-laught-option={optionId}
                data-loki-laught-cost={cost}
              >
                <button
                  type="button"
                  className={`min-h-11 w-full rounded-md px-2.5 py-1.5 text-left text-[10px] font-bold transition focus-visible:ring-2 focus-visible:ring-sky-500/25 ${
                    disabled
                      ? "bg-stone-500/[0.06] text-stone-600 ring-1 ring-inset ring-stone-500/10 dark:text-stone-400"
                      : "bg-sky-500/10 text-sky-900 ring-1 ring-inset ring-sky-500/20 hover:bg-sky-500/15 dark:text-sky-100"
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
                  {disabled && reason ? (
                    <span className="mt-0.5 block font-semibold leading-tight text-amber-700 dark:text-amber-300">
                      {reason}
                    </span>
                  ) : null}
                </button>
              </div>
            );
          });
        }
        const hideCharges = ability.id === KAISER_DORA_ID && !!selectedUnit.transformed;
        const chargeState = getAbilityChargeState(ability.id, selectedUnit, ability);
        const notEnoughCharges = !chargeState.enabled;
        const slotDisabled =
          ability.slot === "action"
            ? economy.actionUsed
            : ability.slot === "move"
              ? !view.legalIntents?.canMove
              : ability.slot === "attack"
                ? economy.attackUsed
                : ability.slot === "stealth"
                  ? economy.stealthUsed
                  : false;
        const slotReason = slotDisabled
          ? ability.slot === "action"
            ? t("game.actionSlotUsed")
            : ability.slot === "move"
              ? t("game.moveSlotUsed")
              : ability.slot === "attack"
                ? t("game.attackSlotUsed")
                : ability.slot === "stealth"
                  ? t("game.stealthSlotUsed")
                  : undefined
          : undefined;
        const disabledByAvailability = !ability.isAvailable;
        const disabled =
          targetingActive || !canAct || notEnoughCharges || slotDisabled || disabledByAvailability;
        const chargeWarning = notEnoughCharges ? t("game.notEnoughCharges") : undefined;
        const tooltip =
          (targetingActive ? t("game.cancelTargetingFirst") : "") ||
          localizeServerText(ability.disabledReason, t) ||
          slotReason ||
          chargeWarning ||
          "";
        const display = getAbilityDisplay(ability.id, ability.name, ability.description, language);
        const counter = getOrdinaryAbilityCounterView(ability, selectedUnit);
        const costParts = [
          ability.slot === "action" ? t("game.action") : null,
          ability.slot === "move" ? t("game.move") : null,
          ability.slot === "attack" ? t("game.attack") : null,
          ability.slot === "stealth" ? t("game.stealth") : null,
          !hideCharges && ability.chargeRequired !== undefined
            ? t("actionMenu.chargesCost", { amount: ability.chargeRequired })
            : null,
        ].filter((part): part is string => !!part);
        const mode = abilityActionMode(ability.id);
        const hoverable = shouldHoverAbilityInActionList(ability.id);
        const selected = !!mode && actionMode === mode;

        return (
          <div
            key={ability.id}
            data-ability-card-id={ability.id}
            data-compact-ability-row={ability.id}
            className="py-1.5"
          >
            <button
              type="button"
              data-ability-action-id={ability.id}
              aria-pressed={mode ? actionMode === mode : undefined}
              className={`min-h-11 w-full rounded-md px-2.5 py-1.5 text-left transition focus-visible:ring-2 focus-visible:ring-sky-500/25 ${
                disabled
                  ? "bg-stone-500/[0.06] text-stone-600 ring-1 ring-inset ring-stone-500/10 dark:text-stone-400"
                  : selected
                    ? "bg-amber-500 text-stone-950 ring-1 ring-inset ring-amber-600/40"
                    : ability.kind === "phantasm"
                      ? "bg-violet-600 text-white ring-1 ring-inset ring-violet-400/30 hover:bg-violet-500"
                      : "bg-sky-500/10 text-sky-950 ring-1 ring-inset ring-sky-500/20 hover:bg-sky-500/15 dark:text-sky-50"
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
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-bold">{display.name}</span>
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide opacity-65">
                  {getAbilityTypeLabel(ability.kind, t)}
                </span>
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-semibold opacity-75">
                <span>{costParts.length ? costParts.join(" + ") : t("game.noCommitCost")}</span>
                {counter ? (
                  <span
                    data-testid={`ability-counter-${ability.id}`}
                    className="text-violet-700 dark:text-violet-200"
                  >
                    ·{" "}
                    {t("actionMenu.counterCompact", {
                      current: counter.current,
                      max: counter.max ?? "∞",
                    })}
                  </span>
                ) : null}
              </span>
              {disabled && tooltip ? (
                <span className="mt-0.5 block text-[10px] font-semibold leading-tight text-amber-700 dark:text-amber-300">
                  {tooltip}
                </span>
              ) : null}
            </button>
            <details
              data-ability-details={ability.id}
              className="mt-1 px-1 text-[10px] text-slate-600 dark:text-slate-300"
            >
              <summary className="cursor-pointer font-semibold text-slate-400 hover:text-amber-700 dark:hover:text-amber-300">
                {t("actionMenu.details")}
              </summary>
              <p className="mt-1 leading-4">{display.description}</p>
            </details>
          </div>
        );
      })}
    </>
  );
};
