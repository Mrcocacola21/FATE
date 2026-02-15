import type { ApplyResult, Coord, GameAction, GameEvent, GameState, UnitState } from "../../model";
import { isInsideBoard } from "../../model";
import { coordsEqual, getUnitAt } from "../../board";
import {
  ABILITY_ODIN_SLEIPNIR,
  getAbilitySpec,
  spendCharges,
} from "../../abilities";
import { HERO_ODIN_ID } from "../../heroes";
import { evAbilityUsed, evUnitMoved } from "../../shared/events";

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
  action: Extract<GameAction, { type: "useAbility" }>
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

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
    evUnitMoved({ unitId: updatedUnit.id, from, to: updatedUnit.position! }),
  ];

  return { state: nextState, events };
}
