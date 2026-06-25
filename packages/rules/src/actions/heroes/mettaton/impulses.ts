import type { ApplyResult, GameEvent, GameState } from "../../../model";
import {
  getMettatonRating,
  hasMettatonExUnlocked,
  hasMettatonNeoUnlocked,
  isMettaton,
} from "../../../mettaton";
import { applyMettatonEx, applyMettatonNeo } from "./actions";

export function applyMettatonImpulseUnlocks(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const changedIds = Array.from(
    new Set(
      events
        .filter((event) => event.type === "mettatonRatingChanged")
        .map((event) =>
          event.type === "mettatonRatingChanged" ? event.unitId : ""
        )
        .filter((unitId) => unitId.length > 0)
    )
  ).sort();

  let nextState = state;
  const nextEvents: GameEvent[] = [];
  for (const unitId of changedIds) {
    let unit = nextState.units[unitId];
    if (!isMettaton(unit) || !unit.isAlive) continue;

    if (!hasMettatonExUnlocked(unit) && getMettatonRating(unit) >= 5) {
      const ex = applyMettatonEx(nextState, unit);
      nextState = ex.state;
      nextEvents.push(...ex.events);
      unit = nextState.units[unitId];
    }
    if (
      isMettaton(unit) &&
      hasMettatonExUnlocked(unit) &&
      !hasMettatonNeoUnlocked(unit) &&
      getMettatonRating(unit) >= 10
    ) {
      const neo = applyMettatonNeo(nextState, unit);
      nextState = neo.state;
      nextEvents.push(...neo.events);
    }
  }

  return { state: nextState, events: [...events, ...nextEvents] };
}
