import type { GameEvent, UnitState } from "../model";
import {
  addMettatonRating,
  buildMettatonRatingChangedEvent,
  getMettatonRating,
  isMettaton,
} from "../mettaton";

export function applyPostAttackRatings(
  hit: boolean,
  attackerAfter: UnitState,
  defenderAfter: UnitState,
  units: Record<string, UnitState>
): {
  attackerAfter: UnitState;
  defenderAfter: UnitState;
  units: Record<string, UnitState>;
  ratingEvents: GameEvent[];
} {
  const ratingEvents: GameEvent[] = [];

  if (hit && isMettaton(attackerAfter)) {
    const hitGain = addMettatonRating(attackerAfter, 2);
    if (hitGain.applied > 0) {
      attackerAfter = hitGain.unit;
      units[attackerAfter.id] = attackerAfter;
      ratingEvents.push(
        buildMettatonRatingChangedEvent({
          unitId: attackerAfter.id,
          delta: hitGain.applied,
          now: getMettatonRating(attackerAfter),
          reason: "attackHit",
        })
      );
    }
  }
  if (!hit && isMettaton(defenderAfter)) {
    const defenseGain = addMettatonRating(defenderAfter, 1);
    if (defenseGain.applied > 0) {
      defenderAfter = defenseGain.unit;
      units[defenderAfter.id] = defenderAfter;
      ratingEvents.push(
        buildMettatonRatingChangedEvent({
          unitId: defenderAfter.id,
          delta: defenseGain.applied,
          now: getMettatonRating(defenderAfter),
          reason: "defenseSuccess",
        })
      );
    }
  }

  return { attackerAfter, defenderAfter, units, ratingEvents };
}
