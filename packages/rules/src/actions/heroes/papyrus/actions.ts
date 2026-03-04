import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  PapyrusBoneType,
  UnitState,
} from "../../../model";
import { isInsideBoard } from "../../../model";
import {
  ABILITY_PAPYRUS_COOL_GUY,
  ABILITY_PAPYRUS_LONG_BONE,
  ABILITY_PAPYRUS_ORANGE_BONE,
  ABILITY_PAPYRUS_SPAGHETTI,
  getAbilitySpec,
  getCharges,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { getUnitBaseMaxHp } from "../../shared";
import { evAbilityUsed, evUnitHealed } from "../../../core";
import {
  getPapyrusCoolGuyCost,
  isLineAxis,
  isPapyrus,
  parseCoord,
} from "./helpers";
import { startPapyrusLineAttack } from "./lineAttack";
import type { LinePayload, LongBonePayload, OrangeBonePayload } from "./types";

export function applyPapyrusSpaghetti(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isPapyrus(unit) || !unit.isAlive) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_PAPYRUS_SPAGHETTI);
  if (!spec) {
    return { state, events: [] };
  }
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeCost = spec.chargesPerUse ?? spec.chargeCost ?? 3;
  const spent = spendCharges(unit, spec.id, chargeCost);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const maxHp = getUnitBaseMaxHp(unit);
  const slotted = spendSlots(spent.unit, costs);
  const hpBefore = slotted.hp;
  const healed = Math.max(0, Math.min(2, maxHp - hpBefore));
  const updatedUnit: UnitState = {
    ...slotted,
    hp: Math.min(maxHp, hpBefore + 2),
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];
  if (healed > 0) {
    events.push(
      evUnitHealed({
        unitId: updatedUnit.id,
        amount: healed,
        hpAfter: updatedUnit.hp,
        sourceAbilityId: spec.id,
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

export function applyPapyrusCoolGuy(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isPapyrus(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_PAPYRUS_COOL_GUY);
  if (!spec) {
    return { state, events: [] };
  }
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const payload = (action.payload ?? {}) as LinePayload;
  const target = parseCoord(payload.target);
  if (!target || !isInsideBoard(target, state.boardSize)) {
    return { state, events: [] };
  }
  const axis = isLineAxis(payload.axis)
    ? payload.axis
    : unit.papyrusLineAxis ?? "row";
  const chargeCost = getPapyrusCoolGuyCost(unit);
  if (getCharges(unit, spec.id) < chargeCost) {
    return { state, events: [] };
  }

  const spent = spendCharges(unit, spec.id, chargeCost);
  if (!spent.ok) {
    return { state, events: [] };
  }
  const updatedUnit: UnitState = spendSlots(
    {
      ...spent.unit,
      papyrusLineAxis: axis,
    },
    costs
  );
  const updatedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  const lineAttack = startPapyrusLineAttack(
    updatedState,
    updatedUnit,
    axis,
    target,
    spec.id
  );
  return {
    state: lineAttack.state,
    events: [...events, ...lineAttack.events],
  };
}

export function applyPapyrusOrangeBoneToggle(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isPapyrus(unit) || !unit.papyrusUnbelieverActive) {
    return { state, events: [] };
  }

  const payload = (action.payload ?? {}) as OrangeBonePayload;
  let boneMode: PapyrusBoneType;
  if (payload.boneType === "blue" || payload.boneType === "orange") {
    boneMode = payload.boneType;
  } else if (typeof payload.enabled === "boolean") {
    boneMode = payload.enabled ? "orange" : "blue";
  } else {
    boneMode = unit.papyrusBoneMode === "orange" ? "blue" : "orange";
  }

  const updatedUnit: UnitState = {
    ...unit,
    papyrusBoneMode: boneMode,
  };
  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
    },
    events: [
      evAbilityUsed({
        unitId: updatedUnit.id,
        abilityId: ABILITY_PAPYRUS_ORANGE_BONE,
      }),
    ],
  };
}

export function applyPapyrusLongBoneToggle(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isPapyrus(unit) || !unit.papyrusUnbelieverActive) {
    return { state, events: [] };
  }

  const payload = (action.payload ?? {}) as LongBonePayload;
  const axis = isLineAxis(payload.axis)
    ? payload.axis
    : unit.papyrusLineAxis ?? "row";
  const enabled =
    typeof payload.enabled === "boolean"
      ? payload.enabled
      : !(unit.papyrusLongBoneMode ?? false);

  const updatedUnit: UnitState = {
    ...unit,
    papyrusLongBoneMode: enabled,
    papyrusLineAxis: axis,
  };
  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
    },
    events: [
      evAbilityUsed({
        unitId: updatedUnit.id,
        abilityId: ABILITY_PAPYRUS_LONG_BONE,
      }),
    ],
  };
}

export function maybeApplyPapyrusLongBoneAttack(
  state: GameState,
  attackerId: string,
  anchorTargetId: string
): ApplyResult | null {
  const attacker = state.units[attackerId];
  const anchorTarget = state.units[anchorTargetId];
  if (!isPapyrus(attacker) || !attacker.papyrusUnbelieverActive) {
    return null;
  }
  if (!attacker.papyrusLongBoneMode || !attacker.isAlive || !attacker.position) {
    return null;
  }
  if (!anchorTarget || !anchorTarget.isAlive || !anchorTarget.position) {
    return { state, events: [] };
  }
  if (!canSpendSlots(attacker, { attack: true, action: true })) {
    return { state, events: [] };
  }

  const updatedAttacker: UnitState = spendSlots(attacker, {
    attack: true,
    action: true,
  });
  const updatedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedAttacker.id]: updatedAttacker,
    },
  };
  const axis = updatedAttacker.papyrusLineAxis ?? "row";
  return startPapyrusLineAttack(
    updatedState,
    updatedAttacker,
    axis,
    anchorTarget.position,
    ABILITY_PAPYRUS_LONG_BONE
  );
}
