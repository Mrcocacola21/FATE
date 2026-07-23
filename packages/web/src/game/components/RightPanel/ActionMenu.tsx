import type { FC, ReactNode } from "react";
import type { AbilityView, PlayerView, UnitState } from "rules";
import type { PlayerRole } from "../../../ws";
import { getUnitTokenAsset } from "../../../assets/registry";
import { useI18n } from "../../../i18n";
import {
  getAbilityDisplay,
  getAbilityTypeLabel,
  localizeServerText,
} from "../../../i18n/displayMetadata";
import { getAbilityDisplayDetails, getAbilityResourceMax } from "../../abilityDisplayDetails";
import { getSpecialHeroResourceViews, SPECIAL_HERO_RESOURCE_IDS } from "../../specialHeroResources";
import { getProjectedStealthThreshold } from "./actionSummaries";
import type { TurnEconomyState } from "./types";
import { shouldRenderManualAbilityButton } from "./rightPanelHelpers";
import {
  CHIKATILO_DECOY_ID,
  GRAND_KAISER_ID,
  KAISER_ENGINEERING_MIRACLE_ID,
  LUCHE_DIVINE_RAY_ID,
  ZORO_ONI_GIRI_ID,
  getMaxHp,
} from "../../../rulesHints";

interface ActionMenuProps {
  unit: UnitState | null;
  heroName: string | null;
  view: PlayerView;
  viewerRole: PlayerRole | null;
  economy: TurnEconomyState;
  abilityViews: AbilityView[];
  primaryActions: ReactNode;
  abilityActions: ReactNode;
  heroControls?: ReactNode;
  turnActions?: ReactNode;
  footer?: ReactNode;
}

function resourceStateClass(available: boolean) {
  return available
    ? "bg-emerald-500/10 text-emerald-800 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-100"
    : "bg-stone-500/10 text-stone-500 ring-1 ring-inset ring-stone-500/15 dark:text-stone-400";
}

export function getStealthStatusTitle(
  unit: UnitState,
  t: ReturnType<typeof useI18n>["t"],
): string | undefined {
  if (!unit.isStealthed || !unit.stealthDuration) return undefined;
  if (unit.stealthDuration.kind === "falseTrail") {
    return `${t("actionMenu.hidden")}\n${t("actionMenu.falseTrailDurationExempt")}`;
  }
  return [
    t("actionMenu.hidden"),
    t("actionMenu.turnsHidden", {
      current: unit.stealthDuration.ownTurnStartsWhileHidden,
      max: unit.stealthDuration.maxOwnTurnStartsHidden,
    }),
    t("actionMenu.stealthExpiryTiming", {
      turn: unit.stealthDuration.maxOwnTurnStartsHidden + 1,
    }),
  ].join("\n");
}

export const SelectedUnitHeader: FC<{ unit: UnitState | null; heroName: string | null }> = ({
  unit,
  heroName,
}) => {
  const { t } = useI18n();
  if (!unit) {
    return (
      <div className="rounded-lg bg-black/5 px-3 py-3 text-sm text-stone-500 dark:bg-black/20 dark:text-stone-400">
        {t("game.selectUnitHint")}
      </div>
    );
  }
  const token = getUnitTokenAsset(unit);
  const maxHp = getMaxHp(unit.class, unit.heroId, unit.transformed);
  const classLabel =
    unit.heroId === GRAND_KAISER_ID && unit.transformed
      ? `${t("classes.rider")} + ${t("classes.berserker")}`
      : t(`classes.${unit.class}`);
  return (
    <header
      data-testid="compact-selected-unit-header"
      className="flex min-h-12 items-center gap-2.5 rounded-lg bg-gradient-to-r from-amber-500/10 via-amber-500/[0.03] to-transparent px-2 py-1.5"
    >
      <img
        src={token.src}
        alt=""
        className="h-10 w-10 shrink-0 rounded-md bg-stone-950 object-contain ring-1 ring-amber-400/30"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-sm font-bold text-stone-950 dark:text-amber-50">
          {heroName ?? unit.heroId ?? unit.id}
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-[10px] font-semibold text-stone-500 dark:text-stone-400">
          <span>{unit.owner}</span>
          <span aria-hidden="true">·</span>
          <span>
            {t("game.healthShort")} {unit.hp}/{maxHp}
          </span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{classLabel}</span>
          {unit.isStealthed ? (
            <span
              className="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-700 dark:text-violet-200"
              title={getStealthStatusTitle(unit, t)}
            >
              {t("actionMenu.hidden")}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export const CoreResourceStrip: FC<{
  unit: UnitState | null;
  economy: TurnEconomyState;
  movementActionsRemaining?: number;
}> = ({ unit, economy, movementActionsRemaining }) => {
  const { t } = useI18n();
  const moveAvailable =
    !!unit &&
    (movementActionsRemaining === undefined ? !economy.moveUsed : movementActionsRemaining > 0);
  const core = [
    {
      id: "action",
      label: t("game.action"),
      value: unit ? t(economy.actionUsed ? "actionMenu.spent" : "actionMenu.available") : "—",
      available: !!unit && !economy.actionUsed,
    },
    {
      id: "move",
      label: t("game.move"),
      value: unit ? t(moveAvailable ? "actionMenu.available" : "actionMenu.spent") : "—",
      available: moveAvailable,
    },
    {
      id: "stealth",
      label: t("game.stealth"),
      value: !unit
        ? "—"
        : unit.isStealthed
          ? t("actionMenu.hidden")
          : getProjectedStealthThreshold(unit) === null
            ? t("actionMenu.noStealth")
            : t("actionMenu.revealed"),
      available: !!unit && (unit.isStealthed || getProjectedStealthThreshold(unit) !== null),
      title: unit?.isStealthed ? getStealthStatusTitle(unit, t) : undefined,
    },
  ];

  return (
    <section aria-label={t("actionMenu.coreResources")} data-testid="core-resource-strip">
      <div className="grid grid-cols-3 gap-1">
        {core.map((item) => (
          <div
            key={item.id}
            data-testid={`core-resource-${item.id}`}
            title={"title" in item ? item.title : undefined}
            className={`flex min-h-10 min-w-0 flex-col justify-center rounded-md px-1.5 py-1 text-center ${resourceStateClass(item.available)}`}
          >
            <div className="text-[8px] font-black uppercase leading-tight tracking-[0.08em] sm:text-[9px] sm:tracking-[0.12em]">
              {item.label}
            </div>
            <div className="mt-0.5 text-[9px] font-semibold leading-tight sm:text-[10px]">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export const SpecialHeroResourceStrip: FC<{
  unit: UnitState | null;
  view: PlayerView;
  viewerRole: PlayerRole | null;
}> = ({ unit, view, viewerRole }) => {
  const { language, t } = useI18n();
  const resources = getSpecialHeroResourceViews(unit, view, viewerRole);
  if (resources.length === 0) return null;

  return (
    <section
      aria-label={t("actionMenu.specialResources")}
      data-testid="special-hero-resource-strip"
      className="flex flex-wrap gap-1"
    >
      <div className="sr-only">{t("actionMenu.specialResources")}</div>
      {resources.map((resource) => {
        const display = getAbilityDisplay(
          resource.id,
          resource.label,
          resource.description ?? "",
          language,
        );
        return (
          <div
            key={resource.id}
            data-special-resource-id={resource.id}
            className="rounded-md bg-violet-500/10 px-2 py-1 text-[10px] text-violet-900 ring-1 ring-inset ring-violet-500/20 dark:text-violet-100"
            title={display.description || undefined}
          >
            <span className="font-semibold">
              {resource.id === CHIKATILO_DECOY_ID ? t("actionMenu.decoyPoints") : display.name}
            </span>{" "}
            <span className="font-black tabular-nums">
              {resource.value}
              {resource.max !== undefined ? `/${resource.max}` : ""}
            </span>
          </div>
        );
      })}
    </section>
  );
};

export type AbilityCounterView = { current: number; max?: number };

export function getOrdinaryAbilityCounterView(
  ability: AbilityView,
  unit: UnitState,
): AbilityCounterView | null {
  if (ability.isSpecialCounter || SPECIAL_HERO_RESOURCE_IDS.has(ability.id)) return null;
  const counterOption = ability.useOptions?.find(
    (option) => option.source.type === "abilityCounter",
  );
  const hasUnitCounter = Object.prototype.hasOwnProperty.call(unit.charges ?? {}, ability.id);

  const details = getAbilityDisplayDetails(ability.id);
  const detailsMax = details ? getAbilityResourceMax(details, ability) : null;
  const knownMaximums: Partial<Record<string, number>> = {
    [ZORO_ONI_GIRI_ID]: 2,
    [LUCHE_DIVINE_RAY_ID]: 2,
    [KAISER_ENGINEERING_MIRACLE_ID]: 4,
  };
  const hasCounterMetadata = !!(
    counterOption ||
    ability.maxCharges !== undefined ||
    ability.chargeRequired !== undefined ||
    detailsMax !== null ||
    knownMaximums[ability.id] !== undefined
  );
  if (!hasCounterMetadata || (!counterOption && !hasUnitCounter)) return null;

  const current = counterOption?.currentCharges ?? unit.charges?.[ability.id] ?? 0;
  const max =
    counterOption?.chargeRequired ?? detailsMax ?? ability.maxCharges ?? knownMaximums[ability.id];
  return { current, max: max ?? undefined };
}

export const PassiveImpulseInfo: FC<{ unit: UnitState | null; abilities: AbilityView[] }> = ({
  unit,
  abilities,
}) => {
  const { language, t } = useI18n();
  if (!unit) return null;
  const infoAbilities = abilities.filter(
    (ability) =>
      (ability.kind === "passive" || ability.kind === "impulse" || ability.kind === "phantasm") &&
      !shouldRenderManualAbilityButton(ability),
  );
  if (infoAbilities.length === 0) return null;

  return (
    <details
      className="group rounded-md bg-black/[0.025] dark:bg-black/15"
      data-testid="passive-impulse-info"
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-2 text-[10px] font-bold text-stone-600 marker:content-none dark:text-stone-300">
        <span>{t("actionMenu.passiveImpulseInfo")}</span>
        <span className="text-[9px] text-stone-400">
          {infoAbilities.length} <span aria-hidden="true">▾</span>
        </span>
      </summary>
      <div className="divide-y divide-stone-500/10 px-2 pb-1">
        {infoAbilities.map((ability) => {
          const display = getAbilityDisplay(
            ability.id,
            ability.name,
            ability.description,
            language,
          );
          const counter = getOrdinaryAbilityCounterView(ability, unit);
          return (
            <details
              key={ability.id}
              data-ability-info-id={ability.id}
              className="py-1.5 text-[10px] text-stone-600 dark:text-stone-300"
            >
              <summary className="cursor-pointer list-none marker:content-none">
                <span className="font-bold text-stone-900 dark:text-stone-100">{display.name}</span>
                <span className="text-stone-400"> · {getAbilityTypeLabel(ability.kind, t)}</span>
                {counter ? (
                  <span
                    data-testid={`ability-counter-${ability.id}`}
                    className="ml-1.5 font-semibold text-violet-700 dark:text-violet-200"
                  >
                    ·{" "}
                    {t("actionMenu.counterCompact", {
                      current: counter.current,
                      max: counter.max ?? "∞",
                    })}
                  </span>
                ) : null}
              </summary>
              <p className="mt-1 leading-4 text-stone-500 dark:text-stone-400">
                {ability.kind === "passive"
                  ? t("actionMenu.alwaysActive")
                  : t("actionMenu.triggersAutomatically")}
              </p>
              <p className="mt-1 leading-4">{display.description}</p>
              {ability.disabledReason ? (
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                  {localizeServerText(ability.disabledReason, t)}
                </p>
              ) : null}
            </details>
          );
        })}
      </div>
    </details>
  );
};

export const ActionMenu: FC<ActionMenuProps> = ({
  unit,
  heroName,
  view,
  viewerRole,
  economy,
  abilityViews,
  primaryActions,
  abilityActions,
  heroControls,
  turnActions,
  footer,
}) => {
  const { t } = useI18n();
  const movementActionsRemaining =
    unit && view.activeUnitId === unit.id ? view.legalIntents?.movementActionsRemaining : undefined;
  return (
    <div className="space-y-2" data-testid="action-menu">
      <SelectedUnitHeader unit={unit} heroName={heroName} />
      <CoreResourceStrip
        unit={unit}
        economy={economy}
        movementActionsRemaining={movementActionsRemaining}
      />
      <SpecialHeroResourceStrip unit={unit} view={view} viewerRole={viewerRole} />

      <section>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-stone-400 dark:text-stone-500">
          {t("actionMenu.primaryActions")}
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {primaryActions}
          {turnActions}
        </div>
      </section>

      <section>
        <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-stone-400 dark:text-stone-500">
          {t("actionMenu.abilityActions")}
        </div>
        <div className="divide-y divide-stone-500/10 text-xs">{abilityActions}</div>
      </section>

      {heroControls ? (
        <section className="grid grid-cols-2 gap-1.5 text-xs">{heroControls}</section>
      ) : null}
      <PassiveImpulseInfo unit={unit} abilities={abilityViews} />
      {footer}
    </div>
  );
};
