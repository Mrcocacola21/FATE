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
        Array.isArray(event.dice) && event.dice.length > 0
          ? `[${event.dice.join(", ")}]`
          : "[-]";
      return `Initiative rolled: ${event.player ?? "-"} ${dice} = ${
        event.sum ?? "-"
      }`;
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
          typeof after === "number" && typeof delta === "number"
            ? after - delta
            : undefined;
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
        Array.isArray(event.dice) && event.dice.length > 0
          ? `[${event.dice.join(", ")}]`
          : "[-]";
      return `Carpet Strike center: ${event.unitId} ${dice} = ${
        event.sum ?? "-"
      } -> (${event.center?.col ?? "-"}, ${event.center?.row ?? "-"})`;
    }
    case "carpetStrikeAttackRolled": {
      const dice =
        Array.isArray(event.dice) && event.dice.length > 0
          ? `[${event.dice.join(", ")}]`
          : "[-]";
      return `Carpet Strike attack: ${event.unitId} ${dice} = ${
        event.sum ?? "-"
      }`;
    }
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
      return event.type;
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

interface EventLogProps {
  events: GameEvent[];
  clientLog: string[];
}

export const EventLog: FC<EventLogProps> = ({ events, clientLog }) => {
  const items = events.slice(-30).reverse();
  const clientItems = clientLog.slice(-8).reverse();

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-200">
        Event Log
      </h3>
      <div className="max-h-96 overflow-auto rounded-2xl border-ui bg-surface p-3 text-xs shadow-sm shadow-slate-900/5 dark:shadow-black/40">
        {clientItems.length > 0 && (
          <div className="mb-3 space-y-1 text-[11px] text-amber-700 dark:text-amber-200">
            {clientItems.map((msg, index) => (
              <div key={`client-${index}`}>{msg}</div>
            ))}
          </div>
        )}
        {items.length === 0 && clientItems.length === 0 && (
          <div className="text-slate-400 dark:text-slate-500">No events yet.</div>
        )}
        {items.map((event, index) => {
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
                  className="mb-2 rounded-xl border-ui bg-surface p-2 shadow-sm shadow-slate-900/5 dark:shadow-black/30"
                >
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-100">
                    Attack: {attacker} to {defender}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-slate-600 dark:text-slate-300">
                    <div>Attacker {attackerRoll}</div>
                    <div>Defender {defenderRoll}</div>
                  </div>
                  {event.tieBreakDice && (
                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      Reroll A [{tieA.join(", ")}] / D [{tieD.join(", ")}]
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">
                    {hitLabel} - Damage {damage} - Defender HP {hpAfter}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`${event.type}-${index}`}
                className="py-1 text-slate-700 dark:text-slate-200"
              >
                {safeFormatEvent(event)}
              </div>
            );
          } catch {
            return (
              <div
                key={`fallback-${index}`}
                className="py-1 text-slate-700 dark:text-slate-200"
              >
                {formatEventFallback(event)}
              </div>
            );
          }
        })}
      </div>
    </div>
  );
};

