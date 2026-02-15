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
import { applyChikatiloPostAction } from "./heroes/chikatilo";
import { applyFriskPostAction } from "./heroes/frisk";
import { applyLokiIllusoryDoubleFromEvents } from "./heroes/loki";

export function applyAction(
  state: GameState,
  action: GameAction,
  rng: RNG
): ApplyResult {
  if (state.pendingRoll && action.type !== "resolvePendingRoll") {
    return { state, events: [] };
  }

  let result: ApplyResult;

  switch (action.type) {
    case "rollInitiative":
      result = lobbyHandlers.applyRollInitiative(state, rng);
      break;

    case "chooseArena":
      result = lobbyHandlers.applyChooseArena(state, action);
      break;

    case "lobbyInit":
      result = lobbyHandlers.applyLobbyInit(state, action);
      break;

    case "setReady":
      result = lobbyHandlers.applySetReady(state, action);
      break;

    case "startGame":
      result = lobbyHandlers.applyStartGame(state, action);
      break;

    case "unitStartTurn":
      result = applyUnitStartTurn(state, action, rng);
      break;

    case "placeUnit":
      result = applyPlaceUnit(state, action);
      break;

    case "move":
      result = applyMove(state, action, rng);
      break;

    case "requestMoveOptions":
      result = applyRequestMoveOptions(state, action, rng);
      break;

    case "attack":
      result = applyAttack(state, action, rng);
      break;

    case "enterStealth":
      result = applyEnterStealth(state, action, rng);
      break;

    case "searchStealth":
      result = applySearchStealth(state, action, rng);
      break;

    case "useAbility":
      result = applyUseAbility(state, action, rng);
      break;

    case "resolvePendingRoll":
      result = applyResolvePendingRoll(state, action, rng);
      break;

    case "endTurn":
      result = applyEndTurn(state, rng);
      break;

    default:
      result = { state, events: [] };
      break;
  }

  const afterChikatilo = applyChikatiloPostAction(
    result.state,
    result.events,
    rng
  );
  const afterLoki = applyLokiIllusoryDoubleFromEvents(
    afterChikatilo.state,
    afterChikatilo.events
  );
  return applyFriskPostAction(afterLoki.state, afterLoki.events);
}
