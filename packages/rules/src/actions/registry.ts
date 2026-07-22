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
import {
  applyPapyrusPostAction,
  maybeRequestPapyrusBoneChoice,
} from "./heroes/papyrus";
import { applySansPostAction } from "./heroes/sans";
import { applyUndynePostAction } from "./heroes/undyne";
import { applyMettatonImpulseUnlocks } from "./heroes/mettaton";
import { applyNewBatchPostAction } from "./heroes/newBatchPost";
import { cleanupJackTrapsForDeaths } from "../jackSnares";
import {
  applyRuleDeclarationAfterAttack,
  applyRuleDeclarationWinChecks,
} from "../ruleDeclarations";
import { GAME_OVER_REJECTION } from "../gameOver";
import {
  applyOrangeBoneNonMovePenalty,
  canStartOrangeBoneNonMove,
  markOrangeBoneMoveFirstSatisfied,
} from "./orangeBone";

class RecordingRng implements RNG {
  readonly values: number[] = [];

  constructor(private readonly source: RNG) {}

  next(): number {
    const value = this.source.next();
    this.values.push(value);
    return value;
  }
}

class ReplayRng implements RNG {
  private index = 0;

  constructor(
    private readonly values: readonly number[],
    private readonly source: RNG
  ) {}

  next(): number {
    if (this.index < this.values.length) {
      return this.values[this.index++];
    }
    return this.source.next();
  }
}

function applyCoreAction(
  state: GameState,
  action: GameAction,
  rng: RNG
): ApplyResult {
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

export function applyAction(
  state: GameState,
  action: GameAction,
  rng: RNG
): ApplyResult {
  if (state.phase === "ended") {
    return { state, events: [], rejectionReason: GAME_OVER_REJECTION };
  }
  const prevState = state;
  if (state.pendingRoll && action.type !== "resolvePendingRoll") {
    return { state, events: [] };
  }

  let result: ApplyResult;
  if (canStartOrangeBoneNonMove(state, action)) {
    // Probe with recorded random values so ordinary command validation remains
    // authoritative. A rejected command never receives the penalty.
    const recordingRng = new RecordingRng(rng);
    const probe = applyCoreAction(state, action, recordingRng);
    const accepted =
      !probe.rejectionReason &&
      (probe.state !== state || probe.events.length > 0);

    if (!accepted) {
      result = probe;
    } else {
      const penalty = applyOrangeBoneNonMovePenalty(state, action);
      const actorId = state.activeUnitId;
      const actorSurvived = actorId
        ? penalty.state.units[actorId]?.isAlive === true
        : true;
      if (!actorSurvived) {
        result = penalty;
      } else {
        const resolved = applyCoreAction(
          penalty.state,
          action,
          new ReplayRng(recordingRng.values, rng)
        );
        result = {
          state: resolved.state,
          events: [...penalty.events, ...resolved.events],
        };
      }
    }
  } else {
    result = applyCoreAction(state, action, rng);
  }

  if (result.rejectionReason) {
    return result;
  }

  result = markOrangeBoneMoveFirstSatisfied(prevState, result);

  const afterChikatilo = applyChikatiloPostAction(
    result.state,
    result.events,
    rng
  );
  const afterLoki = applyLokiIllusoryDoubleFromEvents(
    afterChikatilo.state,
    afterChikatilo.events
  );
  const afterPapyrus = applyPapyrusPostAction(
    prevState,
    action,
    afterLoki.state,
    afterLoki.events
  );
  const afterSans = applySansPostAction(
    prevState,
    action,
    afterPapyrus.state,
    afterPapyrus.events
  );
  const afterUndyne = applyUndynePostAction(
    prevState,
    action,
    afterSans.state,
    afterSans.events
  );
  const afterFrisk = applyFriskPostAction(
    afterUndyne.state,
    afterUndyne.events
  );
  const afterJackDeathCleanup = {
    ...afterFrisk,
    state: cleanupJackTrapsForDeaths(afterFrisk.state, afterFrisk.events),
  };
  if (afterJackDeathCleanup.state.phase === "ended") return afterJackDeathCleanup;
  const afterMettaton = applyMettatonImpulseUnlocks(
    afterJackDeathCleanup.state,
    afterJackDeathCleanup.events
  );
  const afterNewBatch = applyNewBatchPostAction(
    prevState,
    afterMettaton.state,
    afterMettaton.events,
    rng
  );
  const afterRuleAttack = applyRuleDeclarationAfterAttack(
    afterNewBatch.state,
    afterNewBatch.events
  );
  const afterWinChecks = applyRuleDeclarationWinChecks(
    afterRuleAttack.state,
    afterRuleAttack.events
  );
  if (afterWinChecks.state.phase === "ended") {
    return {
      ...afterWinChecks,
      state: {
        ...afterWinChecks.state,
        pendingPapyrusBoneChoices: [],
      },
    };
  }

  const papyrusBoneChoice = maybeRequestPapyrusBoneChoice(afterWinChecks.state);
  return {
    state: papyrusBoneChoice.state,
    events: [...afterWinChecks.events, ...papyrusBoneChoice.events],
  };
}
