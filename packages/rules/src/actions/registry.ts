import type { ApplyResult, GameAction, GameState } from "../model";
import type { RNG } from "../rng";
import { applyUseAbility } from "./abilityActions";
import { applyAttack } from "./combatActions";
import { lobbyHandlers } from "./lobbyActions";
import { applyMove, applyRequestMoveOptions } from "./movementActions";
import { applyResolvePendingRoll } from "./pendingRollActions";
import { applyPlaceUnit } from "./placementActions";
import { applyEnterStealth, applySearchStealth } from "./stealthActions";
import { applyEndTurn, applyUnitStartTurn } from "./turnActions";

export function applyAction(
  state: GameState,
  action: GameAction,
  rng: RNG
): ApplyResult {
  if (state.pendingRoll && action.type !== "resolvePendingRoll") {
    return { state, events: [] };
  }

  switch (action.type) {
    case "rollInitiative":
      return lobbyHandlers.applyRollInitiative(state, rng);

    case "chooseArena":
      return lobbyHandlers.applyChooseArena(state, action);

    case "lobbyInit":
      return lobbyHandlers.applyLobbyInit(state, action);

    case "setReady":
      return lobbyHandlers.applySetReady(state, action);

    case "startGame":
      return lobbyHandlers.applyStartGame(state, action);

    case "unitStartTurn":
      return applyUnitStartTurn(state, action, rng);

    case "placeUnit":
      return applyPlaceUnit(state, action);

    case "move":
      return applyMove(state, action, rng);

    case "requestMoveOptions":
      return applyRequestMoveOptions(state, action, rng);

    case "attack":
      return applyAttack(state, action, rng);

    case "enterStealth":
      return applyEnterStealth(state, action, rng);

    case "searchStealth":
      return applySearchStealth(state, action, rng);

    case "useAbility":
      return applyUseAbility(state, action, rng);

    case "resolvePendingRoll":
      return applyResolvePendingRoll(state, action, rng);

    case "endTurn":
      return applyEndTurn(state, rng);

    default:
      return { state, events: [] };
  }
}
