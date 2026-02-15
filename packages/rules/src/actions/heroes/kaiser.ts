import type { Coord, GameEvent, GameState, UnitState } from "../../model";
import { isInsideBoard } from "../../model";
import { getUnitDefinition } from "../../units";
import { getUnitAt } from "../../board";
import { resolveAoE } from "../../aoe";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_KAISER_DORA,
  ABILITY_KAISER_ENGINEERING_MIRACLE,
  getAbilitySpec,
  getCharges,
  spendCharges,
} from "../../abilities";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { clearPendingRoll, requestRoll } from "../../core";
import {
  evAbilityUsed,
  evAoeResolved,
  evBunkerExited,
  evCarpetStrikeTriggered,
} from "../../core";
import {
  getUnitBaseMaxHp,
  isKaiser,
  isKaiserTransformed,
} from "../shared";
import type { ApplyResult } from "../../model";
import type { DoraAoEContext } from "../types";
import type { RNG } from "../../rng";
import { HERO_GRAND_KAISER_ID } from "../../heroes";
import type { GameAction } from "../../model";

export function isDoraCenterOnArcherLine(
  state: GameState,
  caster: UnitState,
  center: Coord
): boolean {
  if (!caster.position) return false;
  const from = caster.position;
  const dx = center.col - from.col;
  const dy = center.row - from.row;
  const sameRow = from.row === center.row;
  const sameCol = from.col === center.col;
  const isDiagonal = Math.abs(dx) === Math.abs(dy);
  if (!sameRow && !sameCol && !isDiagonal) {
    return false;
  }

  const stepCol = Math.sign(dx);
  const stepRow = Math.sign(dy);
  if (stepCol === 0 && stepRow === 0) {
    return false;
  }

  let col = from.col + stepCol;
  let row = from.row + stepRow;

  while (col >= 0 && col < state.boardSize && row >= 0 && row < state.boardSize) {
    if (col === center.col && row === center.row) {
      return true;
    }
    const u = getUnitAt(state, { col, row });
    if (u && u.owner !== caster.owner) {
      return false;
    }
    col += stepCol;
    row += stepRow;
  }

  return false;
}

interface DoraPayload {
  center: Coord;
}

export function applyKaiserDora(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (!isKaiser(unit)) {
    return { state, events: [] };
  }

  const payload = action.payload as DoraPayload | undefined;
  const center = payload?.center;
  if (!center || !isInsideBoard(center, state.boardSize)) {
    return { state, events: [] };
  }

  if (!isDoraCenterOnArcherLine(state, unit, center)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_KAISER_DORA);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  let updatedUnit = unit;
  if (!isKaiserTransformed(unit)) {
    const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
    const spent = spendCharges(updatedUnit, spec.id, chargeAmount);
    if (!spent.ok) {
      return { state, events: [] };
    }
    updatedUnit = spent.unit;
  }

  updatedUnit = spendSlots(updatedUnit, costs);

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  const aoeRes = resolveAoE(
    nextState,
    updatedUnit.id,
    center,
    {
      radius: 1,
      shape: "chebyshev",
      revealHidden: true,
      abilityId: spec.id,
      emitEvent: false,
    },
    rng
  );

  nextState = aoeRes.nextState;
  events.push(...aoeRes.events);

  const affectedUnitIds = aoeRes.affectedUnitIds;
  const revealedUnitIds = aoeRes.revealedUnitIds;

  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: updatedUnit.id,
        abilityId: spec.id,
        casterId: updatedUnit.id,
        center,
        radius: 1,
        affectedUnitIds,
        revealedUnitIds,
        damagedUnitIds: [],
        damageByUnitId: {},
      })
    );
    return { state: nextState, events };
  }

  const queuedState: GameState = {
    ...nextState,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: updatedUnit.id,
      abilityId: spec.id,
      center,
      radius: 1,
      affectedUnitIds,
      revealedUnitIds,
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: DoraAoEContext = {
    casterId: updatedUnit.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
  };

  const requested = requestRoll(
    queuedState,
    updatedUnit.owner,
    "dora_attackerRoll",
    ctx,
    updatedUnit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}

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
  const berserkCharges =
    unit.charges?.[ABILITY_BERSERK_AUTO_DEFENSE] ?? 0;

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

export function exitBunkerForUnit(
  state: GameState,
  unit: UnitState,
  reason: "timerExpired" | "attacked" | "transformed"
): { state: GameState; events: GameEvent[]; unit: UnitState } {
  if (!unit.bunker?.active) {
    return { state, events: [], unit };
  }

  const updated: UnitState = {
    ...unit,
    bunker: { active: false, ownTurnsInBunker: 0 },
  };

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    },
    events: [evBunkerExited({ unitId: updated.id, reason })],
    unit: updated,
  };
}

export function processUnitStartOfTurnBunker(
  state: GameState,
  unitId: string
): { state: GameState; events: GameEvent[] } {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.bunker?.active) {
    return { state, events: [] };
  }

  if (unit.bunker.ownTurnsInBunker >= 3) {
    const exited = exitBunkerForUnit(state, unit, "timerExpired");
    return { state: exited.state, events: exited.events };
  }

  const updated: UnitState = {
    ...unit,
    bunker: {
      active: true,
      ownTurnsInBunker: unit.bunker.ownTurnsInBunker + 1,
    },
  };

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    },
    events: [],
  };
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

export function maybeTriggerCarpetStrike(
  state: GameState,
  unitId: string
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || unit.heroId !== HERO_GRAND_KAISER_ID) {
    return { state, events: [] };
  }

  const charges = getCharges(unit, ABILITY_KAISER_CARPET_STRIKE);
  if (charges < 3) {
    return { state, events: [] };
  }

  const spent = spendCharges(unit, ABILITY_KAISER_CARPET_STRIKE, 3);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unit.id]: spent.unit,
    },
  };

  const requested = requestRoll(
    updatedState,
    unit.owner,
    "kaiserCarpetStrikeCenter",
    { unitId: unit.id },
    unit.id
  );

  const events: GameEvent[] = [
    evCarpetStrikeTriggered({ unitId: unit.id }),
    ...requested.events,
  ];

  return { state: requested.state, events };
}


