import type { ApplyResult, GameEvent, GameState, UnitState } from "../../../model";
import { getUnitDefinition } from "../../../units";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_KAISER_ENGINEERING_MIRACLE,
  getAbilitySpec,
  getCharges,
} from "../../../abilities";
import { evAbilityUsed, evBunkerExited } from "../../../core";
import { HERO_GRAND_KAISER_ID } from "../../../heroes";
import { getUnitBaseMaxHp, isKaiser, isKaiserTransformed } from "../../shared";

export function applyKaiserEngineeringMiracle(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isKaiser(unit)) {
    return { state, events: [] };
  }

  if (isKaiserTransformed(unit)) {
    return { state, events: [] };
  }

  const baseMax = getUnitBaseMaxHp(unit);
  const newMax = Math.max(
    getUnitDefinition("archer").maxHp,
    getUnitDefinition("rider").maxHp,
    getUnitDefinition("berserker").maxHp
  );
  const missing = Math.max(0, baseMax - unit.hp);
  const nextHp = Math.max(0, newMax - missing);
  const berserkCharges = unit.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;

  const updatedUnit: UnitState = {
    ...unit,
    transformed: true,
    hp: nextHp,
    attack: 2,
    isStealthed: false,
    stealthTurnsLeft: 0,
    bunker: { active: false, ownTurnsInBunker: 0 },
    charges: {
      ...unit.charges,
      [ABILITY_BERSERK_AUTO_DEFENSE]: berserkCharges,
    },
  };

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [];
  if (unit.bunker?.active) {
    events.push(
      evBunkerExited({ unitId: updatedUnit.id, reason: "transformed" })
    );
  }

  events.push(
    evAbilityUsed({
      unitId: updatedUnit.id,
      abilityId: ABILITY_KAISER_ENGINEERING_MIRACLE,
    })
  );

  return { state: nextState, events };
}

export function maybeTriggerEngineeringMiracle(
  state: GameState,
  unitId: string
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || unit.heroId !== HERO_GRAND_KAISER_ID) {
    return { state, events: [] };
  }

  if (unit.transformed) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_KAISER_ENGINEERING_MIRACLE);
  const triggerCharges = spec?.triggerCharges ?? 0;
  if (
    triggerCharges > 0 &&
    getCharges(unit, ABILITY_KAISER_ENGINEERING_MIRACLE) < triggerCharges
  ) {
    return { state, events: [] };
  }

  return applyKaiserEngineeringMiracle(state, unit);
}
