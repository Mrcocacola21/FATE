import type {
  ApplyResult,
  GameEvent,
  GameState,
  PapyrusBoneType,
  UnitState,
} from "../../../model";
import {
  ABILITY_SANS_BONE_FIELD,
  ABILITY_SANS_SLEEP,
  getAbilitySpec,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { evAbilityUsed, evUnitHealed } from "../../../core";
import {
  ARENA_BONE_FIELD_ID,
  hasSansUnbelieverUnlocked,
  isSans,
  isSansOrPapyrus,
} from "../../../sans";
import { getUnitBaseMaxHp } from "../../shared";

export function applySansBoneField(
  state: GameState,
  unit: UnitState,
  rng: { next: () => number }
): ApplyResult {
  if (!isSans(unit) || !unit.isAlive || !hasSansUnbelieverUnlocked(unit)) {
    return { state, events: [] };
  }

  const duration = 1 + Math.floor(rng.next() * 6) + 1;
  const updatedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unit.id]: unit,
    },
    arenaId: ARENA_BONE_FIELD_ID,
    boneFieldTurnsLeft: duration,
  };
  return {
    state: updatedState,
    events: [
      evAbilityUsed({ unitId: unit.id, abilityId: ABILITY_SANS_BONE_FIELD }),
      {
        type: "sansBoneFieldActivated",
        sansId: unit.id,
        duration,
      },
    ],
  };
}

export function applySansSleep(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isSans(unit) || !unit.isAlive || !hasSansUnbelieverUnlocked(unit)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_SANS_SLEEP);
  if (!spec) return { state, events: [] };
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeCost = spec.chargesPerUse ?? spec.chargeCost ?? 3;
  const spent = spendCharges(unit, spec.id, chargeCost);
  if (!spent.ok) {
    return { state, events: [] };
  }
  const slotted = spendSlots(spent.unit, costs);
  const maxHp = getUnitBaseMaxHp(slotted);
  const hpBefore = slotted.hp;
  const healed = Math.max(0, Math.min(2, maxHp - hpBefore));
  const updatedUnit: UnitState = {
    ...slotted,
    hp: Math.min(maxHp, hpBefore + 2),
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: ABILITY_SANS_SLEEP }),
  ];
  if (healed > 0) {
    events.push(
      evUnitHealed({
        unitId: updatedUnit.id,
        amount: healed,
        hpAfter: updatedUnit.hp,
        sourceAbilityId: ABILITY_SANS_SLEEP,
      })
    );
  }

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
    },
    events,
  };
}

export function applySansBoneFieldStartOfTurn(
  state: GameState,
  unitId: string,
  rng: { next: () => number }
): ApplyResult {
  if (state.arenaId !== ARENA_BONE_FIELD_ID) {
    return { state, events: [] };
  }

  let nextState = state;
  const nextEvents: GameEvent[] = [];

  let changed = false;
  const cleanedUnits: Record<string, UnitState> = { ...nextState.units };
  for (const unit of Object.values(nextState.units)) {
    const status = unit.sansBoneFieldStatus;
    if (!status || status.turnNumber === state.turnNumber) continue;
    cleanedUnits[unit.id] = {
      ...unit,
      sansBoneFieldStatus: undefined,
    };
    changed = true;
  }
  if (changed) {
    nextState = {
      ...nextState,
      units: cleanedUnits,
    };
  }

  const turnsLeft = Math.max(0, Math.trunc(nextState.boneFieldTurnsLeft ?? 0));
  if (turnsLeft <= 0) {
    return {
      state: {
        ...nextState,
        arenaId: null,
        boneFieldTurnsLeft: 0,
      },
      events: nextEvents,
    };
  }

  const activeUnit = nextState.units[unitId];
  if (activeUnit && activeUnit.isAlive && !isSansOrPapyrus(activeUnit)) {
    const roll = 1 + Math.floor(rng.next() * 2);
    const boneType: PapyrusBoneType = roll === 1 ? "blue" : "orange";
    const updatedUnit: UnitState = {
      ...activeUnit,
      sansBoneFieldStatus: {
        kind: boneType,
        turnNumber: state.turnNumber,
      },
    };
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [updatedUnit.id]: updatedUnit,
      },
    };
    nextEvents.push({
      type: "sansBoneFieldApplied",
      unitId: updatedUnit.id,
      boneType,
      turnNumber: state.turnNumber,
    });
  }

  return {
    state: {
      ...nextState,
      boneFieldTurnsLeft: Math.max(0, turnsLeft - 1),
    },
    events: nextEvents,
  };
}
