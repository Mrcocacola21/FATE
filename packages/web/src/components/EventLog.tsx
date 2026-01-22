import type { GameEvent } from "rules";
import type { FC } from "react";

function formatEvent(event: GameEvent): string {
  switch (event.type) {
    case "turnStarted":
      return `Turn started: ${event.player} (turn ${event.turnNumber})`;
    case "roundStarted":
      return `Round ${event.roundNumber} started`;
    case "unitPlaced":
      return `Unit placed: ${event.unitId}`;
    case "unitMoved":
      return `Unit moved: ${event.unitId}`;
    case "attackResolved":
      return `Attack: ${event.attackerId} -> ${event.defenderId} (${event.hit ? "hit" : "miss"})`;
    case "unitDied":
      return `Unit died: ${event.unitId}`;
    case "stealthEntered":
      return `Stealth attempt: ${event.unitId} (${event.success ? "success" : "fail"})`;
    case "stealthRevealed":
      return `Stealth revealed: ${event.unitId} (${event.reason})`;
    case "searchStealth":
      return `Search stealth: ${event.unitId} (${event.mode})`;
    case "abilityUsed":
      return `Ability used: ${event.unitId} (${event.abilityId})`;
    case "aoeResolved":
      return `AoE resolved: ${event.casterId} (${event.affectedUnitIds.length} targets)`;
    case "battleStarted":
      return `Battle started: ${event.startingPlayer}`;
    case "initiativeRolled":
      return `Initiative rolled`;
    case "arenaChosen":
      return `Arena chosen: ${event.arenaId}`;
    case "gameEnded":
      return `Game ended: ${event.winner}`;
    default:
      return event.type;
  }
}

interface EventLogProps {
  events: GameEvent[];
}

export const EventLog: FC<EventLogProps> = ({ events }) => {
  const items = events.slice(-30).reverse();

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-600">Event Log</h3>
      <div className="max-h-80 overflow-auto rounded border border-slate-200 bg-white/80 p-3 text-xs">
        {items.length === 0 && (
          <div className="text-slate-400">No events yet.</div>
        )}
        {items.map((event, index) => (
          <div key={`${event.type}-${index}`} className="py-1 text-slate-700">
            {formatEvent(event)}
          </div>
        ))}
      </div>
    </div>
  );
};
