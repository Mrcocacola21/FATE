import type { FC } from "react";
import type { PlayerId, PlayerView } from "rules";

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
  const queue = view.turnQueue?.length ? view.turnQueue : view.turnOrder;
  const queueIndex = view.turnQueue?.length
    ? view.turnQueueIndex
    : view.turnOrderIndex;

  const currentUnitId = queue?.[queueIndex] ?? null;
  const currentUnit = currentUnitId ? view.units[currentUnitId] : null;

  return (
    <div className="rounded border border-slate-200 bg-white/80 p-4">
      <div className="text-sm text-slate-500">Initiative & Turn Queue</div>
      <div className="mt-2 text-xs text-slate-600">
        <div>
          Initiative: P1 {view.initiative.P1 ?? "-"} / P2 {view.initiative.P2 ?? "-"}
        </div>
        <div>Placement first: {view.placementFirstPlayer ?? "-"}</div>
      </div>

      <div className="mt-3 text-xs text-slate-600">
        Now acting:{" "}
        {currentUnit
          ? `${currentUnitId} (${currentUnit.class})`
          : currentUnitId ?? "-"}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {queue.map((unitId, idx) => {
          const unit = view.units[unitId];
          const isCurrent = idx === queueIndex;
          const isFriendly = unit
            ? playerId
              ? unit.owner === playerId
              : false
            : false;
          const isDead = unit ? !unit.isAlive : false;
          const label = unit ? classShort(unit.class) : "?";

          return (
            <div
              key={`${unitId}-${idx}`}
              className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${
                isCurrent
                  ? "border-teal-500 bg-teal-50 text-teal-700"
                  : "border-slate-200 bg-white text-slate-500"
              } ${isDead ? "opacity-50 line-through" : ""}`}
              title={unitId}
            >
              <span
                className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold ${
                  isFriendly ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                }`}
              >
                {label}
              </span>
              <span>{unit ? unitId : "Unknown"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

