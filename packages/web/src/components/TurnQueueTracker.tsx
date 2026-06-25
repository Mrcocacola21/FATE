import type { FC } from "react";
import type { PlayerId, PlayerView } from "rules";
import { PanelCard, SectionHeader, StatusBadge } from "./ui";
import { useI18n } from "../i18n";
import { getClassLabel } from "../i18n/displayMetadata";
import { getUnitTokenAsset } from "../assets/registry";

interface TurnQueueTrackerProps {
  view: PlayerView;
  playerId: PlayerId | null;
}

function classShort(unitClass: string) {
  switch (unitClass) {
    case "spearman":
      return "Sp";
    case "rider":
      return "Rd";
    case "trickster":
      return "Tr";
    case "assassin":
      return "As";
    case "berserker":
      return "Be";
    case "archer":
      return "Ar";
    case "knight":
      return "Kn";
    default:
      return unitClass.slice(0, 2);
  }
}

export const TurnQueueTracker: FC<TurnQueueTrackerProps> = ({ view, playerId }) => {
  const { t } = useI18n();
  const queue = view.turnQueue?.length ? view.turnQueue : view.turnOrder;
  const queueIndex = view.turnQueue?.length ? view.turnQueueIndex : view.turnOrderIndex;
  const currentUnitId = queue?.[queueIndex] ?? null;
  const currentUnit = currentUnitId ? view.units[currentUnitId] : null;

  return (
    <PanelCard variant="hud" className="p-4">
      <SectionHeader
        kicker={t("game.initiative")}
        title={t("game.turnQueue")}
        action={
          <StatusBadge tone={view.currentPlayer === playerId ? "success" : "neutral"}>
            {view.currentPlayer
              ? t("game.playerTurn", { player: view.currentPlayer })
              : t("common.waiting")}
          </StatusBadge>
        }
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="panel-card-muted p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("game.initiative")}
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
            P1 {view.initiative.P1 ?? "-"} / P2 {view.initiative.P2 ?? "-"}
          </div>
        </div>
        <div className="panel-card-muted p-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("game.actingNow")}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
            {currentUnit
              ? `${getClassLabel(currentUnit.class, t)} / ${currentUnit.owner}`
              : (currentUnitId ?? "-")}
          </div>
        </div>
      </div>

      <div className="scroll-panel mt-3 flex gap-2 overflow-x-auto pb-1">
        {queue.map((unitId, idx) => {
          const unit = view.units[unitId];
          const isCurrent = idx === queueIndex;
          const isFriendly = unit ? playerId === unit.owner : false;
          const isDead = unit ? !unit.isAlive : false;
          const label = unit ? classShort(unit.class) : "?";
          const tokenAsset = unit ? getUnitTokenAsset(unit) : null;

          return (
            <div
              key={`${unitId}-${idx}`}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-2 text-xs shadow-sm transition ${
                isCurrent
                  ? "border-amber-400 bg-amber-50 text-amber-900 ring-2 ring-amber-400/15 dark:bg-amber-950/40 dark:text-amber-100"
                  : "border-stone-300/70 bg-stone-100/55 text-stone-600 dark:border-stone-800 dark:bg-black/20 dark:text-stone-300"
              } ${isDead ? "opacity-45 line-through" : ""}`}
              title={unitId}
            >
              {tokenAsset ? (
                <img
                  src={tokenAsset.src}
                  alt=""
                  className={`h-7 w-7 rounded-lg border object-contain ${
                    isFriendly ? "border-cyan-400" : "border-rose-400"
                  }`}
                />
              ) : (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-[10px] font-bold text-white">
                  {label}
                </span>
              )}
              <span className="max-w-28 truncate">{unitId}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {t("game.placementFirst", { player: view.placementFirstPlayer ?? "-" })}
      </div>
    </PanelCard>
  );
};
