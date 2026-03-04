import type {
  ApplyResult,
  GameAction,
  GameEvent,
  GameState,
  UnitState,
} from "../../../model";
import { coordToNotation } from "../../../model";
import { chebyshev } from "../../../board";
import {
  ABILITY_CHIKATILO_ASSASSIN_MARK,
  ABILITY_CHIKATILO_DECOY,
  ABILITY_FALSE_TRAIL_EXPLOSION,
  getAbilitySpec,
  spendCharges,
} from "../../../abilities";
import { canSpendSlots, spendSlots } from "../../../turnEconomy";
import { clearPendingRoll, requestRoll } from "../../../core";
import { evAbilityUsed } from "../../../core";
import { HERO_CHIKATILO_ID } from "../../../heroes";
import { getUnitDefinition } from "../../../units";
import { getEmptyCells, isChikatilo, isFalseTrailToken } from "./helpers";
import { removeFalseTrailToken } from "./setup";

export function requestChikatiloPlacement(
  state: GameState,
  chikatiloId: string,
  queue: string[] = []
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  const unit = state.units[chikatiloId];
  if (!unit || !unit.isAlive || unit.heroId !== HERO_CHIKATILO_ID) {
    return { state, events: [] };
  }

  const legalPositions = getEmptyCells(state);
  const legalCells = legalPositions.map(coordToNotation);
  return requestRoll(
    clearPendingRoll(state),
    unit.owner,
    "chikatiloFalseTrailPlacement",
    { chikatiloId: unit.id, owner: unit.owner, legalPositions, legalCells, queue },
    unit.id
  );
}

export function applyChikatiloAssassinMark(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isChikatilo(unit) || !unit.position) {
    return { state, events: [] };
  }

  const payload = action.payload as { targetId?: string } | undefined;
  const targetId = payload?.targetId;
  if (!targetId) {
    return { state, events: [] };
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) {
    return { state, events: [] };
  }

  if (chebyshev(unit.position, target.position) > 2) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_CHIKATILO_ASSASSIN_MARK);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const updatedUnit = spendSlots(unit, costs);
  const marked = new Set(updatedUnit.chikatiloMarkedTargets ?? []);
  marked.add(targetId);

  const nextUnit: UnitState = {
    ...updatedUnit,
    chikatiloMarkedTargets: Array.from(marked),
  };

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [nextUnit.id]: nextUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: nextUnit.id, abilityId: spec.id }),
  ];

  return { state: nextState, events };
}

export function applyChikatiloDecoyStealth(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isChikatilo(unit) || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_CHIKATILO_DECOY);
  if (!spec) {
    return { state, events: [] };
  }

  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok) {
    return { state, events: [] };
  }

  let updatedUnit = spendSlots(spent.unit, costs);

  if (!updatedUnit.isStealthed) {
    const pos = updatedUnit.position!;
    const overlap = Object.values(state.units).some((other) => {
      if (!other.isAlive || !other.isStealthed || !other.position) return false;
      if (other.id === updatedUnit.id) return false;
      return other.position.col === pos.col && other.position.row === pos.row;
    });

    if (!overlap) {
      const def = getUnitDefinition(updatedUnit.class);
      updatedUnit = {
        ...updatedUnit,
        isStealthed: true,
        stealthTurnsLeft: def.maxStealthTurns ?? 3,
      };
    }
  }

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  return { state: nextState, events };
}

export function applyFalseTrailExplosion(
  state: GameState,
  unit: UnitState,
  options?: { ignoreEconomy?: boolean; revealQueue?: string[] }
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }
  if (!isFalseTrailToken(unit) || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_FALSE_TRAIL_EXPLOSION);
  if (!spec) {
    return { state, events: [] };
  }

  if (!options?.ignoreEconomy) {
    if (unit.owner !== state.currentPlayer) {
      return { state, events: [] };
    }
    if (state.activeUnitId !== unit.id) {
      return { state, events: [] };
    }
    const costs = spec.actionCost?.consumes ?? {};
    if (!canSpendSlots(unit, costs)) {
      return { state, events: [] };
    }

    unit = spendSlots(unit, costs);
  }

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unit.id]: unit,
    },
  };

  const events: GameEvent[] = options?.ignoreEconomy
    ? []
    : [evAbilityUsed({ unitId: unit.id, abilityId: spec.id })];
  const center = unit.position!;

  const affected = Object.values(nextState.units)
    .filter((target) => {
      if (!target.isAlive || !target.position) return false;
      if (target.id === unit.id) return false;
      return chebyshev(unit.position!, target.position) <= 1;
    })
    .map((target) => target.id)
    .sort();

  if (affected.length === 0) {
    const removed = removeFalseTrailToken(nextState, unit.id);
    nextState = removed.state;
    return {
      state: nextState,
      events: [...events, ...removed.events],
    };
  }

  const queuedState: GameState = {
    ...nextState,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: unit.id,
      abilityId: spec.id,
      center: { ...center },
      radius: 1,
      affectedUnitIds: affected,
      revealedUnitIds: [],
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx = {
    casterId: unit.id,
    targetsQueue: affected,
    currentTargetIndex: 0,
    revealQueue: options?.revealQueue ?? [],
  };

  const requested = requestRoll(
    clearPendingRoll(queuedState),
    unit.owner,
    "falseTrailExplosion_attackerRoll",
    ctx,
    unit.id
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}

export function requestChikatiloRevealChoice(
  state: GameState,
  chikatiloId: string,
  queue: string[] = []
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  const chikatilo = state.units[chikatiloId];
  if (!chikatilo || !chikatilo.isAlive || chikatilo.heroId !== HERO_CHIKATILO_ID) {
    return { state, events: [] };
  }
  const tokenId = chikatilo.chikatiloFalseTrailTokenId;
  if (!tokenId) {
    return { state, events: [] };
  }
  const token = state.units[tokenId];
  if (!token || !token.isAlive) {
    return { state, events: [] };
  }

  return requestRoll(
    clearPendingRoll(state),
    chikatilo.owner,
    "chikatiloFalseTrailRevealChoice",
    { chikatiloId, tokenId, queue },
    chikatilo.id
  );
}
