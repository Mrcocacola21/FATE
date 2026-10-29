import { useState, type FC, type ReactNode } from "react";
import type { AbilityView, PlayerView, UnitClass, UnitState } from "rules";
import {
  getUnitTokenAsset,
  getUnitVisualVariant,
  getUnitVisualVariantLabelKey,
} from "../../../../assets/registry";
import {
  CHIKATILO_FALSE_TRAIL_ID,
  EL_CID_KOLADA_ID,
  FALSE_TRAIL_TOKEN_ID,
  GRAND_KAISER_ID,
  getMaxHp,
  KAISER_DORA_ID,
} from "../../../../rulesHints";
import { formatChargeLabel, getAbilityChargeState } from "../rightPanelHelpers";
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
  getCellLabel,
  getClassLabel,
  getSlotLabel,
  localizeServerText,
} from "../../../../i18n/displayMetadata";
import { AbilityDetails } from "../../../../components/abilities/AbilityDetails";
import { BoneStatusPanel } from "../../../boneStatus";
import { GrimoireAbilityRow, GrimoireHead, GrimoirePips } from "../../../../components/grimoire";
import { StatusBadges } from "../../../../features/vfx/UnitStatusVfx";
import { resolveUnitStatuses } from "../../../../features/vfx/persistentStatuses";
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
  kind,
  children,
}: {
  title: string;
  state: ActionBarState;
  reason?: string;
  /** Drives the grimoire glyph. */
  kind: "attack" | "ability" | "move" | "stealth";
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`detail-row ${detailRowClasses(state)}`}
      data-state={state}
      data-detail-kind={kind}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="detail-row__title text-xs font-bold text-slate-900 dark:text-slate-100">
          {title}
        </div>
        <span className={`detail-row__state ${stateBadgeClasses(state)}`}>
          {t(stateLabelKey(state))}
        </span>
      </div>
      <div className="detail-row__body mt-1 space-y-1 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
        {children}
      </div>
      {reason ? (
        <div className="detail-row__reason mt-1 text-[11px] leading-5 text-amber-700 dark:text-amber-300">
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
      kind="ability"
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
    <DetailRow kind="attack" title={t("actionUi.basicAttack")} state={attack.state} reason={reason}>
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
      <DetailRow
        kind="move"
        title={t("actionUi.normalMovement")}
        state={summary.state}
        reason={reason}
      >
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
      <DetailRow
        kind="stealth"
        title={t("actionUi.stealthAttempt")}
        state={summary.state}
        reason={reason}
      >
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
  const hasUnresolvedOrangeBone =
    (selectedUnit.sansBoneFieldStatus?.kind === "orange" ||
      selectedUnit.papyrusBoneStatus?.kind === "orange") &&
    !selectedUnit.orangeBoneFirstMoveSatisfied &&
    !selectedUnit.orangeBonePenaltyAppliedThisTurn;

  return (
    <div className="space-y-2" data-unit-action-bars>
      {hasUnresolvedOrangeBone ? (
        <div
          className="rounded-md border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-[11px] font-semibold text-orange-900 dark:border-orange-800 dark:bg-orange-950/35 dark:text-orange-200"
          data-orange-bone-warning
        >
          {t("actionUi.orangeBoneMoveWarning")}
        </div>
      ) : null}
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
              data-state={summary.state}
              data-rune={label.charAt(0).toUpperCase()}
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
        <div className="unit-action-details__title mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
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

/**
 * Effects laid on a figure: forms, locks, marks, curses and the persistent status set.
 * Shared by the Figure tab and the Controls tab.
 */
export function UnitEffectPills({
  unit,
  mettatonRating,
}: {
  unit: UnitState;
  mettatonRating: number | null;
}) {
  const { t } = useI18n();
  const selectedUnit = unit;
  const selectedMettatonRating = mettatonRating;
  const visualVariantLabelKey = getUnitVisualVariantLabelKey(getUnitVisualVariant(unit));
  return (
    <>
      {visualVariantLabelKey ? (
        <span className="status-pill border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/45 dark:text-violet-200">
          {t(visualVariantLabelKey)}
        </span>
      ) : null}
      {selectedUnit.sansMoveLockArmed ? (
        <span className="status-pill border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-200">
          {t("game.moveLocked")}
        </span>
      ) : null}
      {(selectedUnit.lokiMoveLockSources?.length ?? 0) > 0 ? (
        <span className="status-pill border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-200">
          {t("game.statusEntangled")}
        </span>
      ) : null}
      {(selectedUnit.lokiChickenSources?.length ?? 0) > 0 ? (
        <span className="status-pill border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-200">
          {t("game.statusChicken")}
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
      {selectedUnit.undyneImmortalActive ? (
        <span className="status-pill border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-200">
          {t("game.immortal")}
        </span>
      ) : null}
    </>
  );
}

export function UnitEffectPanels({ unit, view }: { unit: UnitState; view?: PlayerView }) {
  const { t } = useI18n();
  const selectedUnit = unit;
  return (
    <>
      <BoneStatusPanel unit={selectedUnit} />
      <StatusBadges
        summary
        t={t}
        statuses={resolveUnitStatuses(
          selectedUnit,
          view?.abilitiesByUnitId?.[selectedUnit.id] ? selectedUnit.owner : null,
          view,
        ).filter(
          (status) =>
            // Retain the detailed existing summary/bone panels; add missing conditions.
            ![
              "curse",
              "sansMoveLock",
              "lokiMoveLock",
              "blind",
              "immobilized",
              "mark",
              "trackedMark",
              "form",
              "papyrusBlue",
              "papyrusOrange",
              "sansBlue",
              "sansOrange",
            ].includes(status.kind),
        )}
      />
      {Object.entries(selectedUnit.jackKnownHpByTarget ?? {}).map(([targetId, hp]) => (
        <div key={targetId} className="text-xs text-violet-700 dark:text-violet-300">
          {t("game.knownHp", { target: targetId, hp })}
        </div>
      ))}
    </>
  );
}

/**
 * The False Trail token has no abilities of its own: it is Chikatilo's phantasm, so its rules
 * (deployment, hidden killer, trap, explosion) are shown instead of "no abilities".
 */
function FalseTrailRules() {
  const { language, t } = useI18n();
  const details = getAbilityDisplayDetails(CHIKATILO_FALSE_TRAIL_ID);
  const name = getAbilityDisplay(CHIKATILO_FALSE_TRAIL_ID, "False Trail", "", language).name;
  const kind = getAbilityTypeLabel("phantasm", t);
  const body = details ? (
    <AbilityDetails
      ability={{ id: CHIKATILO_FALSE_TRAIL_ID, isAvailable: true }}
      details={details}
      readOnly
    />
  ) : null;
  return (
    <div className="grimoire-abilities" data-testid="false-trail-rules">
      <GrimoireAbilityRow
        kind="phantasm"
        abilityId={CHIKATILO_FALSE_TRAIL_ID}
        name={name}
        kindLabel={kind}
      >
        {body}
      </GrimoireAbilityRow>
    </div>
  );
}

export const BattleUnitSummary: FC<BattleUnitSummaryProps> = ({
  selectedUnit: selectedUnitInput,
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
  // A previous selection cannot restore fields removed by the current projection.
  const selectedUnit = view ? (view.units[selectedUnitInput?.id ?? ""] ?? null) : selectedUnitInput;
  if (!selectedUnit) {
    return (
      <div className="panel-card-muted mt-3 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        {t("game.selectUnitHint")}
      </div>
    );
  }

  const transformedKaiser =
    selectedUnit.heroId === GRAND_KAISER_ID && selectedUnit.transformed === true;
  const classLabel = transformedKaiser
    ? `${getClassLabel("rider", t)} + ${getClassLabel("berserker", t)}`
    : getClassLabel(selectedUnit.class, t);
  const tokenAsset = getUnitTokenAsset(selectedUnit);
  const maxHp = getMaxHp(
    selectedUnit.class as UnitClass,
    selectedUnit.heroId,
    selectedUnit.transformed,
  );
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
    <div className="unit-grimoire mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-200">
      <GrimoireHead
        portraitSrc={tokenAsset.src}
        owner={selectedUnit.owner}
        kicker={`${classLabel} · ${selectedUnit.owner}`}
        name={selectedHeroName}
        hp={{ current: selectedUnit.hp, max: maxHp }}
        hpLabel={`${selectedUnit.hp} / ${maxHp} ${t("game.healthShort")}`}
      />

      <div className="grimoire-effects">
        <span className="status-pill border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/45 dark:text-rose-200">
          {t("game.damage", { value: selectedUnit.attack })}
        </span>
        <span className="status-pill border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {t("game.position", {
            position: selectedUnit.position
              ? getCellLabel(selectedUnit.position)
              : t("common.unplaced"),
          })}
        </span>
        <UnitEffectPills unit={selectedUnit} mettatonRating={selectedMettatonRating} />
      </div>
      <UnitEffectPanels unit={selectedUnit} view={view} />
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
      <div className="grimoire-section">
        <div className="grimoire-section__title">{t("game.abilities")}</div>
        {abilityViews.length === 0 && selectedUnit.heroId === FALSE_TRAIL_TOKEN_ID ? (
          <FalseTrailRules />
        ) : abilityViews.length === 0 ? (
          <div className="mt-2 text-sm text-slate-400 dark:text-slate-400">
            {t("game.noAbilities")}
          </div>
        ) : null}
        <div className="grimoire-abilities">
          {abilityViews.map((ability) => {
            const details = getAbilityDisplayDetails(ability.id);
            const structuredResource = isResourceAbilityDetails(details);
            const structuredStateActive = details
              ? isAbilityDetailStateActive(details, selectedUnit)
              : false;
            const hideCharges = ability.id === KAISER_DORA_ID && !!selectedUnit.transformed;
            const chargeState = getAbilityChargeState(ability.id, selectedUnit, ability);
            const chargeLabel = formatChargeLabel(ability, chargeState, hideCharges);
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
            return (
              <GrimoireAbilityRow
                key={ability.id}
                kind={ability.kind}
                abilityId={ability.id}
                name={display.name}
                kindLabel={details?.categoryKey ? t(details.categoryKey) : kindLabel}
                muted={!(ability.isAvailable || structuredStateActive)}
                title={
                  structuredStateActive ? undefined : localizeServerText(ability.disabledReason, t)
                }
                onMouseEnter={() => {
                  if (ability.id === EL_CID_KOLADA_ID) onHoverAbility(ability.id);
                }}
                onMouseLeave={() => {
                  if (ability.id === EL_CID_KOLADA_ID) onHoverAbility(null);
                }}
              >
                {details ? (
                  <AbilityDetails ability={ability} details={details} unit={selectedUnit} />
                ) : (
                  <p className="grimoire-ability__text">{display.description}</p>
                )}
                <div className="grimoire-ability__meta">
                  <span>{t("game.slot", { slot: slotLabel })}</span>
                  {!structuredResource && chargeLabel !== null ? (
                    <span className="inline-flex items-center gap-1.5">
                      {chargeState.max !== null && !hideCharges ? (
                        <GrimoirePips
                          current={chargeState.current}
                          max={chargeState.max}
                          tone="charge"
                        />
                      ) : null}
                      {t("game.charges", { charges: chargeLabel })}
                    </span>
                  ) : null}
                </div>
                {ability.disabledReason && !structuredStateActive ? (
                  <div className="grimoire-ability__warn">
                    {localizeServerText(ability.disabledReason, t)}
                  </div>
                ) : null}
                {showChargeWarning ? (
                  <div className="grimoire-ability__warn">
                    {chargeState.reason ? t(chargeState.reason) : ""}
                  </div>
                ) : null}
              </GrimoireAbilityRow>
            );
          })}
        </div>
      </div>
    </div>
  );
};
