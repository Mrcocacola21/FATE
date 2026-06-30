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
  return { state, events };
}

export function maybeTriggerMettatonThresholdUnlocks(
  state: GameState,
  unitId: string
): ApplyResult {
  let nextState = state;
  const nextEvents: GameEvent[] = [];

  let unit = nextState.units[unitId];
  if (!isMettaton(unit) || !unit.isAlive) {
    return { state, events: [] };
  }

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

  return { state: nextState, events: nextEvents };
}
