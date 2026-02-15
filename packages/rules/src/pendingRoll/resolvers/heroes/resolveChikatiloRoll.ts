import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../../../model";
import { isInsideBoard } from "../../../model";
import type { RNG } from "../../../rng";
import { getUnitAt } from "../../../board";
import { resolveAttack } from "../../../combat";
import { clearPendingRoll, requestRoll } from "../../../core";
import { evAoeResolved, evUnitPlaced } from "../../../core";
import { applyFalseTrailExplosion, removeFalseTrailToken, requestChikatiloPlacement, requestChikatiloRevealChoice } from "../../../actions/heroes/chikatilo";
import { isVlad } from "../../../actions/shared";
import { activateVladForest, maybeRequestIntimidate, requestVladStakesPlacement } from "../../../actions/heroes/vlad";
import type { IntimidateResume } from "../../../actions/types";
import { rollDice } from "../../utils/rollMath";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import { getUnitDefinition } from "../../../units";

type FalseTrailExplosionContext = {
  casterId: string;
  targetsQueue: string[];
  currentTargetIndex?: number;
  attackerDice?: number[];
  revealQueue?: string[];
};

function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

function insertAfter(queue: string[], anchorId: string | null, unitId: string): string[] {
  const filtered = queue.filter((id) => id !== unitId);
  if (!anchorId) {
    return [...filtered, unitId];
  }
  const anchorIndex = filtered.indexOf(anchorId);
  if (anchorIndex < 0) {
    return [...filtered, unitId];
  }
  return [
    ...filtered.slice(0, anchorIndex + 1),
    unitId,
    ...filtered.slice(anchorIndex + 1),
  ];
}

function isCoordLike(value: unknown): value is Coord {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { col?: unknown }).col === "number" &&
    typeof (value as { row?: unknown }).row === "number"
  );
}

function getLegalEmptyCells(state: GameState): Coord[] {
  const legal: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const coord = { col, row };
      if (getUnitAt(state, coord)) continue;
      legal.push(coord);
    }
  }
  return legal;
}

function maybeRequestVladBattleStartStakes(state: GameState): ApplyResult {
  const vladOwners = Array.from(
    new Set(
      Object.values(state.units)
        .filter((u) => u.isAlive && isVlad(u))
        .map((u) => u.owner)
    )
  ).sort();

  if (vladOwners.length === 0) {
    return { state, events: [] };
  }

  const [firstOwner, ...queue] = vladOwners;
  const ownedStakes = state.stakeMarkers.filter(
    (marker) => marker.owner === firstOwner
  ).length;
  const vladUnit = Object.values(state.units).find(
    (u) => u.isAlive && isVlad(u) && u.owner === firstOwner
  );

  if (ownedStakes >= 9 && vladUnit) {
    return activateVladForest(state, vladUnit.id, firstOwner);
  }

  return requestVladStakesPlacement(state, firstOwner, "battleStart", queue);
}

export function resolveChikatiloFalseTrailPlacement(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as {
    chikatiloId?: string;
    legalPositions?: Coord[];
    queue?: string[];
  };
  const chikatiloId = ctx.chikatiloId;
  if (!chikatiloId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const payload =
    choice && typeof choice === "object" && "type" in choice
      ? (choice as { type?: string; position?: Coord })
      : undefined;
  if (!payload || payload.type !== "chikatiloPlace" || !payload.position) {
    return { state, events: [] };
  }

  const pos = payload.position;
  if (!isInsideBoard(pos, state.boardSize)) {
    return { state, events: [] };
  }
  if (getUnitAt(state, pos)) {
    return { state, events: [] };
  }

  const rawLegal = Array.isArray(ctx.legalPositions) ? ctx.legalPositions : null;
  const legalPositions =
    rawLegal && rawLegal.length > 0 && rawLegal.every(isCoordLike)
      ? (rawLegal as Coord[])
      : getLegalEmptyCells(state);
  const legalSet = new Set(legalPositions.map(coordKey));
  if (!legalSet.has(coordKey(pos))) {
    return { state, events: [] };
  }

  const unit = state.units[chikatiloId];
  if (!unit || !unit.isAlive) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const def = getUnitDefinition("assassin");
  const updatedUnit: UnitState = {
    ...unit,
    position: { ...pos },
    isStealthed: true,
    stealthTurnsLeft: def.maxStealthTurns ?? 3,
  };

  const owner = updatedUnit.owner;
  const other = owner === "P1" ? "P2" : "P1";
  const nextKnowledge: GameState["knowledge"] = {
    ...state.knowledge,
    [owner]: { ...(state.knowledge?.[owner] ?? {}), [updatedUnit.id]: true },
    [other]: { ...(state.knowledge?.[other] ?? {}) },
  };
  delete nextKnowledge[other][updatedUnit.id];

  const clearedLastKnown = {
    ...state.lastKnownPositions,
    P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
    P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
  };
  delete clearedLastKnown.P1[updatedUnit.id];
  delete clearedLastKnown.P2[updatedUnit.id];

  const tokenId =
    updatedUnit.chikatiloFalseTrailTokenId ??
    Object.values(state.units).find(
      (u) =>
        u.isAlive &&
        u.owner === owner &&
        u.heroId === HERO_FALSE_TRAIL_TOKEN_ID
    )?.id ??
    null;

  let placementOrder = state.placementOrder;
  if (!placementOrder.includes(updatedUnit.id)) {
    placementOrder = insertAfter(placementOrder, tokenId, updatedUnit.id);
  }
  let turnOrder = state.turnOrder;
  if (!turnOrder.includes(updatedUnit.id)) {
    turnOrder = insertAfter(turnOrder, tokenId, updatedUnit.id);
  }
  let turnQueue = state.turnQueue;
  if (!turnQueue.includes(updatedUnit.id)) {
    turnQueue = insertAfter(turnQueue, tokenId, updatedUnit.id);
  }

  let nextState: GameState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
    knowledge: nextKnowledge,
    lastKnownPositions: clearedLastKnown,
    placementOrder,
    turnOrder,
    turnQueue,
  });

  let events: GameEvent[] = [
    evUnitPlaced({ unitId: updatedUnit.id, position: updatedUnit.position! }),
  ];

  const queue = Array.isArray(ctx.queue) ? ctx.queue : [];
  if (queue.length > 0) {
    const [nextId, ...rest] = queue;
    const requested = requestChikatiloPlacement(nextState, nextId, rest);
    nextState = requested.state;
    events = [...events, ...requested.events];
    return { state: nextState, events };
  }

  if (nextState.phase === "battle" && !nextState.pendingRoll) {
    const vlad = maybeRequestVladBattleStartStakes(nextState);
    if (vlad.state !== nextState || vlad.events.length > 0) {
      return { state: vlad.state, events: [...events, ...vlad.events] };
    }
  }

  return { state: nextState, events };
}

export function resolveChikatiloFalseTrailRevealChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const ctx = pending.context as {
    chikatiloId?: string;
    tokenId?: string;
    queue?: string[];
  };
  const tokenId = ctx.tokenId;
  if (!tokenId) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const selection =
    choice === "falseTrailExplode"
      ? "explode"
      : choice === "falseTrailRemove"
      ? "remove"
      : "remove";

  const cleared = clearPendingRoll(state);
  const queue = Array.isArray(ctx.queue) ? ctx.queue : [];

  if (selection === "explode") {
    const token = cleared.units[tokenId];
    if (!token || !token.isAlive) {
      if (queue.length > 0) {
        const [nextId, ...rest] = queue;
        const requested = requestChikatiloRevealChoice(cleared, nextId, rest);
        return { state: requested.state, events: requested.events };
      }
      return { state: cleared, events: [] };
    }
    return applyFalseTrailExplosion(cleared, token, {
      ignoreEconomy: true,
      revealQueue: queue,
    });
  }

  const removed = removeFalseTrailToken(cleared, tokenId);
  let nextState = removed.state;
  let events: GameEvent[] = [...removed.events];

  if (queue.length > 0) {
    const [nextId, ...rest] = queue;
    const requested = requestChikatiloRevealChoice(nextState, nextId, rest);
    nextState = requested.state;
    events = [...events, ...requested.events];
  }

  return { state: nextState, events };
}

function finalizeFalseTrailExplosion(
  state: GameState,
  context: FalseTrailExplosionContext,
  events: GameEvent[]
): ApplyResult {
  let nextState: GameState = clearPendingRoll(state);
  let nextEvents = [...events];

  if (nextState.pendingAoE) {
    const aoe = nextState.pendingAoE;
    nextState = { ...nextState, pendingAoE: null };
    nextEvents.push(
      evAoeResolved({
        sourceUnitId: aoe.casterId,
        abilityId: aoe.abilityId,
        casterId: aoe.casterId,
        center: aoe.center,
        radius: aoe.radius,
        affectedUnitIds: aoe.affectedUnitIds,
        revealedUnitIds: aoe.revealedUnitIds,
        damagedUnitIds: aoe.damagedUnitIds,
        damageByUnitId: aoe.damageByUnitId,
      })
    );
  }

  const removed = removeFalseTrailToken(nextState, context.casterId);
  nextState = removed.state;
  nextEvents = [...nextEvents, ...removed.events];

  const revealQueue = Array.isArray(context.revealQueue)
    ? context.revealQueue
    : [];
  if (revealQueue.length > 0) {
    const [nextId, ...rest] = revealQueue;
    const requested = requestChikatiloRevealChoice(nextState, nextId, rest);
    nextState = requested.state;
    nextEvents = [...nextEvents, ...requested.events];
  }

  return { state: nextState, events: nextEvents };
}

export function advanceFalseTrailExplosionQueue(
  state: GameState,
  context: FalseTrailExplosionContext,
  events: GameEvent[]
): ApplyResult {
  const baseState = clearPendingRoll(state);
  const targets = Array.isArray(context.targetsQueue)
    ? context.targetsQueue
    : [];
  let idx = context.currentTargetIndex ?? 0;

  while (idx < targets.length) {
    const targetId = targets[idx];
    const target = baseState.units[targetId];
    if (target && target.isAlive) {
      const nextCtx: FalseTrailExplosionContext = {
        ...context,
        currentTargetIndex: idx,
      };
      const requested = requestRoll(
        baseState,
        target.owner,
        "falseTrailExplosion_defenderRoll",
        nextCtx,
        target.id
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
    idx += 1;
  }

  return finalizeFalseTrailExplosion(baseState, context, events);
}

export function resolveFalseTrailExplosionAttackerRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as FalseTrailExplosionContext;
  const caster = ctx.casterId ? state.units[ctx.casterId] : null;
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = rollDice(rng, 2);
  const nextCtx: FalseTrailExplosionContext = {
    ...ctx,
    attackerDice,
    currentTargetIndex: ctx.currentTargetIndex ?? 0,
  };

  return advanceFalseTrailExplosionQueue(state, nextCtx, []);
}

export function resolveFalseTrailExplosionDefenderRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const ctx = pending.context as unknown as FalseTrailExplosionContext;
  const caster = ctx.casterId ? state.units[ctx.casterId] : null;
  if (!caster) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const attackerDice = Array.isArray(ctx.attackerDice) ? ctx.attackerDice : [];
  if (attackerDice.length < 2) {
    return { state: clearPendingRoll(state), events: [] };
  }

  const targets = Array.isArray(ctx.targetsQueue) ? ctx.targetsQueue : [];
  const idx = ctx.currentTargetIndex ?? 0;
  const targetId = targets[idx];
  if (!targetId) {
    return finalizeFalseTrailExplosion(clearPendingRoll(state), ctx, []);
  }

  const target = state.units[targetId];
  if (!target || !target.isAlive) {
    const nextCtx: FalseTrailExplosionContext = {
      ...ctx,
      currentTargetIndex: idx + 1,
    };
    return advanceFalseTrailExplosionQueue(state, nextCtx, []);
  }

  const defenderDice = rollDice(rng, 2);
  const { nextState, events } = resolveAttack(state, {
    attackerId: caster.id,
    defenderId: targetId,
    ignoreRange: true,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
    damageOverride: 1,
    ignoreBonuses: true,
    rolls: {
      attackerDice,
      defenderDice,
    },
  });

  let updatedState = nextState;
  let updatedEvents = [...events];
  const attackEvent = events.find(
    (e) =>
      e.type === "attackResolved" &&
      e.attackerId === caster.id &&
      e.defenderId === targetId
  );
  if (attackEvent && attackEvent.type === "attackResolved" && updatedState.pendingAoE) {
    let nextPendingAoE = updatedState.pendingAoE;
    if (attackEvent.damage > 0) {
      const damaged = nextPendingAoE.damagedUnitIds.includes(attackEvent.defenderId)
        ? nextPendingAoE.damagedUnitIds
        : [...nextPendingAoE.damagedUnitIds, attackEvent.defenderId];
      const damageByUnitId = {
        ...nextPendingAoE.damageByUnitId,
        [attackEvent.defenderId]: attackEvent.damage,
      };
      nextPendingAoE = {
        ...nextPendingAoE,
        damagedUnitIds: damaged,
        damageByUnitId,
      };
    }

    const revealedIds = events
      .filter((e) => e.type === "stealthRevealed")
      .map((e) => (e.type === "stealthRevealed" ? e.unitId : ""))
      .filter((id) => id.length > 0);
    if (revealedIds.length > 0) {
      const merged = Array.from(
        new Set([...nextPendingAoE.revealedUnitIds, ...revealedIds])
      );
      nextPendingAoE = { ...nextPendingAoE, revealedUnitIds: merged };
    }

    if (nextPendingAoE !== updatedState.pendingAoE) {
      updatedState = { ...updatedState, pendingAoE: nextPendingAoE };
    }
  }

  const nextCtx: FalseTrailExplosionContext = {
    ...ctx,
    currentTargetIndex: idx + 1,
    attackerDice,
  };

  const intimidateResume: IntimidateResume = {
    kind: "falseTrailExplosion",
    context: nextCtx as unknown as Record<string, unknown>,
  };
  const intimidate = maybeRequestIntimidate(
    updatedState,
    caster.id,
    targetId,
    updatedEvents,
    intimidateResume
  );
  if (intimidate.requested) {
    return { state: intimidate.state, events: intimidate.events };
  }

  return advanceFalseTrailExplosionQueue(updatedState, nextCtx, updatedEvents);
}


