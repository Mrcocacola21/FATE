import type { GameEvent, DiceRoll } from "rules";
import type { FC } from "react";

function formatDice(roll: DiceRoll) {
  const dice = roll.dice.length > 0 ? roll.dice.join(", ") : "-";
  return `(${dice}) = ${roll.sum}`;
}

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
      return `Attack: ${event.attackerId} -> ${event.defenderId}`;
    case "unitDied":
      return `Unit died: ${event.unitId}`;
    case "stealthEntered":
      return `Stealth attempt: ${event.unitId}${
        typeof event.roll === "number" ? ` rolled ${event.roll}` : ""
      } (${event.success ? "success" : "fail"})`;
    case "stealthRevealed":
      return `Stealth revealed: ${event.unitId} (${event.reason})`;
    case "rollRequested":
      return `Roll requested: ${event.kind} (${event.actorUnitId ?? event.player})`;
    case "berserkerDefenseChosen":
      return `Berserker defense: ${event.defenderId} (${event.choice})`;
    case "searchStealth":
      return `Search stealth: ${event.unitId} (${event.mode})${
        event.rolls && event.rolls.length > 0
          ? ` rolls [${event.rolls
              .map(
                (roll) =>
                  `${roll.targetId}:${roll.roll} ${
                    roll.success ? "success" : "fail"
                  }`
              )
              .join(", ")}]`
          : ""
      }`;
    case "abilityUsed":
      return `Ability used: ${event.unitId} (${event.abilityId})`;
    case "aoeResolved":
      return `AoE resolved: ${event.sourceUnitId} (targets ${event.affectedUnitIds.length}, revealed ${event.revealedUnitIds.length})`;
    case "moveOptionsGenerated":
      return `Move options: ${event.unitId}${
        typeof event.roll === "number" ? ` rolled ${event.roll}` : ""
      }`;
    case "moveBlocked":
      return `Move blocked: ${event.unitId} (${event.reason})`;
    case "battleStarted":
      return `Battle started: ${event.startingPlayer}`;
    case "initiativeRolled":
      return `Initiative: P1 ${event.rolls.P1} vs P2 ${event.rolls.P2} (first ${event.placementFirstPlayer})`;
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
  clientLog: string[];
}

export const EventLog: FC<EventLogProps> = ({ events, clientLog }) => {
  const items = events.slice(-30).reverse();
  const clientItems = clientLog.slice(-8).reverse();

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-600">Event Log</h3>
      <div className="max-h-96 overflow-auto rounded border border-slate-200 bg-white/80 p-3 text-xs">
        {clientItems.length > 0 && (
          <div className="mb-3 space-y-1 text-[11px] text-amber-700">
            {clientItems.map((msg, index) => (
              <div key={`client-${index}`}>{msg}</div>
            ))}
          </div>
        )}
        {items.length === 0 && clientItems.length === 0 && (
          <div className="text-slate-400">No events yet.</div>
        )}
        {items.map((event, index) => {
          if (event.type === "attackResolved") {
            return (
              <div
                key={`${event.type}-${index}`}
                className="mb-2 rounded border border-slate-200 bg-white/70 p-2"
              >
                <div className="text-[11px] font-semibold text-slate-700">
                  Attack: {event.attackerId} to {event.defenderId}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-slate-600">
                  <div>Attacker {formatDice(event.attackerRoll)}</div>
                  <div>Defender {formatDice(event.defenderRoll)}</div>
                </div>
                {event.tieBreakDice && (
                  <div className="mt-1 text-[10px] text-slate-500">
                    Reroll A [{event.tieBreakDice.attacker.join(", ")}] / D [{event.tieBreakDice.defender.join(", ")}]
                  </div>
                )}
                <div className="mt-1 text-[10px] text-slate-600">
                  {event.hit ? "Hit" : "Miss"} - Damage {event.damage} - Defender HP {event.defenderHpAfter}
                </div>
              </div>
            );
          }

          return (
            <div key={`${event.type}-${index}`} className="py-1 text-slate-700">
              {formatEvent(event)}
            </div>
          );
        })}
      </div>
    </div>
  );
};

