// packages/server/src/permissions.ts

import { GameAction, GameState, PlayerId } from "rules";

export function isActionAllowedByPlayer(
  state: GameState,
  action: GameAction,
  playerId: PlayerId
): boolean {
  const turnBoundActions: GameAction["type"][] = [
    "placeUnit",
    "move",
    "requestMoveOptions",
    "attack",
    "enterStealth",
    "searchStealth",
    "useAbility",
    "endTurn",
    "unitStartTurn",
  ];

  if (turnBoundActions.includes(action.type)) {
    if (state.currentPlayer !== playerId) return false;
  }

  switch (action.type) {
    case "resolvePendingRoll": {
      return (
        !!state.pendingRoll &&
        state.pendingRoll.player === playerId &&
        state.pendingRoll.id === action.pendingRollId
      );
    }
    case "placeUnit":
    case "move":
    case "requestMoveOptions":
    case "enterStealth":
    case "searchStealth":
    case "useAbility":
    case "unitStartTurn": {
      const unit = state.units[action.unitId];
      if (!unit) return false;
      return unit.owner === playerId;
    }
    case "attack": {
      const unit = state.units[action.attackerId];
      if (!unit) return false;
      return unit.owner === playerId;
    }
    default:
      return true;
  }
}

