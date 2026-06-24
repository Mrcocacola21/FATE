import type { FC } from "react";
import type { PlayerView } from "rules";
import { PanelCard, SectionHeader, StatusBadge } from "../../../../components/ui";
import { ARENA_BONE_FIELD_ID } from "../../../../rulesHints";
import type { ForestMarkerView, TurnEconomyState } from "../types";
import { useI18n } from "../../../../i18n";
import {
  getArenaLabel,
  getPhaseLabel,
  localizeServerText,
} from "../../../../i18n/displayMetadata";

interface StatusSectionProps {
  view: PlayerView;
  stormActive: boolean;
  forestMarkers: ForestMarkerView[];
  isSpectator: boolean;
  canStartTurn: boolean;
  expectedUnitId: string | undefined;
  legalIntents: PlayerView["legalIntents"];
  economy: TurnEconomyState;
  pendingRoll: boolean;
  onStartTurn: (unitId: string) => void;
}

export const StatusSection: FC<StatusSectionProps> = ({
  view,
  stormActive,
  forestMarkers,
  isSpectator,
  canStartTurn,
  expectedUnitId,
  legalIntents,
  economy,
  pendingRoll,
  onStartTurn,
}) => {
  const { t } = useI18n();
  const phase = getPhaseLabel(view.phase, t);

  return (
    <PanelCard className="p-4">
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
        <div className="panel-card-muted p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("game.phase")}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{phase}</div>
        </div>
        <div className="panel-card-muted p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("game.currentPlayer")}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
            {view.currentPlayer ?? "-"}
          </div>
        </div>
        <div className="panel-card-muted p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("game.roundTurn")}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
            {view.roundNumber} / {view.turnNumber}
          </div>
        </div>
        <div className="panel-card-muted p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("game.activeUnit")}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
            {view.activeUnitId ?? expectedUnitId ?? "-"}
          </div>
        </div>
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
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[
              [t("game.move"), economy.moveUsed],
              [t("game.attack"), economy.attackUsed],
              [t("game.action"), economy.actionUsed],
              [t("game.stealth"), economy.stealthUsed],
            ].map(([label, used]) => (
              <div
                key={String(label)}
                className={`rounded-lg border px-1.5 py-2 text-center text-[11px] font-semibold ${
                  used
                    ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:text-emerald-200"
                }`}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {stormActive ? (
        <p className="mt-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          {t("game.stormRestriction")}
        </p>
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
