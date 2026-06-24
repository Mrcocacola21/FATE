import type { GameEvent, DiceRoll } from "rules";
import type { FC } from "react";

const ABILITY_NAME_BY_ID: Record<string, string> = {
  berserkAutoDefense: "Berserker Auto Defense",
  tricksterAoE: "Trickster AoE",
  kaiserBunker: "Bunker",
  kaiserDora: "Dora",
  kaiserCarpetStrike: "Carpet Strike",
  kaiserEngineeringMiracle: "Engineering Miracle",
  papyrusSpaghetti: "Tasty Spaghetti",
  papyrusCoolGuy: "Cool Guy",
  papyrusOrangeBone: "Orange Bone",
  papyrusLongBone: "Long Bone",
  sansGasterBlaster: "Gaster Blaster",
  sansBadassJoke: "Badass Joke",
  sansBoneField: "Bone Field",
  sansSleep: "Sleep",
};

function formatDice(roll?: DiceRoll | null) {
  if (!roll || !Array.isArray(roll.dice)) {
    return "(-) = -";
  }
  const dice = roll.dice.length > 0 ? roll.dice.join(", ") : "-";
  return `(${dice}) = ${roll.sum ?? "-"}`;
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
      } (${event.success === true ? "success" : event.success === false ? "fail" : "unknown"})`;
    case "stealthRevealed":
      return `Stealth revealed: ${event.unitId} (${event.reason})`;
    case "rollRequested":
      return `Roll requested: ${event.kind ?? "roll"} (${event.actorUnitId ?? event.player ?? "-"})`;
    case "initiativeRollRequested":
      return `Initiative roll requested: ${event.player ?? "-"}`;
    case "initiativeRolled": {
      const dice =
        Array.isArray(event.dice) && event.dice.length > 0 ? `[${event.dice.join(", ")}]` : "[-]";
      return `Initiative rolled: ${event.player ?? "-"} ${dice} = ${event.sum ?? "-"}`;
    }
    case "initiativeResolved":
      return `Initiative resolved: P1 ${event.P1sum ?? "-"} / P2 ${
        event.P2sum ?? "-"
      } (winner ${event.winner ?? "-"})`;
    case "placementStarted":
      return `Placement started: ${event.placementFirstPlayer ?? "-"}`;
    case "berserkerDefenseChosen":
      return `Berserker defense: ${event.defenderId} (${event.choice})`;
    case "chargesUpdated": {
      const deltas = event.deltas ?? {};
      const now = event.now ?? {};
      const entries = Object.entries(deltas).map(([id, delta]) => {
        const name = ABILITY_NAME_BY_ID[id] ?? id;
        const after = now[id];
        const before =
          typeof after === "number" && typeof delta === "number" ? after - delta : undefined;
        if (typeof before === "number" && typeof after === "number") {
          return `${name} ${before}->${after}`;
        }
        return `${name} +${delta}`;
      });
      const summary = entries.length > 0 ? entries.join(", ") : "-";
      return `Charges: ${event.unitId} ${summary}`;
    }
    case "mettatonRatingChanged": {
      const reason =
        event.reason === "attackHit"
          ? "attack hit"
          : event.reason === "defenseSuccess"
            ? "defense success"
            : event.reason === "defenseRoll"
              ? "defense roll"
              : event.reason === "stagePhenomenon"
                ? "stage"
                : "ability";
      const delta = event.delta >= 0 ? `+${event.delta}` : `${event.delta}`;
      return `Rating: ${event.unitId} ${delta} -> ${event.now} (${reason})`;
    }
    case "bunkerEntered":
      return `Bunker entered: ${event.unitId} (roll ${event.roll ?? "-"})`;
    case "bunkerEnterFailed":
      return `Bunker failed: ${event.unitId} (roll ${event.roll ?? "-"})`;
    case "bunkerExited":
      return `Bunker exited: ${event.unitId} (${event.reason})`;
    case "carpetStrikeTriggered":
      return `Carpet Strike triggered: ${event.unitId}`;
    case "carpetStrikeCenter": {
      const dice =
        Array.isArray(event.dice) && event.dice.length > 0 ? `[${event.dice.join(", ")}]` : "[-]";
      return `Carpet Strike center: ${event.unitId} ${dice} = ${
        event.sum ?? "-"
      } -> (${event.center?.col ?? "-"}, ${event.center?.row ?? "-"})`;
    }
    case "carpetStrikeAttackRolled": {
      const dice =
        Array.isArray(event.dice) && event.dice.length > 0 ? `[${event.dice.join(", ")}]` : "[-]";
      return `Carpet Strike attack: ${event.unitId} ${dice} = ${event.sum ?? "-"}`;
    }
    case "searchStealth":
      return `Search stealth: ${event.unitId} (${event.mode})${
        event.rolls && event.rolls.length > 0
          ? ` rolls [${event.rolls
              .map((roll) => `${roll.targetId}:${roll.roll} ${roll.success ? "success" : "fail"}`)
              .join(", ")}]`
          : ""
      }`;
    case "abilityUsed":
      return `Ability used: ${event.unitId} (${event.abilityId})`;
    case "papyrusUnbelieverActivated":
      return `Unbeliever awakened: ${event.papyrusId} after ${event.fallenAllyId} fell`;
    case "papyrusBoneApplied":
      return `Bone applied: ${event.papyrusId} -> ${event.targetId} (${event.boneType})`;
    case "papyrusBonePunished":
      return `Bone punishment: ${event.targetId} took ${event.damage} (${event.boneType}, ${event.reason})`;
    case "sansUnbelieverActivated":
      return `Unbeliever awakened: ${event.sansId} after ${event.fallenAllyId} fell`;
    case "sansBadassJokeApplied":
      return `Badass Joke: ${event.sansId} locked movement for ${event.targetId}`;
    case "sansMoveDenied":
      return `Movement denied: ${event.unitId} (source ${event.sourceSansId ?? "-"})`;
    case "sansBoneFieldActivated":
      return `Bone Field activated: ${event.sansId} (${event.duration} turns)`;
    case "sansBoneFieldApplied":
      return `Bone Field: ${event.unitId} gets ${event.boneType} bone`;
    case "sansBoneFieldPunished":
      return `Bone Field punishment: ${event.targetId} took ${event.damage} (${event.boneType}, ${event.reason})`;
    case "sansLastAttackApplied":
      return `Last Attack: ${event.sansId} cursed ${event.targetId}`;
    case "sansLastAttackTick":
      return `Curse tick: ${event.targetId} took ${event.damage} (HP ${event.hpAfter})`;
    case "sansLastAttackRemoved":
      return `Curse removed: ${event.targetId} (${event.reason})`;
    case "unitHealed":
      return `Healed: ${event.unitId} +${event.amount} (HP ${event.hpAfter})`;
    case "damageBonusApplied":
      return `Damage bonus: ${event.unitId} +${event.amount} (${event.source})`;
    case "stakesPlaced":
      return `Stakes placed: ${event.owner} (${event.positions?.length ?? 0})`;
    case "stakeTriggered":
      return `Stake triggered: ${event.unitId} at (${event.markerPos?.col ?? "-"}, ${
        event.markerPos?.row ?? "-"
      })`;
    case "intimidateTriggered":
      return `Intimidate: ${event.defenderId} vs ${event.attackerId}`;
    case "intimidateResolved":
      return `Intimidate push: ${event.attackerId} -> (${event.to?.col ?? "-"}, ${
        event.to?.row ?? "-"
      })`;
    case "forestActivated":
      return `Forest activated: ${event.vladId} (stakes ${event.stakesConsumed})`;
    case "aoeResolved":
      return `AoE resolved: ${event.sourceUnitId} (targets ${
        event.affectedUnitIds?.length ?? 0
      }, revealed ${event.revealedUnitIds?.length ?? 0})`;
    case "moveOptionsGenerated":
      return `Move options: ${event.unitId}${
        typeof event.roll === "number" ? ` rolled ${event.roll}` : ""
      }`;
    case "moveBlocked":
      return `Move blocked: ${event.unitId} (${event.reason})`;
    case "battleStarted":
      return `Battle started: ${event.startingPlayer} (${event.startingUnitId ?? "-"})`;
    case "arenaChosen":
      return `Arena chosen: ${event.arenaId}`;
    case "gameEnded":
      return `Game ended: ${event.winner}`;
    default:
      return String((event as { type?: string }).type ?? "event");
  }
}

function formatEventFallback(event: GameEvent): string {
  try {
    const raw = JSON.stringify(event);
    const clipped = raw.length > 200 ? `${raw.slice(0, 200)}...` : raw;
    return `Unreadable event: ${clipped}`;
  } catch {
    return "Unreadable event";
  }
}

function safeFormatEvent(event: GameEvent): string {
  try {
    return formatEvent(event);
  } catch {
    return formatEventFallback(event);
  }
}

function eventTone(event: GameEvent): string {
  switch (event.type) {
    case "attackResolved":
    case "unitDied":
    case "damageBonusApplied":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/35 dark:text-rose-200";
    case "turnStarted":
    case "roundStarted":
    case "battleStarted":
    case "placementStarted":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-200";
    case "abilityUsed":
    case "chargesUpdated":
    case "rollRequested":
    case "initiativeRollRequested":
      return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/35 dark:text-violet-200";
    case "unitHealed":
    case "stealthEntered":
    case "stealthRevealed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-200";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
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
    <section className="panel-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          <div className="section-kicker">Projected history</div>
          <h3 className="section-title mt-1">Event log</h3>
        </div>
        <span className="status-pill border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {events.length} events
        </span>
      </div>
      <div className="scroll-panel max-h-[32rem] overflow-auto p-3 text-xs">
        {clientItems.length > 0 && (
          <div className="mb-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200">
            <div className="font-semibold">Client notices</div>
            {clientItems.map((msg, index) => (
              <div key={`client-${index}`}>{msg}</div>
            ))}
          </div>
        )}
        {items.length === 0 && clientItems.length === 0 && (
          <div className="panel-card-muted px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Match events will appear here in chronological order.
          </div>
        )}
        {items.map((event, index) => {
          const sequence = Math.max(1, events.length - index);
          try {
            if (event.type === "attackResolved") {
              const attacker = event.attackerId ?? "-";
              const defender = event.defenderId ?? "-";
              const attackerRoll = formatDice(event.attackerRoll);
              const defenderRoll = formatDice(event.defenderRoll);
              const tieA = event.tieBreakDice?.attacker ?? [];
              const tieD = event.tieBreakDice?.defender ?? [];
              const hitLabel =
                event.hit === true ? "Hit" : event.hit === false ? "Miss" : "Unknown";
              const damage = event.damage ?? "-";
              const hpAfter = event.defenderHpAfter ?? "-";

              return (
                <div
                  key={`${event.type}-${index}`}
                  className="mb-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3 shadow-sm dark:border-rose-900/70 dark:bg-rose-950/25"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                      Attack: {attacker} to {defender}
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                      #{sequence}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <div>Attacker {attackerRoll}</div>
                    <div>Defender {defenderRoll}</div>
                  </div>
                  {event.tieBreakDice && (
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Reroll A [{tieA.join(", ")}] / D [{tieD.join(", ")}]
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                    {hitLabel} - Damage {damage} - Defender HP {hpAfter}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`${event.type}-${index}`}
                className="mb-2 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200"
              >
                <span
                  className={`shrink-0 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold ${eventTone(
                    event,
                  )}`}
                >
                  #{sequence}
                </span>
                <span className="min-w-0 leading-5">{safeFormatEvent(event)}</span>
              </div>
            );
          } catch {
            return (
              <div
                key={`fallback-${index}`}
                className="mb-2 rounded-xl border border-slate-200 bg-white p-2.5 leading-5 text-slate-700 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200"
              >
                {formatEventFallback(event)}
              </div>
            );
          }
        })}
      </div>
    </section>
  );
};
