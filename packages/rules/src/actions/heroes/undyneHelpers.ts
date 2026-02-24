import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  PendingCombatQueueEntry,
  UnitState,
} from "../../model";
import { canAttackTarget } from "../../combat";
import { requestRoll } from "../../core";
import { evAbilityUsed, evUnitDied, evUnitHealed } from "../../core";
import { ABILITY_UNDYNE_UNDYING } from "../../abilities";
import { getUnitBaseMaxHp } from "../shared";
import {
  hasUndyneImmortalActive,
  hasUndyneImmortalUsed,
  isUndyne,
} from "../../undyne";

export function parseCoord(value: unknown): Coord | null {
  if (!value || typeof value !== "object") return null;
  const col = (value as { col?: unknown }).col;
  const row = (value as { row?: unknown }).row;
  if (typeof col !== "number" || typeof row !== "number") return null;
  return { col, row };
}

export function canUseShooterLikeAttack(
  state: GameState,
  attacker: UnitState,
  target: UnitState
): boolean {
  const archerLikeAttacker: UnitState = {
    ...attacker,
    // Undyne is remapped to spearman reach in canAttackTarget by heroId.
    // Clear heroId for this helper so Throw Spear uses true archer geometry.
    heroId: undefined,
    class: "archer",
  };
  return canAttackTarget(state, archerLikeAttacker, target);
}

export function requestUndyneThrowAttack(
  state: GameState,
  unit: UnitState,
  targetId: string
): ApplyResult {
  const requested = requestRoll(
    state,
    unit.owner,
    "attack_attackerRoll",
    {
      attackerId: unit.id,
      defenderId: targetId,
      ignoreRange: true,
      rangedAttack: true,
      damageOverride: 1,
      ignoreBonuses: true,
      attackerDice: [],
      defenderDice: [],
      tieBreakAttacker: [],
      tieBreakDefender: [],
      stage: "initial",
      berserkerChoiceMade: false,
      odinMuninnChoiceMade: false,
      asgoreBraveryChoiceMade: false,
      chikatiloDecoyChoiceMade: false,
      friskSubstitutionChoiceMade: false,
      friskChildsCryChoiceMade: false,
      friskForceMiss: false,
      consumeSlots: false,
      queueKind: "normal",
    },
    unit.id
  );
  return requested;
}

export function requestUndyneSpearRain(
  state: GameState,
  unit: UnitState,
  targetId: string
): ApplyResult {
  const queue: PendingCombatQueueEntry[] = Array.from({ length: 3 }, () => ({
    attackerId: unit.id,
    defenderId: targetId,
    ignoreRange: true,
    rangedAttack: true,
    damageOverride: 1,
    ignoreBonuses: true,
    consumeSlots: false,
    kind: "aoe",
  }));
  const queuedState: GameState = {
    ...state,
    pendingCombatQueue: queue,
  };
  const first = queue[0];
  const requested = requestRoll(
    queuedState,
    unit.owner,
    "attack_attackerRoll",
    {
      attackerId: first.attackerId,
      defenderId: first.defenderId,
      ignoreRange: first.ignoreRange,
      rangedAttack: first.rangedAttack,
      damageOverride: first.damageOverride,
      ignoreBonuses: first.ignoreBonuses,
      attackerDice: [],
      defenderDice: [],
      tieBreakAttacker: [],
      tieBreakDefender: [],
      stage: "initial",
      berserkerChoiceMade: false,
      odinMuninnChoiceMade: false,
      asgoreBraveryChoiceMade: false,
      chikatiloDecoyChoiceMade: false,
      friskSubstitutionChoiceMade: false,
      friskChildsCryChoiceMade: false,
      friskForceMiss: false,
      consumeSlots: false,
      queueKind: "aoe",
    },
    unit.id
  );
  return requested;
}

export function applyUndyneImmortalFromDeaths(
  state: GameState,
  prevState: GameState,
  events: GameEvent[]
): ApplyResult {
  const deadUndyneIds = events
    .filter((event) => event.type === "unitDied")
    .map((event) => (event.type === "unitDied" ? event.unitId : ""))
    .filter((unitId) => {
      const prevUnit = prevState.units[unitId];
      return !!prevUnit && isUndyne(prevUnit) && !hasUndyneImmortalUsed(prevUnit);
    });
  if (deadUndyneIds.length === 0) {
    return { state, events: [] };
  }

  let nextState = state;
  const nextEvents: GameEvent[] = [];
  for (const unitId of Array.from(new Set(deadUndyneIds)).sort()) {
    const prevUnit = prevState.units[unitId];
    if (!prevUnit || !isUndyne(prevUnit) || !prevUnit.position) {
      continue;
    }
    const unit = nextState.units[unitId];
    if (!unit || unit.isAlive) {
      continue;
    }
    const occupiedByOther = Object.values(nextState.units).some(
      (candidate) =>
        candidate.id !== unit.id &&
        candidate.isAlive &&
        candidate.position?.col === prevUnit.position!.col &&
        candidate.position?.row === prevUnit.position!.row
    );
    if (occupiedByOther) {
      continue;
    }

    const maxHp = getUnitBaseMaxHp(unit);
    const hpAfter = Math.min(maxHp, 3);
    const revived: UnitState = {
      ...unit,
      hp: hpAfter,
      isAlive: true,
      position: { ...prevUnit.position },
      isStealthed: false,
      stealthTurnsLeft: 0,
      movementDisabledNextTurn: false,
      undyneImmortalUsed: true,
      undyneImmortalActive: true,
    };
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [revived.id]: revived,
      },
    };
    nextEvents.push(
      evAbilityUsed({ unitId: revived.id, abilityId: ABILITY_UNDYNE_UNDYING })
    );
    if (hpAfter > 0) {
      nextEvents.push(
        evUnitHealed({
          unitId: revived.id,
          amount: hpAfter,
          hpAfter,
          sourceAbilityId: ABILITY_UNDYNE_UNDYING,
        })
      );
    }
  }

  return { state: nextState, events: nextEvents };
}

export function applyUndyneImmortalEndTurnDrain(
  state: GameState,
  prevState: GameState,
  action: GameAction
): ApplyResult {
  if (action.type !== "endTurn") {
    return { state, events: [] };
  }

  const endingUnitId = prevState.activeUnitId;
  if (!endingUnitId) {
    return { state, events: [] };
  }
  const endingBefore = prevState.units[endingUnitId];
  const endingNow = state.units[endingUnitId];
  if (
    !endingBefore ||
    !endingNow ||
    !isUndyne(endingBefore) ||
    !endingNow.isAlive ||
    !hasUndyneImmortalActive(endingNow)
  ) {
    return { state, events: [] };
  }

  const hpAfter = Math.max(0, endingNow.hp - 1);
  let updated: UnitState = {
    ...endingNow,
    hp: hpAfter,
  };
  const events: GameEvent[] = [];
  if (hpAfter <= 0) {
    updated = {
      ...updated,
      isAlive: false,
      position: null,
    };
    events.push(evUnitDied({ unitId: updated.id, killerId: null }));
  }

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    },
    events,
  };
}
