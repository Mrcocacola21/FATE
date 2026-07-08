import type { FC } from "react";
import type { PlayerView, UnitState } from "rules";
import { PanelCard, SectionHeader, StatusBadge } from "../../../../components/ui";
import { ARENA_BONE_FIELD_ID } from "../../../../rulesHints";
import type { ForestMarkerView } from "../types";
import { useI18n } from "../../../../i18n";
import { getArenaLabel, getPhaseLabel, localizeServerText } from "../../../../i18n/displayMetadata";
import { StatPill } from "../../../../ui";
import {
  getPublicBattleActionBars,
  type ActionBarState,
  type PublicBattleActionKind,
} from "../actionSummaries";

interface StatusSectionProps {
  view: PlayerView;
  selectedUnit: UnitState | null;
  stormActive: boolean;
  forestMarkers: ForestMarkerView[];
  isSpectator: boolean;
  canStartTurn: boolean;
  expectedUnitId: string | undefined;
  legalIntents: PlayerView["legalIntents"];
  pendingRoll: boolean;
  onStartTurn: (unitId: string) => void;
}

const publicBarLabelKeys: Record<PublicBattleActionKind, string> = {
  move: "game.move",
  attack: "game.attack",
  stealth: "game.stealth",
};

function stateLabelKey(state: ActionBarState): string {
  return state === "not_applicable" ? "actionUi.states.notApplicable" : `actionUi.states.${state}`;
}

function publicBarClasses(state: ActionBarState) {
  const byState: Record<ActionBarState, string> = {
    available:
      "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-[inset_0_-2px_0_rgba(16,185,129,0.12)] dark:border-emerald-800/70 dark:bg-emerald-950/35 dark:text-emerald-200",
    spent:
      "border-stone-300 bg-stone-100 text-stone-400 line-through dark:border-stone-800 dark:bg-black/25 dark:text-stone-500",
    blocked:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/35 dark:text-amber-100",
    pending:
      "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800/70 dark:bg-violet-950/35 dark:text-violet-100",
    not_applicable:
      "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-500",
  };
  return `rounded-lg border px-1.5 py-2 text-center text-[11px] font-bold ${byState[state]}`;
}

function arenaEffectName(effectId: string, t: ReturnType<typeof useI18n>["t"]): string {
  return effectId === "storm" ? t("game.arenaEffectStorm") : effectId;
}

function arenaEffectDescription(
  effectId: string,
  t: ReturnType<typeof useI18n>["t"]
): string {
  return effectId === "storm" ? t("game.arenaEffectStormDescription") : "";
}

export const StatusSection: FC<StatusSectionProps> = ({
  view,
  selectedUnit,
  stormActive,
  forestMarkers,
  isSpectator,
  canStartTurn,
  expectedUnitId,
  legalIntents,
  pendingRoll,
  onStartTurn,
}) => {
  const { t } = useI18n();
  const phase = getPhaseLabel(view.phase, t);
  const battleStatusUnit =
    selectedUnit ?? (view.activeUnitId ? (view.units[view.activeUnitId] ?? null) : null);
  const publicBars = getPublicBattleActionBars(battleStatusUnit, view, pendingRoll);
  const activeArenaEffects = Array.isArray(view.arenaEffects)
    ? view.arenaEffects.filter((effect) => effect.remaining > 0)
    : [];

  return (
    <PanelCard variant="hud" className="p-4">
      <SectionHeader
        kicker={t("game.matchState")}
        title={t("game.phaseAndTurn")}
        action={
          <StatusBadge tone={pendingRoll ? "warning" : "success"} dot>
            {pendingRoll ? t("game.choicePending") : t("common.ready")}
          </StatusBadge>
        }
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatPill label={t("game.phase")} value={phase} tone="amber" />
        <StatPill label={t("game.currentPlayer")} value={view.currentPlayer ?? "-"} tone="sky" />
        <StatPill
          label={t("game.roundTurn")}
          value={`${view.roundNumber} / ${view.turnNumber}`}
          tone="neutral"
        />
        <StatPill
          label={t("game.activeUnit")}
          value={view.activeUnitId ?? expectedUnitId ?? "-"}
          tone="violet"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge tone="info">
          {t("game.arena", { arena: getArenaLabel(view.arenaId, t) })}
        </StatusBadge>
        {isSpectator ? <StatusBadge tone="warning">{t("game.spectating")}</StatusBadge> : null}
        {view.arenaId === ARENA_BONE_FIELD_ID ? (
          <StatusBadge tone="info">
            {t("game.boneFieldTurns", { count: Math.max(0, view.boneFieldTurnsLeft ?? 0) })}
          </StatusBadge>
        ) : null}
        {stormActive ? <StatusBadge tone="warning">{t("game.stormActive")}</StatusBadge> : null}
        {forestMarkers.length > 0 ? (
          <StatusBadge tone="success">
            {t("game.forestMarkers", { count: forestMarkers.length })}
          </StatusBadge>
        ) : null}
      </div>

      {view.phase === "battle" ? (
        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("game.turnResources")}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5" data-public-battle-action-bars>
            {publicBars.map((bar) => {
              const label = t(publicBarLabelKeys[bar.kind]);
              const state = t(stateLabelKey(bar.state));
              return (
                <div
                  key={bar.kind}
                  data-public-action-bar-kind={bar.kind}
                  className={publicBarClasses(bar.state)}
                >
                  <span className="block">{label}</span>
                  <span className="mt-0.5 block text-[10px] uppercase tracking-wide">{state}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {stormActive ? (
        <p className="mt-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          {t("game.stormRestriction")}
        </p>
      ) : null}
      {activeArenaEffects.length > 0 ? (
        <div
          className="mt-4 rounded-lg border border-amber-300/70 bg-amber-50/80 p-3 text-xs text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100"
          data-active-arena-effects
        >
          <div className="font-bold uppercase tracking-wider">
            {t("game.activeArenaEffects")}
          </div>
          <div className="mt-2 space-y-2">
            {activeArenaEffects.map((effect) => {
              const sourceLabel =
                effect.sourceUnitId && view.units[effect.sourceUnitId]
                  ? effect.sourceUnitId
                  : t("common.unknown");
              return (
                <div key={effect.id} className="rounded-md bg-white/60 p-2 dark:bg-black/20">
                  <div className="font-semibold">
                    {arenaEffectName(effect.effectId, t)}
                  </div>
                  <div className="mt-1">
                    {t("game.arenaEffectSource", { source: sourceLabel })}
                  </div>
                  <div>
                    {t("game.arenaEffectRemainingTurns", {
                      count: Math.max(0, effect.remaining),
                    })}
                  </div>
                  <div className="mt-1 leading-5">
                    {arenaEffectDescription(effect.effectId, t)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {forestMarkers.length > 0 ? (
        <p className="mt-2 break-words text-xs leading-5 text-emerald-700 dark:text-emerald-300">
          {t("game.forestPositions", {
            positions: forestMarkers
              .map((marker) => `${marker.owner} (${marker.position.col},${marker.position.row})`)
              .join(" / "),
          })}
        </p>
      ) : null}

      {canStartTurn && expectedUnitId ? (
        <button
          type="button"
          className="btn btn-primary mt-4 w-full"
          onClick={() => onStartTurn(expectedUnitId)}
        >
          {t("game.startTurn", { unit: expectedUnitId })}
        </button>
      ) : null}

      {view.phase === "battle" &&
      legalIntents &&
      (!legalIntents.canSearchMove || !legalIntents.canSearchAction) ? (
        <div className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {!legalIntents.canSearchMove && legalIntents.searchMoveReason
            ? `${t("game.moveSearchUnavailable", {
                reason: localizeServerText(legalIntents.searchMoveReason, t),
              })} `
            : ""}
          {!legalIntents.canSearchAction && legalIntents.searchActionReason
            ? t("game.actionSearchUnavailable", {
                reason: localizeServerText(legalIntents.searchActionReason, t),
              })
            : ""}
        </div>
      ) : null}
    </PanelCard>
  );
};
