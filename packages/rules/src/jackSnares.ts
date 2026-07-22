import { ABILITY_JACK_RIPPER_COVERING_TRACKS, ABILITY_JACK_RIPPER_SNARES } from "./abilities";
import { chebyshev, coordsEqual } from "./board";
import { requestRoll } from "./core";
import type { ApplyResult, Coord, GameEvent, GameState, JackTrapMarker, UnitState } from "./model";
import type { RNG } from "./rng";
import { rollD6 } from "./rng";
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

function explodeTrap(
  state: GameState,
  jack: UnitState,
  trap: JackTrapMarker,
  rng: RNG,
): { state: GameState; events: GameEvent[] } {
  const affected = Object.values(state.units)
    .filter(
      (unit) =>
        unit.isAlive &&
        !!unit.position &&
        chebyshev(unit.position, trap.position) <= 1,
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const units = { ...state.units };
  const events: GameEvent[] = [
    {
      type: "abilityUsed",
      unitId: jack.id,
      abilityId: ABILITY_JACK_RIPPER_COVERING_TRACKS,
    },
  ];
  const rollsByUnitId: Record<string, number> = {};
  const damageByUnitId: Record<string, number> = {};
  const damagedUnitIds: string[] = [];

  for (const targetBefore of affected) {
    const roll = rollD6(rng);
    rollsByUnitId[targetBefore.id] = roll;
    if (roll >= 5) continue;

    const hp = Math.max(0, targetBefore.hp - 1);
    const deathPosition = targetBefore.position ? { ...targetBefore.position } : null;
    let target: UnitState = { ...targetBefore, hp };
    damageByUnitId[target.id] = 1;
    damagedUnitIds.push(target.id);
    if (hp <= 0) {
      target = { ...target, isAlive: false, position: null };
      events.push({ type: "unitDied", unitId: target.id, killerId: jack.id });
      const rebirth = applyGriffithFemtoRebirth(target, deathPosition);
      if (rebirth.transformed) {
        target = rebirth.unit;
        events.push(...rebirth.events);
      }
    }
    units[target.id] = target;
  }

  events.push({
    type: "aoeResolved",
    sourceUnitId: jack.id,
    casterId: jack.id,
    abilityId: ABILITY_JACK_RIPPER_COVERING_TRACKS,
    center: { ...trap.position },
    radius: 1,
    affectedUnitIds: affected.map((unit) => unit.id),
    revealedUnitIds: [],
    damagedUnitIds,
    damageByUnitId,
    rollsByUnitId,
  });

  const activeJack = units[jack.id];
  return {
    state: {
      ...state,
      activeUnitId: activeJack?.isAlive ? state.activeUnitId : null,
      pendingMove:
        state.pendingMove?.unitId === jack.id && !activeJack?.isAlive
          ? null
          : state.pendingMove,
      units,
    },
    events,
  };
}

export function applyJackTrapPlacement(
  state: GameState,
  unit: UnitState,
  position: Coord,
  explodePosition: Coord | null,
  rng: RNG,
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

  let nextState = state;
  let events: GameEvent[] = [];
  if (owned.length === MAX_JACK_SNARES) {
    const selected = owned.find((trap) => coordsEqual(trap.position, explodePosition!));
    if (!selected) return { state, events: [] };
    const exploded = explodeTrap(
      { ...state, jackTraps: traps.filter((trap) => trap.id !== selected.id) },
      unit,
      selected,
      rng,
    );
    nextState = exploded.state;
    events = exploded.events;
  } else if (explodePosition) {
    return { state, events: [] };
  }

  const currentJack = nextState.units[unit.id] ?? unit;
  const updatedJack = { ...currentJack, jackTrapPlacedTurnNumber: state.turnNumber };
  const created = createTrap(nextState, unit, position);
  return {
    state: {
      ...nextState,
      units: { ...nextState.units, [updatedJack.id]: updatedJack },
      jackTraps: [...(nextState.jackTraps ?? []), created.marker],
      jackTrapCounter: created.counter,
    },
    events: [
      ...events,
      { type: "abilityUsed", unitId: unit.id, abilityId: ABILITY_JACK_RIPPER_SNARES },
    ],
  };
}
