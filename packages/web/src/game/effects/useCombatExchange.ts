import { useEffect, useLayoutEffect, useState } from "react";
import type { PlayerView } from "rules";
import { pairCombatRoll, type CombatRollCue, type CombatRollDisplay } from "./combatExchange";
import type { BoardEventBatch } from "./types";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Retains one exchange while a human chooses a response; never dispatches actions. */
export function useCombatExchange({
  cue,
  batch,
  view,
  enabled,
  sessionKey,
}: {
  cue: CombatRollCue | null;
  batch: BoardEventBatch | null;
  view: PlayerView;
  enabled: boolean;
  sessionKey: string | null | undefined;
}) {
  const [held, setHeld] = useState<{ key: typeof sessionKey; display: CombatRollDisplay } | null>(
    null,
  );
  const waiting = Boolean(view.pendingDecision || view.pendingRoll);
  const hasOutcome = Boolean(
    batch?.events.some((event) => event.type === "attackResolved" || event.type === "aoeResolved"),
  );
  useBeforePaint(() => {
    if (!enabled || (held && held.key !== sessionKey)) {
      setHeld(null);
      return;
    }
    if (cue) {
      if (held?.display.id !== cue.id || held.display.outcome !== cue.outcome)
        setHeld({ key: sessionKey, display: pairCombatRoll(held?.display ?? null, cue) });
    } else if (hasOutcome) {
      if (held) setHeld(null);
    } else if (!waiting && held) {
      // A room snapshot can clear the decision before its actionResult arrives.
      // Keep the existing panel briefly across that gap; never invent a result.
      const timer = setTimeout(
        () => setHeld((current) => (current === held ? null : current)),
        1500,
      );
      return () => clearTimeout(timer);
    }
  }, [cue, enabled, hasOutcome, held, sessionKey, waiting]);
  const display = !enabled
    ? null
    : cue
      ? pairCombatRoll(held && held.key === sessionKey ? held.display : null, cue)
      : !hasOutcome && held && held.key === sessionKey && !held.display.outcome
        ? { ...held.display, persistent: true }
        : null;
  const attack =
    display?.roll.rollKind.endsWith("_attackerRoll") ||
    display?.roll.rollKind === "kaiserCarpetStrikeAttack"
      ? display.roll
      : display?.pairedRoll;
  const unit = attack?.unitId ? view.units[attack.unitId] : undefined;
  return {
    display,
    preparingUnitId: !display?.outcome && unit?.isAlive && unit.position ? unit.id : null,
  };
}
