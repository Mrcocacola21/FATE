import type { ApplyResult, GameAction, GameEvent, GameState } from "../../../model";
import { getActionActorId } from "./helpers";
import {
  applySansBadassJokeDebuffs,
  applySansBoneFieldPunish,
  applySansUnbelieverFromDeaths,
} from "./effects";
import {
  applySansLastAttackFromDeaths,
  applySansLastAttackTickOnTurnStart,
  applySansMoveDeniedNotice,
  clearCursesForDeadUnits,
} from "./curses";

export function applySansPostAction(
  prevState: GameState,
  action: GameAction,
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  let nextState = state;
  let nextEvents: GameEvent[] = [...events];

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
      const punished = applySansBoneFieldPunish(
        nextState,
        actorId,
        "blue",
        "moveSpent",
        prevState.turnNumber
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
        const punished = applySansBoneFieldPunish(
          nextState,
          endingUnitId,
          "orange",
          "moveNotSpent",
          prevState.turnNumber
        );
        nextState = punished.state;
        nextEvents = [...nextEvents, ...punished.events];
      }
    }
  }

  const badJoke = applySansBadassJokeDebuffs(nextState, prevState, nextEvents);
  nextState = badJoke.state;
  nextEvents = [...nextEvents, ...badJoke.events];

  const unbeliever = applySansUnbelieverFromDeaths(nextState, nextEvents);
  nextState = unbeliever.state;
  nextEvents = [...nextEvents, ...unbeliever.events];

  const lastAttack = applySansLastAttackFromDeaths(nextState, prevState, nextEvents);
  nextState = lastAttack.state;
  nextEvents = [...nextEvents, ...lastAttack.events];

  const curseTick = applySansLastAttackTickOnTurnStart(nextState, action);
  nextState = curseTick.state;
  nextEvents = [...nextEvents, ...curseTick.events];

  const denied = applySansMoveDeniedNotice(nextState, prevState, action);
  nextState = denied.state;
  nextEvents = [...nextEvents, ...denied.events];

  const clearDead = clearCursesForDeadUnits(nextState, nextEvents);
  nextState = clearDead.state;
  nextEvents = [...nextEvents, ...clearDead.events];

  return {
    state: nextState,
    events: nextEvents,
  };
}
