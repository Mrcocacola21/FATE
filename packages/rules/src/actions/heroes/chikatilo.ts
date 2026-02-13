import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
  UnitState,
  DiceRoll,
} from "../../model";
import { coordToNotation, isInsideBoard, makeEmptyTurnEconomy } from "../../model";
import { chebyshev, getUnitAt } from "../../board";
import { getUnitDefinition } from "../../units";
import {
  ABILITY_CHIKATILO_ASSASSIN_MARK,
  ABILITY_CHIKATILO_DECOY,
  ABILITY_FALSE_TRAIL_EXPLOSION,
  getAbilitySpec,
  spendCharges,
} from "../../abilities";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { clearPendingRoll, requestRoll } from "../../shared/rollUtils";
import { evAbilityUsed, evUnitDied, evUnitPlaced } from "../../shared/events";
import { HERO_CHIKATILO_ID, HERO_FALSE_TRAIL_TOKEN_ID } from "../../heroes";
import type { RNG } from "../../rng";
import { rollD6 } from "../../rng";

export function isChikatilo(unit: UnitState): boolean {
  return unit.heroId === HERO_CHIKATILO_ID;
}

export function isFalseTrailToken(unit: UnitState): boolean {
  return unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID;
}

function buildDiceRoll(base: number[], tieBreak: number[]): DiceRoll {
  const dice = [...base, ...tieBreak];
  const sum = dice.reduce((acc, v) => acc + v, 0);
  const isDouble = base.length >= 2 && base[0] === base[1];
  return { dice, sum, isDouble };
}

function rollContest(rng: RNG): {
  attackerRoll: DiceRoll;
  defenderRoll: DiceRoll;
  tieBreakDice?: { attacker: number[]; defender: number[] };
  hit: boolean;
} {
  const attackerBase = [rollD6(rng), rollD6(rng)];
  const defenderBase = [rollD6(rng), rollD6(rng)];
  let attackerSum = attackerBase[0] + attackerBase[1];
  let defenderSum = defenderBase[0] + defenderBase[1];
  const tieBreakAttacker: number[] = [];
  const tieBreakDefender: number[] = [];

  const maxTieBreak = 12;
  while (attackerSum === defenderSum && tieBreakAttacker.length < maxTieBreak) {
    const att = rollD6(rng);
    const def = rollD6(rng);
    tieBreakAttacker.push(att);
    tieBreakDefender.push(def);
    attackerSum += att;
    defenderSum += def;
  }

  const attackerRoll = buildDiceRoll(attackerBase, tieBreakAttacker);
  const defenderRoll = buildDiceRoll(defenderBase, tieBreakDefender);
  return {
    attackerRoll,
    defenderRoll,
    tieBreakDice:
      tieBreakAttacker.length > 0
        ? { attacker: tieBreakAttacker, defender: tieBreakDefender }
        : undefined,
    hit: attackerSum > defenderSum,
  };
}

function getEmptyCells(state: GameState): Coord[] {
  const cells: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const coord = { col, row };
      if (getUnitAt(state, coord)) continue;
      cells.push(coord);
    }
  }
  return cells;
}

function insertTokenBefore(queue: string[], tokenId: string, unitId: string): string[] {
  const filtered = queue.filter((id) => id !== tokenId);
  const index = filtered.indexOf(unitId);
  if (index < 0) {
    return [...filtered, tokenId];
  }
  return [...filtered.slice(0, index), tokenId, ...filtered.slice(index)];
}

function getFalseTrailTokenId(chikatilo: UnitState): string {
  return chikatilo.chikatiloFalseTrailTokenId ?? `falseTrail-${chikatilo.id}`;
}

function createFalseTrailToken(
  chikatilo: UnitState,
  position: Coord | null
): UnitState {
  const def = getUnitDefinition("assassin");
  return {
    id: getFalseTrailTokenId(chikatilo),
    owner: chikatilo.owner,
    class: "assassin",
    figureId: HERO_FALSE_TRAIL_TOKEN_ID,
    heroId: HERO_FALSE_TRAIL_TOKEN_ID,
    hp: def.maxHp,
    attack: def.baseAttack,
    position: position ? { ...position } : null,
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthAttemptedThisTurn: false,
    movementDisabledNextTurn: false,
    ownTurnsStarted: 0,
    turn: makeEmptyTurnEconomy(),
    charges: {},
    cooldowns: {},
    lastChargedTurn: undefined,
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    genghisKhanDiagonalMoveActive: false,
    genghisKhanDecreeMovePending: false,
    genghisKhanMongolChargeActive: false,
    genghisKhanAttackedThisTurn: [],
    genghisKhanAttackedLastTurn: [],
    isAlive: true,
  };
}

export function setupChikatiloFalseTrailForPlacement(
  state: GameState
): GameState {
  let units = { ...state.units };
  let changed = false;

  for (const unit of Object.values(state.units)) {
    if (!unit.isAlive || unit.heroId !== HERO_CHIKATILO_ID) continue;
    const tokenId = getFalseTrailTokenId(unit);
    if (!units[tokenId]) {
      units[tokenId] = createFalseTrailToken(unit, null);
      changed = true;
    }
    if (unit.chikatiloFalseTrailTokenId !== tokenId) {
      units[unit.id] = {
        ...unit,
        chikatiloFalseTrailTokenId: tokenId,
      };
      changed = true;
    }
  }

  if (!changed) return state;
  return { ...state, units };
}

function clearTokenReference(state: GameState, tokenId: string): GameState {
  const owner = Object.values(state.units).find(
    (unit) => unit.chikatiloFalseTrailTokenId === tokenId
  );
  if (!owner) return state;
  const updatedOwner: UnitState = {
    ...owner,
    chikatiloFalseTrailTokenId: undefined,
  };
  return {
    ...state,
    units: {
      ...state.units,
      [updatedOwner.id]: updatedOwner,
    },
  };
}

export function removeFalseTrailToken(
  state: GameState,
  tokenId: string
): { state: GameState; events: GameEvent[] } {
  const token = state.units[tokenId];
  if (!token) return { state, events: [] };
  if (!token.isAlive) {
    return { state: clearTokenReference(state, tokenId), events: [] };
  }
  const updatedToken: UnitState = {
    ...token,
    isAlive: false,
    position: null,
  };
  const nextState = clearTokenReference({
    ...state,
    units: {
      ...state.units,
      [updatedToken.id]: updatedToken,
    },
  }, tokenId);
  const events: GameEvent[] = [
    evUnitDied({ unitId: updatedToken.id, killerId: null }),
  ];
  return { state: nextState, events };
}

export function setupChikatiloFalseTrailAtBattleStart(
  state: GameState
): { state: GameState; events: GameEvent[]; placementQueue: string[] } {
  const chikatilos = Object.values(state.units)
    .filter((unit) =>
      unit.isAlive &&
      unit.position &&
      unit.heroId === HERO_CHIKATILO_ID
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  if (chikatilos.length === 0) {
    return { state, events: [], placementQueue: [] };
  }

  let nextState = state;
  let units = { ...state.units };
  let turnQueue = [...state.turnQueue];
  let turnOrder = [...state.turnOrder];
  let knowledge = {
    P1: { ...(state.knowledge?.P1 ?? {}) },
    P2: { ...(state.knowledge?.P2 ?? {}) },
  };
  let lastKnownPositions = {
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };
  const events: GameEvent[] = [];
  const placementQueue: string[] = [];

  for (const chikatilo of chikatilos) {
    if (!chikatilo.position) continue;
    const tokenId = getFalseTrailTokenId(chikatilo);
    if (units[tokenId]) {
      if (chikatilo.chikatiloFalseTrailTokenId !== tokenId) {
        units[chikatilo.id] = {
          ...chikatilo,
          chikatiloFalseTrailTokenId: tokenId,
        };
      }
      turnQueue = insertTokenBefore(turnQueue, tokenId, chikatilo.id);
      turnOrder = insertTokenBefore(turnOrder, tokenId, chikatilo.id);
      continue;
    }

    const token = createFalseTrailToken(chikatilo, chikatilo.position);
    units[token.id] = token;

    const def = getUnitDefinition("assassin");
    const updatedChikatilo: UnitState = {
      ...chikatilo,
      position: null,
      isStealthed: true,
      stealthTurnsLeft: def.maxStealthTurns ?? 3,
      chikatiloFalseTrailTokenId: token.id,
      chikatiloMarkedTargets: Array.isArray(chikatilo.chikatiloMarkedTargets)
        ? chikatilo.chikatiloMarkedTargets
        : [],
    };
    units[updatedChikatilo.id] = updatedChikatilo;

    turnQueue = insertTokenBefore(turnQueue, token.id, updatedChikatilo.id);
    turnOrder = insertTokenBefore(turnOrder, token.id, updatedChikatilo.id);

    const owner = updatedChikatilo.owner;
    const other: PlayerId = owner === "P1" ? "P2" : "P1";
    knowledge = {
      ...knowledge,
      [owner]: {
        ...knowledge[owner],
        [updatedChikatilo.id]: true,
        [token.id]: true,
      },
      [other]: {
        ...knowledge[other],
        [token.id]: true,
      },
    };
    delete knowledge[other][updatedChikatilo.id];
    delete lastKnownPositions.P1[updatedChikatilo.id];
    delete lastKnownPositions.P2[updatedChikatilo.id];

    events.push(evUnitPlaced({ unitId: token.id, position: token.position! }));
    placementQueue.push(updatedChikatilo.id);
  }

  nextState = {
    ...nextState,
    units,
    turnQueue,
    turnOrder,
    knowledge,
    lastKnownPositions,
    startingUnitId: turnQueue[0] ?? nextState.startingUnitId,
  };

  return { state: nextState, events, placementQueue };
}

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
  const requested = requestRoll(
    clearPendingRoll(state),
    unit.owner,
    "chikatiloFalseTrailPlacement",
    { chikatiloId: unit.id, owner: unit.owner, legalPositions, legalCells, queue },
    unit.id
  );

  return requested;
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

  const requested = requestRoll(
    clearPendingRoll(state),
    chikatilo.owner,
    "chikatiloFalseTrailRevealChoice",
    { chikatiloId, tokenId, queue },
    chikatilo.id
  );

  return requested;
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
      const revealed = revealChikatiloImmediately(nextState, owner.id, rng);
      nextState = revealed.state;
      nextEvents.push(...revealed.events);
    }

    const killerId = events.find(
      (e) => e.type === "unitDied" && e.unitId === tokenId
    ) as Extract<GameEvent, { type: "unitDied" }> | undefined;
    if (killerId?.killerId) {
      const trap = performFalseTrailTrap(
        nextState,
        tokenId,
        killerId.killerId,
        rng
      );
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
    const revealed = revealChikatiloImmediately(nextState, chikatilo.id, rng);
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
      const trap = performFalseTrailTrap(
        nextState,
        tokenId,
        reveal.revealerId,
        rng
      );
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

function revealChikatiloImmediately(
  state: GameState,
  chikatiloId: string,
  rng: RNG
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

  const nextWithKnown = {
    ...nextState,
    lastKnownPositions: clearedLastKnown,
  };

  const events: GameEvent[] = [
    {
      type: "stealthRevealed",
      unitId: updated.id,
      reason: "forcedDisplacement",
    },
  ];

  return { state: nextWithKnown, events };
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
