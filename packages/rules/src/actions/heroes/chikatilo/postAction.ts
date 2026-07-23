import type { ApplyResult, GameEvent, GameState, UnitState } from "../../../model";
import { evUnitDied } from "../../../core";
import { HERO_CHIKATILO_ID, HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import type { RNG } from "../../../rng";
import { rollContest } from "./helpers";
import { applyFalseTrailExplosionImmediately } from "./actions";
import { clearUnitStealth } from "../../../stealth";

function revealChikatiloImmediately(
  state: GameState,
  chikatiloId: string,
): { state: GameState; events: GameEvent[] } {
  const chikatilo = state.units[chikatiloId];
  if (!chikatilo || !chikatilo.isAlive || !chikatilo.position) {
    return { state, events: [] };
  }
  if (!chikatilo.isStealthed) {
    return { state, events: [] };
  }

  const updated: UnitState = clearUnitStealth(chikatilo);

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updated.id]: updated,
    },
    knowledge: {
      ...state.knowledge,
      P1: { ...(state.knowledge?.P1 ?? {}), [updated.id]: true },
      P2: { ...(state.knowledge?.P2 ?? {}), [updated.id]: true },
    },
  };

  const clearedLastKnown = {
    ...nextState.lastKnownPositions,
    P1: { ...(nextState.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(nextState.lastKnownPositions?.P2 ?? {}) },
  };
  delete clearedLastKnown.P1[updated.id];
  delete clearedLastKnown.P2[updated.id];

  return {
    state: {
      ...nextState,
      lastKnownPositions: clearedLastKnown,
    },
    events: [
      {
        type: "stealthRevealed",
        unitId: updated.id,
        reason: "forcedDisplacement",
      },
    ],
  };
}

function performFalseTrailTrap(
  state: GameState,
  tokenId: string,
  targetId: string,
  rng: RNG,
): { state: GameState; events: GameEvent[] } {
  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    return { state, events: [] };
  }

  const { attackerRoll, defenderRoll, tieBreakDice, hit } = rollContest(rng);
  let damage = hit ? 3 : 0;
  if (target.bunker?.active) {
    damage = Math.min(1, damage);
  }

  const newHp = Math.max(0, target.hp - damage);
  let updatedTarget: UnitState = {
    ...target,
    hp: newHp,
  };

  const events: GameEvent[] = [];

  if (newHp <= 0) {
    updatedTarget = {
      ...updatedTarget,
      isAlive: false,
      position: null,
    };
    events.push(evUnitDied({ unitId: updatedTarget.id, killerId: tokenId }));
  }

  const nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedTarget.id]: updatedTarget,
    },
  };

  events.unshift({
    type: "attackResolved",
    attackerId: tokenId,
    defenderId: targetId,
    attackerRoll,
    defenderRoll,
    tieBreakDice,
    hit,
    damage,
    defenderHpAfter: updatedTarget.hp,
  });

  return { state: nextState, events };
}

export function applyChikatiloPostAction(
  state: GameState,
  events: GameEvent[],
  rng: RNG,
): ApplyResult {
  let nextState = state;
  let nextEvents = [...events];

  const processedTokenDeaths = new Set<string>();
  const processedChikatiloReveals = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;

    for (const event of [...nextEvents]) {
      if (event.type !== "unitDied" || processedTokenDeaths.has(event.unitId)) continue;
      const tokenUnit = nextState.units[event.unitId] ?? state.units[event.unitId];
      const isToken =
        tokenUnit?.heroId === HERO_FALSE_TRAIL_TOKEN_ID ||
        Object.values(nextState.units).some(
          (unit) => unit.chikatiloFalseTrailTokenId === event.unitId,
        );
      if (!isToken) continue;
      processedTokenDeaths.add(event.unitId);

      const owner = Object.values(nextState.units).find(
        (unit) => unit.chikatiloFalseTrailTokenId === event.unitId,
      );
      if (owner?.isStealthed) {
        const revealed = revealChikatiloImmediately(nextState, owner.id);
        nextState = revealed.state;
        nextEvents.push(...revealed.events);
        changed = changed || revealed.events.length > 0;
      }
      if (event.killerId) {
        const trap = performFalseTrailTrap(nextState, event.unitId, event.killerId, rng);
        nextState = trap.state;
        nextEvents.push(...trap.events);
        changed = changed || trap.events.length > 0;
      }
    }

    for (const chikatilo of Object.values(nextState.units)) {
      if (!chikatilo.isAlive || !chikatilo.isStealthed || chikatilo.heroId !== HERO_CHIKATILO_ID) {
        continue;
      }
      const hasOtherRealUnit = Object.values(nextState.units).some(
        (unit) =>
          unit.isAlive && unit.id !== chikatilo.id && unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID,
      );
      if (hasOtherRealUnit) continue;
      const revealed = revealChikatiloImmediately(nextState, chikatilo.id);
      nextState = revealed.state;
      nextEvents.push(...revealed.events);
      changed = changed || revealed.events.length > 0;
    }

    for (const event of [...nextEvents]) {
      if (event.type !== "stealthRevealed" || processedChikatiloReveals.has(event.unitId)) {
        continue;
      }
      const chikatilo = nextState.units[event.unitId];
      if (!chikatilo || chikatilo.heroId !== HERO_CHIKATILO_ID) continue;
      processedChikatiloReveals.add(event.unitId);
      const tokenId = chikatilo.chikatiloFalseTrailTokenId;
      const token = tokenId ? nextState.units[tokenId] : undefined;
      if (!token?.isAlive || !token.position) continue;

      const explosion = applyFalseTrailExplosionImmediately(nextState, token, rng);
      nextState = explosion.state;
      nextEvents.push(...explosion.events);
      changed = changed || explosion.events.length > 0;
    }
  }

  return { state: nextState, events: nextEvents };
}
