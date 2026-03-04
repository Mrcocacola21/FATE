import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  UnitState,
} from "../../model";
import type { RNG } from "../../rng";
import { processUnitStartOfTurn } from "../../abilities";
import { processUnitStartOfTurnStealth } from "../../stealth";
import { resetTurnEconomy } from "../../turnEconomy";
import { HERO_KALADIN_ID, HERO_LOKI_ID } from "../../heroes";
import {
  maybeTriggerCarpetStrike,
  maybeTriggerEngineeringMiracle,
  processUnitStartOfTurnBunker,
} from "../heroes/kaiser";
import { tryApplyFriskPowerOfFriendship } from "../heroes/frisk";
import { maybeTriggerAsgoreSoulParade } from "../heroes/asgore";
import { clearKaladinMoveLocksForCaster } from "../heroes/kaladin";
import { clearLokiEffectsForCaster } from "../heroes/loki";
import { maybeTriggerElCidKolada } from "../heroes/elCid";
import { maybeTriggerGroznyTyrant } from "../heroes/grozny";
import {
  applyStormStartOfTurn,
  maybeTriggerLechyConfuseTerrain,
} from "../heroes/lechy";
import {
  maybeTriggerVladForestChoice,
  maybeTriggerVladTurnStakes,
} from "../heroes/vlad";
import { applySansBoneFieldStartOfTurn } from "../heroes/sans";

export function applyUnitStartTurn(
  state: GameState,
  action: Extract<GameAction, { type: "unitStartTurn" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const initialUnit = state.units[action.unitId];
  if (!initialUnit || !initialUnit.isAlive || !initialUnit.position) {
    return { state, events: [] };
  }

  if (initialUnit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }
  if (state.activeUnitId !== null) {
    return { state, events: [] };
  }

  const queue = state.turnQueue.length > 0 ? state.turnQueue : state.turnOrder;
  const queueIndex =
    state.turnQueue.length > 0 ? state.turnQueueIndex : state.turnOrderIndex;
  if (queue.length > 0) {
    const scheduledId = queue[queueIndex];
    if (scheduledId !== initialUnit.id) {
      return { state, events: [] };
    }
  }

  const stateAfterKaladinCleanup =
    initialUnit.heroId === HERO_KALADIN_ID
      ? clearKaladinMoveLocksForCaster(state, initialUnit.id)
      : state;
  const stateAfterStatusCleanup =
    initialUnit.heroId === HERO_LOKI_ID
      ? clearLokiEffectsForCaster(stateAfterKaladinCleanup, initialUnit.id)
      : stateAfterKaladinCleanup;

  const { state: afterBoneField, events: boneFieldEvents } =
    applySansBoneFieldStartOfTurn(stateAfterStatusCleanup, initialUnit.id, rng);
  const { state: afterStealth, events: stealthEvents } =
    processUnitStartOfTurnStealth(afterBoneField, initialUnit.id, rng);

  const unitAfterStealth = afterStealth.units[initialUnit.id];
  if (!unitAfterStealth || !unitAfterStealth.isAlive || !unitAfterStealth.position) {
    return { state: afterStealth, events: [...boneFieldEvents, ...stealthEvents] };
  }

  const { state: afterBunker, events: bunkerEvents } =
    processUnitStartOfTurnBunker(afterStealth, initialUnit.id);
  const unitAfterBunker = afterBunker.units[initialUnit.id];
  if (!unitAfterBunker) {
    return {
      state: afterBunker,
      events: [...boneFieldEvents, ...stealthEvents, ...bunkerEvents],
    };
  }

  const { state: afterStorm, events: stormEvents } = applyStormStartOfTurn(
    afterBunker,
    initialUnit.id,
    rng
  );
  const unitAfterStorm = afterStorm.units[initialUnit.id];
  if (!unitAfterStorm || !unitAfterStorm.isAlive || !unitAfterStorm.position) {
    return {
      state: afterStorm,
      events: [
        ...boneFieldEvents,
        ...stealthEvents,
        ...bunkerEvents,
        ...stormEvents,
      ],
    };
  }

  const { state: afterStart, events: startEvents } = processUnitStartOfTurn(
    afterStorm,
    initialUnit.id,
    rng
  );

  const unitAfterStart = afterStart.units[initialUnit.id];
  if (!unitAfterStart) {
    return {
      state: afterStart,
      events: [
        ...boneFieldEvents,
        ...stealthEvents,
        ...bunkerEvents,
        ...stormEvents,
        ...startEvents,
      ],
    };
  }

  const updatedForTurnCount: UnitState = {
    ...unitAfterStart,
    ownTurnsStarted: (unitAfterStart.ownTurnsStarted ?? 0) + 1,
  };
  const stateAfterTurnCount: GameState = {
    ...afterStart,
    units: {
      ...afterStart.units,
      [updatedForTurnCount.id]: updatedForTurnCount,
    },
  };

  const engineeringResult = maybeTriggerEngineeringMiracle(
    stateAfterTurnCount,
    initialUnit.id
  );
  const carpetResult = maybeTriggerCarpetStrike(
    engineeringResult.state,
    initialUnit.id
  );
  const koladaResult = carpetResult.state.pendingRoll
    ? carpetResult
    : maybeTriggerElCidKolada(carpetResult.state, initialUnit.id, rng);
  const asgoreResult = koladaResult.state.pendingRoll
    ? { state: koladaResult.state, events: [] as GameEvent[] }
    : maybeTriggerAsgoreSoulParade(koladaResult.state, initialUnit.id);
  const tyrantResult = asgoreResult.state.pendingRoll
    ? { state: asgoreResult.state, events: [] }
    : maybeTriggerGroznyTyrant(asgoreResult.state, initialUnit.id, rng);
  const confuseTerrainResult = tyrantResult.state.pendingRoll
    ? { state: tyrantResult.state, events: [] }
    : maybeTriggerLechyConfuseTerrain(tyrantResult.state, initialUnit.id);
  const forestResult = maybeTriggerVladForestChoice(
    confuseTerrainResult.state,
    initialUnit.id,
    true
  );
  const stakesResult = forestResult.state.pendingRoll
    ? forestResult
    : maybeTriggerVladTurnStakes(forestResult.state, initialUnit.id);
  const vladEvents =
    stakesResult === forestResult
      ? forestResult.events
      : [...forestResult.events, ...stakesResult.events];

  const unitAfter = stakesResult.state.units[initialUnit.id];
  if (!unitAfter) {
    return {
      state: stakesResult.state,
      events: [
        ...boneFieldEvents,
        ...stealthEvents,
        ...bunkerEvents,
        ...stormEvents,
        ...startEvents,
        ...engineeringResult.events,
        ...carpetResult.events,
        ...koladaResult.events,
        ...asgoreResult.events,
        ...tyrantResult.events,
        ...confuseTerrainResult.events,
        ...vladEvents,
      ],
    };
  }

  let resetUnit: UnitState = resetTurnEconomy(unitAfter);
  if (resetUnit.movementDisabledNextTurn) {
    resetUnit = {
      ...resetUnit,
      movementDisabledNextTurn: false,
      turn: {
        ...resetUnit.turn,
        moveUsed: true,
      },
    };
  }

  const newState: GameState = {
    ...stakesResult.state,
    units: {
      ...stakesResult.state.units,
      [resetUnit.id]: resetUnit,
    },
    activeUnitId: resetUnit.id,
  };

  const baseEvents: GameEvent[] = [
    ...boneFieldEvents,
    ...stealthEvents,
    ...bunkerEvents,
    ...stormEvents,
    ...startEvents,
    ...engineeringResult.events,
    ...carpetResult.events,
    ...koladaResult.events,
    ...asgoreResult.events,
    ...tyrantResult.events,
    ...confuseTerrainResult.events,
    ...vladEvents,
  ];

  const friendship = tryApplyFriskPowerOfFriendship(newState);
  if (friendship) {
    return {
      state: friendship.state,
      events: [...baseEvents, ...friendship.events],
    };
  }

  return {
    state: newState,
    events: baseEvents,
  };
}
