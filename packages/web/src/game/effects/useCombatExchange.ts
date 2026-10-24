import { useEffect, useLayoutEffect, useState } from "react";
import type { PlayerView } from "rules";
import { pairCombatRoll, type CombatRollCue, type CombatRollDisplay } from "./combatExchange";
import type { BoardEventBatch } from "./types";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

function attackRollOf(display: CombatRollDisplay | null): CombatRollCue["roll"] | undefined {
  if (!display) return undefined;
  return display.roll.rollKind.endsWith("_attackerRoll") ||
    display.roll.rollKind === "kaiserCarpetStrikeAttack"
    ? display.roll
    : display.pairedRoll;
}

/** The held exchange, or else the remembered shared AoE attack, to pair the next roll with. */
export function previousFor(
  held: { key: string | null | undefined; display: CombatRollDisplay } | null,
  sharedAttack: { key: string | null | undefined; roll: CombatRollCue["roll"] } | null,
  sessionKey: string | null | undefined,
  cue: CombatRollCue,
): CombatRollDisplay | null {
  const current = held && held.key === sessionKey ? held.display : null;
  if (current && pairCombatRoll(current, cue).pairedRoll) return current;
  if (sharedAttack && sharedAttack.key === sessionKey) return { ...cue, roll: sharedAttack.roll };
  return current;
}

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
  // A shared-roll AoE throws its attack once; later defenders arrive after the first outcome
  // cleared `held`, so remember the last full attack roll to pair each later defense with it.
  const [sharedAttack, setSharedAttack] = useState<{
    key: typeof sessionKey;
    roll: CombatRollCue["roll"];
  } | null>(null);
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
      const paired = pairCombatRoll(previousFor(held, sharedAttack, sessionKey, cue), cue);
      const attack = attackRollOf(paired);
      // Only chain/use-scoped rolls: pairCombatRoll then refuses any unrelated later defense.
      if (
        attack &&
        attack.dice.length > 1 &&
        (attack.chainId || attack.abilityUseId) &&
        sharedAttack?.roll !== attack
      )
        setSharedAttack({ key: sessionKey, roll: attack });
      if (held?.display.id !== cue.id || held.display.outcome !== cue.outcome)
        setHeld({ key: sessionKey, display: paired });
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
  }, [cue, enabled, hasOutcome, held, sessionKey, sharedAttack, waiting]);
  const display = !enabled
    ? null
    : cue
      ? pairCombatRoll(previousFor(held, sharedAttack, sessionKey, cue), cue)
      : !hasOutcome && held && held.key === sessionKey && !held.display.outcome
        ? { ...held.display, persistent: true }
        : null;
  const attack = attackRollOf(display);
  const unit = attack?.unitId ? view.units[attack.unitId] : undefined;
  return {
    display,
    preparingUnitId: !display?.outcome && unit?.isAlive && unit.position ? unit.id : null,
  };
}
