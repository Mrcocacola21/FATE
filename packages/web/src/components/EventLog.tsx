import type { FC } from "react";
import type { GameEvent } from "rules";
import { useI18n } from "../i18n";
import { localizeServerText } from "../i18n/displayMetadata";
import { formatDice, formatEventMessage } from "../i18n/eventMessages";

function eventTone(event: GameEvent): string {
  switch (event.type) {
    case "attackResolved":
    case "unitDied":
    case "damageBonusApplied":
    case "lechyStormRollResult":
      return "border-rose-300/80 bg-rose-50/75 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300";
    case "turnStarted":
    case "roundStarted":
    case "battleStarted":
    case "placementStarted":
      return "border-sky-300/80 bg-sky-50/75 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300";
    case "abilityUsed":
    case "chikatiloMarkApplied":
    case "chargesUpdated":
    case "rollRequested":
    case "initiativeRollRequested":
      return "border-violet-300/80 bg-violet-50/75 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/30 dark:text-violet-300";
    case "unitHealed":
    case "stealthEntered":
    case "stealthRevealed":
      return "border-emerald-300/80 bg-emerald-50/75 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300";
    default:
      return "border-stone-300/80 bg-stone-100/70 text-stone-600 dark:border-stone-800 dark:bg-black/20 dark:text-stone-300";
  }
}

function eventGlyph(event: GameEvent): string {
  switch (event.type) {
    case "attackResolved":
    case "unitDied":
    case "lechyStormRollResult":
    case "damageBonusApplied":
      return "⚔";
    case "unitHealed":
      return "+";
    case "abilityUsed":
    case "chikatiloMarkApplied":
    case "chargesUpdated":
      return event.type === "chikatiloMarkApplied" ? "M" : "✦";
    case "rollRequested":
    case "initiativeRollRequested":
      return "◆";
    case "turnStarted":
    case "roundStarted":
      return "›";
    case "stealthEntered":
    case "stealthRevealed":
      return "◈";
    default:
      return "·";
  }
}

interface EventLogProps {
  events: GameEvent[];
  clientLog: string[];
}

export const EventLog: FC<EventLogProps> = ({ events, clientLog }) => {
  const { language, t } = useI18n();
  const items = events.slice(-30).reverse();
  const clientItems = clientLog.slice(-8).reverse();

  return (
    <section className="panel-card panel-hud overflow-hidden">
      <div className="flex items-center justify-between border-b border-amber-900/10 px-4 py-3 dark:border-amber-500/15">
        <div>
          <div className="section-kicker">{t("log.kicker")}</div>
          <h3 className="section-title mt-1">{t("log.title")}</h3>
        </div>
        <span className="status-pill border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {t("log.events", { count: events.length })}
        </span>
      </div>
      <div className="scroll-panel max-h-[34rem] overflow-auto p-3 text-xs">
        {clientItems.length > 0 ? (
          <div className="mb-3 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-200">
            <div className="font-semibold">{t("log.clientNotices")}</div>
            {clientItems.map((message, index) => (
              <div key={`client-${index}`}>{localizeServerText(message, t)}</div>
            ))}
          </div>
        ) : null}
        {items.length === 0 && clientItems.length === 0 ? (
          <div className="panel-card-muted px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {t("log.empty")}
          </div>
        ) : null}
        {items.map((event, index) => {
          const sequence = Math.max(1, events.length - index);
          if (event.type === "attackResolved") {
            const result =
              event.hit === true
                ? t("log.hit")
                : event.hit === false
                  ? t("log.miss")
                  : t("common.unknown");
            return (
              <div
                key={`${event.type}-${index}`}
                className="mb-2 rounded-xl border border-rose-300/80 bg-rose-50/75 p-3 shadow-sm dark:border-rose-900/70 dark:bg-rose-950/25"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {t("log.attackTitle", {
                      attacker: event.attackerId ?? "-",
                      defender: event.defenderId ?? "-",
                    })}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">#{sequence}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-stone-600 dark:text-stone-300">
                  <div className="rounded-lg border border-rose-200/70 bg-white/50 px-2 py-1.5 dark:border-rose-900/50 dark:bg-black/15">
                    {t("log.attacker", { roll: formatDice(event.attackerRoll) })}
                  </div>
                  <div className="rounded-lg border border-rose-200/70 bg-white/50 px-2 py-1.5 dark:border-rose-900/50 dark:bg-black/15">
                    {t("log.defender", { roll: formatDice(event.defenderRoll) })}
                  </div>
                </div>
                {event.tieBreakDice ? (
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {t("log.reroll", {
                      attacker: event.tieBreakDice.attacker?.join(", ") ?? "",
                      defender: event.tieBreakDice.defender?.join(", ") ?? "",
                    })}
                  </div>
                ) : null}
                <div className="mt-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  {t("log.result", {
                    result,
                    damage: event.damage ?? "-",
                    hp: event.defenderHpAfter ?? "-",
                  })}
                </div>
              </div>
            );
          }
          return (
            <div
              key={`${event.type}-${index}`}
              className={`chronicle-item mb-2 ${eventTone(event)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 leading-5 text-stone-700 dark:text-stone-200">
                  <span className="mr-1.5 font-black text-current" aria-hidden="true">
                    {eventGlyph(event)}
                  </span>
                  {formatEventMessage(event, language, t)}
                </span>
                <span className="shrink-0 text-[10px] font-black opacity-45">#{sequence}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
