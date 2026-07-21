import { useState, type FC, type ReactNode } from "react";
import type { AbilityView, PlayerView, UnitClass, UnitState } from "rules";
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
import {
  getUnitDetailActionBars,
  type ActionBarState,
  type AbilityActionSummary,
  type BasicAttackSummary,
  type UnitActionSummary,
  type UnitDetailActionKind,
  type UnitDetailActionSummary,
  type UnitMoveSummary,
  type UnitStealthSummary,
} from "../actionSummaries";

interface BattleUnitSummaryProps {
  selectedUnit: UnitState | null;
  selectedHeroName: string | null;
  selectedMettatonRating: number | null;
  forestMarkers: ForestMarkerView[];
  selectedInsideForest: boolean;
  stormActive: boolean;
  selectedStormExempt: boolean;
  moveRoll: number | null | undefined;
  economy: TurnEconomyState;
  abilityViews: AbilityView[];
  view?: PlayerView;
  canAct?: boolean;
  pendingRoll?: boolean;
  attackDisabledReason?: string;
  legalAttackTargetCount?: number;
  legalMoveCount?: number;
  onHoverAbility: (abilityId: string | null) => void;
}

const actionKindLabelKeys: Record<UnitDetailActionKind, string> = {
  action: "game.action",
  move: "game.move",
  stealth: "game.stealth",
};

function stateLabelKey(state: ActionBarState): string {
  return state === "not_applicable" ? "actionUi.states.notApplicable" : `actionUi.states.${state}`;
}

function actionBarClasses(state: ActionBarState, expanded: boolean) {
  const base =
    "min-h-12 rounded-lg border px-2 py-2 text-left shadow-sm transition focus-visible:ring-4 focus-visible:ring-amber-500/15";
  const byState: Record<ActionBarState, string> = {
    available:
      "border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-100",
    spent:
      "border-stone-300 bg-stone-100 text-stone-500 line-through dark:border-stone-800 dark:bg-black/25 dark:text-stone-500",
    blocked:
      "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100",
    pending:
      "border-violet-300 bg-violet-50 text-violet-900 hover:border-violet-400 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-100",
    not_applicable:
      "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-500",
  };
  return `${base} ${byState[state]} ${
    expanded ? "ring-2 ring-amber-500/45 dark:ring-amber-400/35" : ""
  }`;
}

function stateBadgeClasses(state: ActionBarState) {
  const byState: Record<ActionBarState, string> = {
    available:
      "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/45 dark:text-emerald-100",
    spent:
      "border-stone-300 bg-stone-200 text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400",
    blocked:
      "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/45 dark:text-amber-100",
    pending:
      "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-900/45 dark:text-violet-100",
    not_applicable:
      "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
  };
  return `rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${byState[state]}`;
}

function detailRowClasses(state: ActionBarState) {
  const byState: Record<ActionBarState, string> = {
    available: "border-emerald-500/45",
    spent: "border-stone-400/45 opacity-70",
    blocked: "border-amber-500/60",
    pending: "border-violet-500/60",
    not_applicable: "border-slate-400/45 opacity-80",
  };
  return `border-l-2 py-2 pl-3 pr-1 ${byState[state]}`;
}

function DetailRow({
  title,
  state,
  reason,
  children,
}: {
  title: string;
  state: ActionBarState;
  reason?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className={detailRowClasses(state)}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{title}</div>
        <span className={stateBadgeClasses(state)}>{t(stateLabelKey(state))}</span>
      </div>
      <div className="mt-1 space-y-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
        {children}
      </div>
      {reason ? (
        <div className="mt-1 text-[11px] leading-5 text-amber-700 dark:text-amber-300">
          {reason}
        </div>
      ) : null}
    </div>
  );
}

function reasonText(
  reasonKey: string | undefined,
  rawReason: string | undefined,
  t: ReturnType<typeof useI18n>["t"],
) {
  return rawReason ? localizeServerText(rawReason, t) : reasonKey ? t(reasonKey) : "";
}

function AbilityDetailRow({
  item,
  selectedUnit,
}: {
  item: AbilityActionSummary;
  selectedUnit: UnitState;
}) {
  const { language, t } = useI18n();
  const { ability } = item;
  const hideCharges = ability.id === KAISER_DORA_ID && !!selectedUnit.transformed;
  const chargeState = getAbilityChargeState(ability.id, selectedUnit, ability);
  const chargeLabel = formatChargeLabel(ability, chargeState, hideCharges);
  const display = getAbilityDisplay(ability.id, ability.name, ability.description, language);
  const reason = reasonText(item.reasonKey, item.reasonText, t);
  const actionLabel =
    ability.slot === "move"
      ? t("actionUi.movementAction")
      : ability.slot === "stealth"
        ? t("actionUi.stealthAction")
        : t("actionUi.usesAction");

  return (
    <DetailRow
      title={t("actionUi.abilityLabel", { name: display.name })}
      state={item.state}
      reason={reason}
    >
      <div>{display.description}</div>
      <div>{actionLabel}</div>
      {chargeLabel !== null ? <div>{t("game.charges", { charges: chargeLabel })}</div> : null}
    </DetailRow>
  );
}

function BasicAttackDetails({ attack }: { attack: BasicAttackSummary }) {
  const { t } = useI18n();
  const reason = reasonText(attack.reasonKey, attack.reasonText, t);
  return (
    <DetailRow title={t("actionUi.basicAttack")} state={attack.state} reason={reason}>
      <div>{t("actionUi.usesAction")}</div>
      <div>{t("game.damage", { value: attack.damage })}</div>
      <div>
        {t("actionUi.attackPattern", {
          class: getClassLabel(attack.className, t),
        })}
      </div>
      {attack.legalTargetCount !== undefined ? (
        <div>{t("actionUi.visibleTargets", { count: attack.legalTargetCount })}</div>
      ) : null}
    </DetailRow>
  );
}

function ActionDetails({
  summary,
  selectedUnit,
}: {
  summary: UnitActionSummary;
  selectedUnit: UnitState;
}) {
  const { t } = useI18n();
  if (!summary.basicAttack && summary.abilities.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-slate-500 dark:text-slate-400">
        {t("actionUi.noAvailableOptions")}
      </div>
    );
  }
  return (
    <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
      {summary.basicAttack ? <BasicAttackDetails attack={summary.basicAttack} /> : null}
      {summary.abilities.map((item) => (
        <AbilityDetailRow key={item.ability.id} item={item} selectedUnit={selectedUnit} />
      ))}
    </div>
  );
}

function MoveDetails({
  summary,
  selectedUnit,
}: {
  summary: UnitMoveSummary;
  selectedUnit: UnitState;
}) {
  const { t } = useI18n();
  const reason = reasonText(summary.reasonKey, undefined, t);
  return (
    <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
      <DetailRow title={t("actionUi.normalMovement")} state={summary.state} reason={reason}>
        <div>{t("actionUi.movementAction")}</div>
        <div>
          {t("actionUi.movementActionsRemaining", {
            count: summary.movementActionsRemaining,
          })}
        </div>
        {summary.className ? (
          <div>
            {t("actionUi.movementPattern", {
              class: getClassLabel(summary.className, t),
            })}
          </div>
        ) : null}
        {summary.legalMoveCount !== undefined ? (
          <div>{t("actionUi.legalDestinations", { count: summary.legalMoveCount })}</div>
        ) : null}
        {summary.notes.map((note) => (
          <div key={note}>{t(note)}</div>
        ))}
      </DetailRow>
      {summary.abilities.map((item) => (
        <AbilityDetailRow key={item.ability.id} item={item} selectedUnit={selectedUnit} />
      ))}
    </div>
  );
}

function StealthDetails({
  summary,
  selectedUnit,
}: {
  summary: UnitStealthSummary;
  selectedUnit: UnitState;
}) {
  const { t } = useI18n();
  const reason = reasonText(summary.reasonKey, undefined, t);
  return (
    <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
      <DetailRow title={t("actionUi.stealthAttempt")} state={summary.state} reason={reason}>
        <div>{t("actionUi.stealthAction")}</div>
        {summary.threshold !== null ? (
          <div>{t("actionUi.requiredRoll", { roll: summary.threshold })}</div>
        ) : (
          <div>{t("actionUi.cannotEnterStealth")}</div>
        )}
        {summary.notes.map((note) => (
          <div key={note}>{t(note)}</div>
        ))}
      </DetailRow>
      {summary.abilities.map((item) => (
        <AbilityDetailRow key={item.ability.id} item={item} selectedUnit={selectedUnit} />
      ))}
    </div>
  );
}

function UnitActionBars({
  summaries,
  selectedUnit,
}: {
  summaries: UnitDetailActionSummary[];
  selectedUnit: UnitState;
}) {
  const { t } = useI18n();
  const [expandedKind, setExpandedKind] = useState<UnitDetailActionKind>("action");
  const activeSummary = summaries.find((summary) => summary.kind === expandedKind) ?? summaries[0];
  const panelId = `unit-action-details-${selectedUnit.id}`;

  return (
    <div className="space-y-2" data-unit-action-bars>
      <div className="grid grid-cols-3 gap-1.5 text-[11px] font-bold">
        {summaries.map((summary) => {
          const label = t(actionKindLabelKeys[summary.kind]);
          const stateLabel = t(stateLabelKey(summary.state));
          const expanded = activeSummary.kind === summary.kind;
          return (
            <button
              key={summary.kind}
              type="button"
              data-action-bar-kind={summary.kind}
              aria-expanded={expanded}
              aria-controls={panelId}
              aria-label={t("actionUi.barAria", { action: label, state: stateLabel })}
              title={t("actionUi.clickDetails")}
              className={actionBarClasses(summary.state, expanded)}
              onClick={() => setExpandedKind(summary.kind)}
            >
              <span className="block truncate text-xs">{label}</span>
              <span className="mt-1 block text-[10px] uppercase tracking-wide">{stateLabel}</span>
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        className="scroll-panel max-h-44 overflow-y-auto rounded-lg border border-slate-200/80 bg-white/65 px-3 py-2 shadow-inner dark:border-slate-800 dark:bg-black/20"
      >
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
          {t("actionUi.detailsTitle", {
            action: t(actionKindLabelKeys[activeSummary.kind]),
          })}
        </div>
        {activeSummary.kind === "action" ? (
          <ActionDetails summary={activeSummary} selectedUnit={selectedUnit} />
        ) : activeSummary.kind === "move" ? (
          <MoveDetails summary={activeSummary} selectedUnit={selectedUnit} />
        ) : (
          <StealthDetails summary={activeSummary} selectedUnit={selectedUnit} />
        )}
      </div>
    </div>
  );
}

export const BattleUnitSummary: FC<BattleUnitSummaryProps> = ({
  selectedUnit,
  selectedHeroName,
  selectedMettatonRating,
  forestMarkers,
  selectedInsideForest,
  stormActive,
  selectedStormExempt,
  moveRoll,
  economy,
  abilityViews,
  view,
  canAct = false,
  pendingRoll = false,
  attackDisabledReason,
  legalAttackTargetCount,
  legalMoveCount,
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
  const actionSummaries = getUnitDetailActionBars({
    unit: selectedUnit,
    abilityViews,
    economy,
    view,
    canAct,
    pendingRoll,
    attackDisabledReason,
    legalAttackTargetCount,
    legalMoveCount,
  });

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
        {selectedUnit.blindUntilOwnTurnStart ? (
          <span className="status-pill border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-200">
            {t("game.blind")}
          </span>
        ) : null}
        {selectedUnit.immobilizedUntilOwnTurnStart ? (
          <span className="status-pill border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-200">
            {t("game.trapped")}
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
        {selectedUnit.chikatiloMarkStatus ? (
          <span
            className="status-pill border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-200"
            title={
              selectedUnit.chikatiloMarkStatus.exactTrackingActive
                ? t("game.assassinMarkTracked")
                : t("game.assassinMark")
            }
          >
            {selectedUnit.chikatiloMarkStatus.exactTrackingActive
              ? t("game.assassinMarkTracked")
              : t("game.assassinMark")}
          </span>
        ) : null}
        {selectedMettatonRating !== null ? (
          <span className="status-pill border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-200">
            {t("game.rating", { rating: selectedMettatonRating })}
          </span>
        ) : null}
        {selectedUnit.heroId === "luche" ? (
          <span className="status-pill border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-200">
            {language === "uk" ? "Лічильник Променя світла" : "Light Ray counter"}: {selectedUnit.charges.lucheDivineRay ?? 0}/2
          </span>
        ) : null}
        {selectedUnit.heroId === "zoro" ? (
          <>
            <span className="status-pill border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-200">
              {language === "uk" ? "Рішучість" : "Determination"}: {selectedUnit.charges.zoroDetermination ?? 0}
            </span>
            <span className="status-pill border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/45 dark:text-violet-200">
              {language === "uk" ? "Лічильник Оні Ґірі" : "Oni Giri counter"}: {selectedUnit.charges.zoroOniGiri ?? 0}/2
            </span>
          </>
        ) : null}
        {selectedUnit.undyneImmortalActive ? (
          <span className="status-pill border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-200">
            {t("game.immortal")}
          </span>
        ) : null}
      </div>
      {Object.entries(selectedUnit.jackKnownHpByTarget ?? {}).map(([targetId, hp]) => (
        <div key={targetId} className="text-xs text-violet-700 dark:text-violet-300">
          {t("game.knownHp", { target: targetId, hp })}
        </div>
      ))}
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
      <UnitActionBars summaries={actionSummaries} selectedUnit={selectedUnit} />
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
