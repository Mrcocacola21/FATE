import type { ApplyResult, GameEvent, GameState } from "../../../model";
import { ABILITY_LOKI_LAUGHT, addCharges, getCharges } from "../../../abilities";
import { isLoki } from "./effects";

function isDoubleDice(dice: number[] | undefined): boolean {
  return Array.isArray(dice) && dice.length >= 2 && dice[0] === dice[1];
}

function countDoubles(events: GameEvent[]): number {
  let total = 0;
  for (const event of events) {
    if (event.type === "attackResolved") {
      if (event.attackerRoll?.isDouble) total += 1;
      if (event.defenderRoll?.isDouble) total += 1;
      continue;
    }
    if (event.type === "initiativeRolled") {
      if (isDoubleDice(event.dice)) total += 1;
      continue;
    }
    if (event.type === "carpetStrikeCenter") {
      if (isDoubleDice(event.dice)) total += 1;
      continue;
    }
    if (event.type === "carpetStrikeAttackRolled") {
      if (isDoubleDice(event.dice)) total += 1;
    }
  }
  return total;
}

export function applyLokiIllusoryDoubleFromEvents(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const doubles = countDoubles(events);
  if (doubles <= 0) {
    return { state, events };
  }

  let nextState = state;
  let changed = false;
  const nextEvents: GameEvent[] = [...events];

  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || !unit.position || !isLoki(unit)) continue;
    const before = getCharges(unit, ABILITY_LOKI_LAUGHT);
    const updated = addCharges(unit, ABILITY_LOKI_LAUGHT, doubles);
    const after = getCharges(updated, ABILITY_LOKI_LAUGHT);
    if (after === before) continue;

    changed = true;
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [updated.id]: updated,
      },
    };
    nextEvents.push({
      type: "chargesUpdated",
      unitId: updated.id,
      deltas: { [ABILITY_LOKI_LAUGHT]: after - before },
      now: { [ABILITY_LOKI_LAUGHT]: after },
    });
  }

  return changed ? { state: nextState, events: nextEvents } : { state, events };
}
