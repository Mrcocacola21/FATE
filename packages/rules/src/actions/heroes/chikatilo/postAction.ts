import type {
  ApplyResult,
  GameEvent,
  GameState,
  UnitState,
} from "../../../model";
import { evUnitDied } from "../../../core";
import { HERO_CHIKATILO_ID, HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import type { RNG } from "../../../rng";
import { rollContest } from "./helpers";
import { requestChikatiloRevealChoice } from "./actions";

function revealChikatiloImmediately(
  state: GameState,
  chikatiloId: string
): { state: GameState; events: GameEvent[] } {
  const chikatilo = state.units[chikatiloId];
  if (!chikatilo || !chikatilo.isAlive || !chikatilo.position) {
    return { state, events: [] };
  }
  if (!chikatilo.isStealthed) {
    return { state, events: [] };
  }

  const updated: UnitState = {
    ...chikatilo,
    isStealthed: false,
    stealthTurnsLeft: 0,
  };

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
  rng: RNG
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
  rng: RNG
): ApplyResult {
  let nextState = state;
  let nextEvents = [...events];

  const diedTokens = events
    .filter((e) => e.type === "unitDied")
    .map((e) => (e.type === "unitDied" ? e.unitId : ""))
    .filter((id) => id.length > 0);

  for (const tokenId of diedTokens) {
    const tokenUnit = state.units[tokenId];
    const isToken =
      tokenUnit?.heroId === HERO_FALSE_TRAIL_TOKEN_ID ||
      Object.values(state.units).some(
        (unit) => unit.chikatiloFalseTrailTokenId === tokenId
      );
    if (!isToken) continue;

    const owner = Object.values(nextState.units).find(
      (unit) => unit.chikatiloFalseTrailTokenId === tokenId
    );
    if (owner && owner.isStealthed) {
      const revealed = revealChikatiloImmediately(nextState, owner.id);
      nextState = revealed.state;
      nextEvents.push(...revealed.events);
    }

    const killerId = events.find(
      (e) => e.type === "unitDied" && e.unitId === tokenId
    ) as Extract<GameEvent, { type: "unitDied" }> | undefined;
    if (killerId?.killerId) {
      const trap = performFalseTrailTrap(nextState, tokenId, killerId.killerId, rng);
      nextState = trap.state;
      nextEvents.push(...trap.events);
    }
  }

  const stealthedChikatilos = Object.values(nextState.units).filter(
    (unit) => unit.isAlive && unit.isStealthed && unit.heroId === HERO_CHIKATILO_ID
  );
  for (const chikatilo of stealthedChikatilos) {
    const otherRealUnits = Object.values(nextState.units).filter(
      (unit) =>
        unit.isAlive &&
        unit.id !== chikatilo.id &&
        unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
    );
    if (otherRealUnits.length > 0) continue;
    const revealed = revealChikatiloImmediately(nextState, chikatilo.id);
    nextState = revealed.state;
    nextEvents.push(...revealed.events);
  }

  const revealEvents = nextEvents.filter(
    (e) => e.type === "stealthRevealed"
  ) as Extract<GameEvent, { type: "stealthRevealed" }>[];

  for (const reveal of revealEvents) {
    const revealedUnit = nextState.units[reveal.unitId];
    if (!revealedUnit || revealedUnit.heroId !== HERO_CHIKATILO_ID) {
      continue;
    }

    const tokenId = revealedUnit.chikatiloFalseTrailTokenId;
    if (!tokenId) {
      continue;
    }
    const token = nextState.units[tokenId];
    if (!token || !token.isAlive) {
      continue;
    }

    if (reveal.revealerId) {
      const trap = performFalseTrailTrap(nextState, tokenId, reveal.revealerId, rng);
      nextState = trap.state;
      nextEvents.push(...trap.events);
    }
  }

  const pendingRevealChoices = revealEvents
    .map((e) => e.unitId)
    .filter((id) => {
      const unit = nextState.units[id];
      if (!unit || unit.heroId !== HERO_CHIKATILO_ID) return false;
      const tokenId = unit.chikatiloFalseTrailTokenId;
      const token = tokenId ? nextState.units[tokenId] : null;
      return !!token && token.isAlive;
    })
    .sort();

  if (pendingRevealChoices.length > 0 && !nextState.pendingRoll) {
    const first = pendingRevealChoices[0]!;
    const rest = pendingRevealChoices.slice(1);
    const requested = requestChikatiloRevealChoice(nextState, first, rest);
    nextState = requested.state;
    nextEvents = [...nextEvents, ...requested.events];
  }

  return { state: nextState, events: nextEvents };
}
