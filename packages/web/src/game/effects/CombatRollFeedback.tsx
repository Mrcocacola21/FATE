import type { Translate } from "../../i18n";
import { combatRollSide, type CombatPresentationCue } from "./combatPlayback";

/** Displays only dice delivered by rollResolved; pending requests have no result. */
export function CombatRollFeedback({
  cue,
  t,
  top = 4,
}: {
  cue: Extract<CombatPresentationCue, { kind: "roll" }> | null;
  t: Translate;
  top?: number;
}) {
  if (!cue) return null;
  const { roll } = cue;
  const title = t(
    combatRollSide(roll.rollKind) === "attack"
      ? "pending.context.attackRoll"
      : "pending.context.defenseRoll",
  );
  return (
    <div
      key={cue.id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-combat-roll={roll.rollId}
      data-combat-cue={cue.id}
      className="combat-roll-feedback pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-lg border border-amber-400/40 bg-slate-950/90 px-3 py-2 text-center text-xs text-amber-50 shadow-lg"
      style={{ zIndex: 50, top }}
    >
      <div className="mb-1 font-semibold">
        {roll.rollerPlayerId} · {title}
      </div>
      <div className="flex items-center justify-center gap-1.5 tabular-nums">
        {roll.dice.map((value, index) => (
          <span
            key={index}
            data-combat-die={value}
            className="flex h-7 w-7 items-center justify-center rounded border border-amber-200/60 bg-amber-50 text-sm font-bold text-slate-950"
          >
            {value}
          </span>
        ))}
        <span className="ml-1">= {roll.total}</span>
      </div>
      <div className="mt-1 text-[10px] text-amber-100/70">
        {roll.dice.length}d{roll.sides}
      </div>
    </div>
  );
}
