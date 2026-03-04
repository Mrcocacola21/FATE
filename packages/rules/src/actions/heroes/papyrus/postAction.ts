import type { ApplyResult, GameAction, GameEvent, GameState } from "../../../model";
import { getActionActorId } from "./helpers";
import {
  applyPapyrusBoneOnHits,
  applyPapyrusBonePunish,
  applyPapyrusUnbelieverFromDeaths,
  clearExpiredPapyrusStatusesForSource,
} from "./state";

export function applyPapyrusPostAction(
  prevState: GameState,
  action: GameAction,
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  let nextState = state;
  let nextEvents: GameEvent[] = [...events];

  if (action.type === "unitStartTurn") {
    nextState = clearExpiredPapyrusStatusesForSource(nextState, action.unitId);
  }

  const actorId = getActionActorId(prevState, action);
  if (actorId) {
    const prevActor = prevState.units[actorId];
    const nextActor = nextState.units[actorId];
    if (
      prevActor &&
      nextActor &&
      !prevActor.turn.moveUsed &&
      nextActor.turn.moveUsed
    ) {
      const punished = applyPapyrusBonePunish(
        nextState,
        actorId,
        "blue",
        "moveSpent"
      );
      nextState = punished.state;
      nextEvents = [...nextEvents, ...punished.events];
    }
  }

  if (action.type === "endTurn") {
    const endingUnitId = prevState.activeUnitId;
    if (endingUnitId) {
      const endingUnitBefore = prevState.units[endingUnitId];
      if (endingUnitBefore && !endingUnitBefore.turn.moveUsed) {
        const punished = applyPapyrusBonePunish(
          nextState,
          endingUnitId,
          "orange",
          "moveNotSpent"
        );
        nextState = punished.state;
        nextEvents = [...nextEvents, ...punished.events];
      }
    }
  }

  const appliedBones = applyPapyrusBoneOnHits(nextState, nextEvents);
  nextState = appliedBones.state;
  nextEvents = [...nextEvents, ...appliedBones.events];

  const transformed = applyPapyrusUnbelieverFromDeaths(nextState, nextEvents);
  nextState = transformed.state;
  nextEvents = [...nextEvents, ...transformed.events];

  return {
    state: nextState,
    events: nextEvents,
  };
}
