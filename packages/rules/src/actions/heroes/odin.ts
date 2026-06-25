import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../model";
import { isInsideBoard } from "../../model";
import { coordsEqual, getUnitAt } from "../../board";
import {
  ABILITY_ODIN_SLEIPNIR,
  getAbilitySpec,
  getCharges,
  spendCharges,
} from "../../abilities";
import { HERO_ODIN_ID } from "../../heroes";
import { revealUnit } from "../../stealth";
import {
  applyStakeTriggerIfAny,
  clearPendingRoll,
  evAbilityUsed,
  evUnitMoved,
  requestRoll,
} from "../../core";
import type { RNG } from "../../rng";
import { isUnitVisibleToPlayer } from "../shared";

interface SleipnirPayload {
  to?: Coord;
  target?: Coord;
  position?: Coord;
}

function isOdin(unit: UnitState): boolean {
  return unit.heroId === HERO_ODIN_ID;
}

export function applyOdinSleipnir(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (!isOdin(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as SleipnirPayload | undefined;
  const dest = payload?.to ?? payload?.target ?? payload?.position;
  if (!dest || !isInsideBoard(dest, state.boardSize)) {
    return { state, events: [] };
  }
  if (coordsEqual(dest, unit.position)) {
    return { state, events: [] };
  }
  if (getUnitAt(state, dest)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_ODIN_SLEIPNIR);
  if (!spec) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const from = unit.position;
  const updatedUnit: UnitState = {
    ...spent.unit,
    position: { ...dest },
  };

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  let events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
    evUnitMoved({ unitId: updatedUnit.id, from, to: updatedUnit.position! }),
  ];

  const stakeResult = applyStakeTriggerIfAny(
    nextState,
    updatedUnit,
    updatedUnit.position!,
    rng
  );
  if (stakeResult.triggered) {
    nextState = stakeResult.state;
    events = [...events, ...stakeResult.events];
  }

  return { state: nextState, events };
}

export function getOdinSleipnirDestinations(
  state: GameState,
  unit: UnitState
): Coord[] {
  if (!isOdin(unit) || !unit.isAlive || !unit.position) return [];
  const destinations: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const position = { col, row };
      if (coordsEqual(position, unit.position)) continue;
      const occupant = getUnitAt(state, position);
      if (
        occupant &&
        isUnitVisibleToPlayer(state, occupant, unit.owner)
      ) {
        continue;
      }
      destinations.push(position);
    }
  }
  return destinations;
}

export function maybeTriggerOdinSleipnir(
  state: GameState,
  unitId: string
): ApplyResult {
  if (state.pendingRoll) return { state, events: [] };
  const unit = state.units[unitId];
  if (!unit || !isOdin(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  const spec = getAbilitySpec(ABILITY_ODIN_SLEIPNIR);
  const required = spec?.chargesPerUse ?? spec?.chargeCost ?? 0;
  if (required <= 0 || getCharges(unit, ABILITY_ODIN_SLEIPNIR) < required) {
    return { state, events: [] };
  }
  const options = getOdinSleipnirDestinations(state, unit);
  if (options.length === 0) {
    return { state, events: [] };
  }
  return requestRoll(
    state,
    unit.owner,
    "odinSleipnirDestination",
    { unitId: unit.id, options },
    unit.id
  );
}

export function resolveOdinSleipnirDestinationChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  if (
    !choice ||
    typeof choice !== "object" ||
    choice.type !== "odinSleipnirDestination"
  ) {
    return { state, events: [] };
  }
  const unitId =
    typeof pending.context.unitId === "string" ? pending.context.unitId : "";
  const unit = state.units[unitId];
  if (!unit || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }
  const options = Array.isArray(pending.context.options)
    ? (pending.context.options as Coord[])
    : [];
  const destination = choice.position;
  if (!options.some((option) => coordsEqual(option, destination))) {
    return { state, events: [] };
  }
  const occupant = getUnitAt(state, destination);
  if (
    occupant &&
    occupant.owner !== unit.owner &&
    occupant.isStealthed &&
    !isUnitVisibleToPlayer(state, occupant, unit.owner)
  ) {
    const revealed = revealUnit(state, occupant.id, "steppedOnHidden", rng);
    const retriggered = maybeTriggerOdinSleipnir(
      clearPendingRoll(revealed.state),
      unit.id
    );
    return {
      state: retriggered.state,
      events: [...revealed.events, ...retriggered.events],
    };
  }
  return applyOdinSleipnir(
    clearPendingRoll(state),
    unit,
    {
      type: "useAbility",
      unitId: unit.id,
      abilityId: ABILITY_ODIN_SLEIPNIR,
      payload: { to: destination },
    },
    rng
  );
}

