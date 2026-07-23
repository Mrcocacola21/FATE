import type { ApplyResult, GameAction, GameEvent, GameState, UnitState } from "../../../model";
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
import { commitAbilityCost } from "../../abilityCosts";
import { HERO_CHIKATILO_ID, HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import { canDirectlyTargetUnit, concealUnitExactPositionFromOpponents } from "../../../visibility";
import {
  CHIKATILO_ASSASSIN_MARK_RANGE,
  CHIKATILO_MARK_TRACKING_EXPIRES,
  CHIKATILO_MARK_TRACKING_STARTS,
} from "../../../chikatiloMark";
import { isChikatilo, isFalseTrailToken } from "./helpers";
import { removeFalseTrailToken } from "./setup";
import { getLegalRealChikatiloPlacements } from "../../../legal";
import type { RNG } from "../../../rng";
import { rollD6 } from "../../../rng";
import { resolveAttack } from "../../../combat";
import { enterUnitStealth } from "../../../stealth";

export function requestChikatiloPlacement(
  state: GameState,
  chikatiloId: string,
  queue: string[] = [],
): ApplyResult {
  if (state.pendingRoll) {
    return { state, events: [] };
  }
  const unit = state.units[chikatiloId];
  if (!unit || !unit.isAlive || unit.heroId !== HERO_CHIKATILO_ID) {
    return { state, events: [] };
  }

  const legalPositions = getLegalRealChikatiloPlacements(state);
  const legalCells = legalPositions.map(coordToNotation);
  return requestRoll(
    clearPendingRoll(state),
    unit.owner,
    "chikatiloFalseTrailPlacement",
    { chikatiloId: unit.id, owner: unit.owner, legalPositions, legalCells, queue },
    unit.id,
  );
}

export function applyChikatiloAssassinMark(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>,
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

  if (target.id === unit.id) {
    return { state, events: [] };
  }

  if (!canDirectlyTargetUnit(state, unit.id, target.id)) {
    return { state, events: [] };
  }

  if (chebyshev(unit.position, target.position) > CHIKATILO_ASSASSIN_MARK_RANGE) {
    return { state, events: [] };
  }

  if ((unit.chikatiloMarkedTargets ?? []).includes(targetId)) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_CHIKATILO_ASSASSIN_MARK);
  if (!spec) {
    return { state, events: [] };
  }

  const committed = commitAbilityCost(state, unit.id, spec.id);
  if (!committed.ok) return { state, events: [] };

  const updatedUnit = committed.unit;
  const marked = new Set(updatedUnit.chikatiloMarkedTargets ?? []);
  marked.add(targetId);

  const nextUnit: UnitState = {
    ...updatedUnit,
    chikatiloMarkedTargets: Array.from(marked),
  };

  const nextState: GameState = {
    ...committed.state,
    units: {
      ...committed.state.units,
      [nextUnit.id]: nextUnit,
    },
  };

  const events: GameEvent[] = [
    ...committed.events,
    {
      type: "chikatiloMarkApplied",
      chikatiloId: nextUnit.id,
      targetId,
      ownerPlayerId: nextUnit.owner,
      trackingStarts: CHIKATILO_MARK_TRACKING_STARTS,
      trackingExpires: CHIKATILO_MARK_TRACKING_EXPIRES,
    },
  ];

  return { state: nextState, events };
}

export function applyChikatiloDecoyStealth(state: GameState, unit: UnitState): ApplyResult {
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

  if (unit.isStealthed) {
    return { state, events: [] };
  }

  const pos = unit.position;
  const overlapsStealthedUnit = Object.values(state.units).some((other) => {
    if (!other.isAlive || !other.isStealthed || !other.position) return false;
    if (other.id === unit.id) return false;
    return other.position.col === pos.col && other.position.row === pos.row;
  });
  if (overlapsStealthedUnit) {
    return { state, events: [] };
  }

  const hasOtherFigure = Object.values(state.units).some(
    (other) => other.isAlive && other.id !== unit.id && other.heroId !== HERO_FALSE_TRAIL_TOKEN_ID,
  );
  if (!hasOtherFigure) {
    return { state, events: [] };
  }

  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;
  const spent = spendCharges(unit, spec.id, chargeAmount);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = enterUnitStealth(spendSlots(spent.unit, costs));

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  nextState = concealUnitExactPositionFromOpponents(nextState, updatedUnit);

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
    {
      type: "chargesUpdated",
      unitId: updatedUnit.id,
      deltas: { [spec.id]: -chargeAmount },
      now: { [spec.id]: updatedUnit.charges[spec.id] ?? 0 },
    },
  ];

  return { state: nextState, events };
}

export function applyFalseTrailExplosionImmediately(
  state: GameState,
  unit: UnitState,
  rng: RNG,
): ApplyResult {
  if (state.phase !== "battle" || !isFalseTrailToken(unit) || !unit.position || !unit.isAlive) {
    return { state, events: [] };
  }

  const affected = Object.values(state.units)
    .filter(
      (target) =>
        target.isAlive &&
        !!target.position &&
        target.id !== unit.id &&
        chebyshev(unit.position!, target.position) <= 1,
    )
    .map((target) => target.id)
    .sort();
  const attackerDice = [rollD6(rng), rollD6(rng)];
  let nextState = state;
  const events: GameEvent[] = [];
  const damagedUnitIds: string[] = [];
  const revealedUnitIds: string[] = [];
  const damageByUnitId: Record<string, number> = {};

  for (const targetId of affected) {
    const target = nextState.units[targetId];
    if (!target?.isAlive || !target.position) continue;
    const resolved = resolveAttack(nextState, {
      attackerId: unit.id,
      defenderId: targetId,
      ignoreRange: true,
      ignoreStealth: true,
      revealStealthedAllies: true,
      revealReason: "aoeHit",
      damageOverride: 1,
      ignoreBonuses: true,
      rolls: {
        attackerDice,
        defenderDice: [rollD6(rng), rollD6(rng)],
      },
    });
    nextState = resolved.nextState;
    events.push(...resolved.events);
    const attack = resolved.events.find(
      (event) =>
        event.type === "attackResolved" &&
        event.attackerId === unit.id &&
        event.defenderId === targetId,
    );
    if (attack?.type === "attackResolved" && attack.damage > 0) {
      damagedUnitIds.push(targetId);
      damageByUnitId[targetId] = attack.damage;
    }
    for (const event of resolved.events) {
      if (event.type === "stealthRevealed" && !revealedUnitIds.includes(event.unitId)) {
        revealedUnitIds.push(event.unitId);
      }
    }
  }

  events.push({
    type: "aoeResolved",
    sourceUnitId: unit.id,
    abilityId: ABILITY_FALSE_TRAIL_EXPLOSION,
    casterId: unit.id,
    center: { ...unit.position },
    radius: 1,
    affectedUnitIds: affected,
    revealedUnitIds,
    damagedUnitIds,
    damageByUnitId,
  });
  const removed = removeFalseTrailToken(nextState, unit.id);
  return {
    state: removed.state,
    events: [...events, ...removed.events],
  };
}

export function applyFalseTrailExplosion(
  state: GameState,
  unit: UnitState,
  options?: { ignoreEconomy?: boolean; revealQueue?: string[] },
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
    unit.id,
  );

  return { state: requested.state, events: [...events, ...requested.events] };
}

export function requestChikatiloRevealChoice(
  state: GameState,
  chikatiloId: string,
  queue: string[] = [],
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
    chikatilo.id,
  );
}
