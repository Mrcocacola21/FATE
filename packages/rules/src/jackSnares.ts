import { resolveUnitDeath } from "./death";
import { ABILITY_JACK_RIPPER_COVERING_TRACKS, ABILITY_JACK_RIPPER_SNARES } from "./abilities";
import { chebyshev, coordsEqual } from "./board";
import { clearPendingRoll, requestRoll } from "./core";
import type { ApplyResult, Coord, GameEvent, GameState, JackTrapMarker, PendingRoll, UnitState } from "./model";
import type { RNG } from "./rng";
import { rollManualD6 } from "./pendingRoll/manualRoll";
import { applyGriffithFemtoRebirth } from "./actions/heroes/griffith";

const MAX_JACK_SNARES = 5;

export function canJackTrapTriggerForTarget(
  trap: JackTrapMarker,
  targetId: string,
): boolean {
  return !trap.trappedUnitId && !(trap.triggeredTargetIds ?? []).includes(targetId);
}

export function cleanupJackTrapsForDeaths(
  state: GameState,
  events: readonly GameEvent[] = [],
): GameState {
  const deathIds = new Set(
    events.flatMap((event) => (event.type === "unitDied" ? [event.unitId] : [])),
  );
  const traps = state.jackTraps ?? [];
  const filtered = traps.filter((trap) => {
    if (!trap.trappedUnitId) return true;
    if (deathIds.has(trap.trappedUnitId)) return false;
    return state.units[trap.trappedUnitId]?.isAlive === true;
  });
  return filtered.length === traps.length ? state : { ...state, jackTraps: filtered };
}

function createTrap(
  state: GameState,
  unit: UnitState,
  position: Coord,
): { marker: JackTrapMarker; counter: number } {
  const existingIds = new Set((state.jackTraps ?? []).map((trap) => trap.id));
  let counter = state.jackTrapCounter ?? 0;
  let id = "";
  do {
    counter += 1;
    id = `jack-snare-${unit.owner}-${counter}`;
  } while (existingIds.has(id));
  return {
    counter,
    marker: {
      id,
      sourceUnitId: unit.id,
      owner: unit.owner,
      position: { ...position },
      isRevealed: false,
      triggeredTargetIds: [],
    },
  };
}

interface JackTrapExplosionSaveContext {
  sourceUnitId: string;
  abilityId: string;
  center: Coord;
  targetsQueue: string[];
  currentTargetIndex: number;
  targetUnitId: string;
  damagedUnitIds: string[];
  damageByUnitId: Record<string, number>;
  rollsByUnitId: Record<string, number>;
}

function explosionResolvedEvent(ctx: JackTrapExplosionSaveContext): GameEvent {
  return {
    type: "aoeResolved",
    sourceUnitId: ctx.sourceUnitId,
    casterId: ctx.sourceUnitId,
    abilityId: ABILITY_JACK_RIPPER_COVERING_TRACKS,
    center: { ...ctx.center },
    radius: 1,
    affectedUnitIds: [...ctx.targetsQueue],
    revealedUnitIds: [],
    damagedUnitIds: [...ctx.damagedUnitIds],
    damageByUnitId: { ...ctx.damageByUnitId },
    rollsByUnitId: { ...ctx.rollsByUnitId },
  };
}

function nextLivingTargetIndex(state: GameState, queue: string[], from: number): number {
  let index = from;
  while (index < queue.length) {
    const unit = state.units[queue[index]];
    if (unit?.isAlive && unit.position) return index;
    index += 1;
  }
  return index;
}

/** Asks the owner of the next creature in the blast to roll its 1d6 save, or finishes the blast. */
function continueTrapExplosion(
  state: GameState,
  ctx: JackTrapExplosionSaveContext,
  events: GameEvent[],
): ApplyResult {
  const index = nextLivingTargetIndex(state, ctx.targetsQueue, ctx.currentTargetIndex);
  const target = state.units[ctx.targetsQueue[index] ?? ""];
  if (target) {
    const nextCtx: JackTrapExplosionSaveContext = {
      ...ctx,
      currentTargetIndex: index,
      targetUnitId: target.id,
    };
    const requested = requestRoll(
      clearPendingRoll(state),
      target.owner,
      "jackTrapExplosionSave",
      nextCtx as unknown as Record<string, unknown>,
      target.id,
    );
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  const jack = state.units[ctx.sourceUnitId];
  const finished = clearPendingRoll(state);
  return {
    state: {
      ...finished,
      activeUnitId: jack?.isAlive ? finished.activeUnitId : null,
      pendingMove:
        finished.pendingMove?.unitId === ctx.sourceUnitId && !jack?.isAlive
          ? null
          : finished.pendingMove,
    },
    events: [...events, explosionResolvedEvent(ctx)],
  };
}

function explodeTrap(state: GameState, jack: UnitState, trap: JackTrapMarker): ApplyResult {
  const affected = Object.values(state.units)
    .filter(
      (unit) =>
        unit.isAlive &&
        !!unit.position &&
        chebyshev(unit.position, trap.position) <= 1,
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((unit) => unit.id);
  const ctx: JackTrapExplosionSaveContext = {
    sourceUnitId: jack.id,
    abilityId: ABILITY_JACK_RIPPER_COVERING_TRACKS,
    center: { ...trap.position },
    targetsQueue: affected,
    currentTargetIndex: 0,
    targetUnitId: affected[0] ?? "",
    damagedUnitIds: [],
    damageByUnitId: {},
    rollsByUnitId: {},
  };
  return continueTrapExplosion(state, ctx, [
    {
      type: "abilityUsed",
      unitId: jack.id,
      abilityId: ABILITY_JACK_RIPPER_COVERING_TRACKS,
    },
  ]);
}

/** One creature's Covering Tracks save: on 1-4 it takes 1 damage, on 5-6 it avoids it. */
export function resolveJackTrapExplosionSave(
  state: GameState,
  pending: PendingRoll,
  rng: RNG,
): ApplyResult {
  const ctx = pending.context as unknown as JackTrapExplosionSaveContext;
  const targetBefore = state.units[ctx.targetUnitId];
  if (!targetBefore?.isAlive || !targetBefore.position) {
    return continueTrapExplosion(state, { ...ctx, currentTargetIndex: ctx.currentTargetIndex + 1 }, []);
  }

  const roll = rollManualD6(rng, targetBefore.id);
  const events: GameEvent[] = [];
  const nextCtx: JackTrapExplosionSaveContext = {
    ...ctx,
    currentTargetIndex: ctx.currentTargetIndex + 1,
    rollsByUnitId: { ...ctx.rollsByUnitId, [targetBefore.id]: roll },
  };
  if (roll >= 5) {
    return continueTrapExplosion(state, nextCtx, events);
  }

  const hp = Math.max(0, targetBefore.hp - 1);
  const deathPosition = { ...targetBefore.position };
  let target: UnitState = { ...targetBefore, hp };
  if (hp <= 0) {
    target = resolveUnitDeath(target, ctx.sourceUnitId, events);
    const rebirth = applyGriffithFemtoRebirth(target, deathPosition);
    if (rebirth.transformed) {
      target = rebirth.unit;
      events.push(...rebirth.events);
    }
  }
  return continueTrapExplosion(
    { ...state, units: { ...state.units, [target.id]: target } },
    {
      ...nextCtx,
      damagedUnitIds: [...nextCtx.damagedUnitIds, target.id],
      damageByUnitId: { ...nextCtx.damageByUnitId, [target.id]: 1 },
    },
    events,
  );
}

export function applyJackTrapPlacement(
  state: GameState,
  unit: UnitState,
  position: Coord,
  explodePosition: Coord | null,
): ApplyResult {
  if (unit.jackTrapPlacedTurnNumber === state.turnNumber) return { state, events: [] };
  const traps = state.jackTraps ?? [];
  const owned = traps.filter((trap) => trap.sourceUnitId === unit.id);
  if (owned.some((trap) => coordsEqual(trap.position, position))) {
    return { state, events: [] };
  }
  if (owned.length > MAX_JACK_SNARES) {
    return { state, events: [], rejectionReason: "jack_snare_limit_invalid" };
  }

  if (owned.length === MAX_JACK_SNARES && !explodePosition) {
    return requestRoll(
      state,
      unit.owner,
      "chargedImpulseTargetChoice",
      {
        unitId: unit.id,
        abilityId: ABILITY_JACK_RIPPER_SNARES,
        step: "coveringTracks",
        placement: { ...position },
        options: owned.map((trap) => ({ ...trap.position })),
        prompt: "Covering Tracks: choose a snare to explode before placing a new one.",
      },
      unit.id,
    );
  }

  let selected: JackTrapMarker | undefined;
  if (owned.length === MAX_JACK_SNARES) {
    selected = owned.find((trap) => coordsEqual(trap.position, explodePosition!));
    if (!selected) return { state, events: [] };
  } else if (explodePosition) {
    return { state, events: [] };
  }

  // Commit the new snare first so the explosion's save prompts never carry its secret cell.
  const remaining = selected ? traps.filter((trap) => trap.id !== selected.id) : traps;
  const baseState: GameState = { ...state, jackTraps: remaining };
  const updatedJack = { ...unit, jackTrapPlacedTurnNumber: state.turnNumber };
  const created = createTrap(baseState, unit, position);
  const placedState: GameState = {
    ...baseState,
    units: { ...baseState.units, [updatedJack.id]: updatedJack },
    jackTraps: [...remaining, created.marker],
    jackTrapCounter: created.counter,
  };
  const placedEvents: GameEvent[] = [
    { type: "abilityUsed", unitId: unit.id, abilityId: ABILITY_JACK_RIPPER_SNARES },
    { type: "snarePlaced", owner: unit.owner, sourceUnitId: unit.id, cell: { ...position }, abilityId: ABILITY_JACK_RIPPER_SNARES },
  ];
  if (!selected) return { state: placedState, events: placedEvents };

  const exploded = explodeTrap(placedState, updatedJack, selected);
  return { state: exploded.state, events: [...placedEvents, ...exploded.events] };
}
