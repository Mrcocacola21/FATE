import type { ApplyResult, Coord, GameEvent, GameState, PendingRoll, UnitState } from "../../model";
import type { RNG } from "../../rng";
import { ALL_DIRS, chebyshev, coordsEqual, isCellOccupied } from "../../board";
import { clearPendingRoll, requestRoll } from "../../core";
import { addCharges, getCharges, setCharges } from "../../abilities";
import * as ids from "../../abilities/constants";
import {
  HERO_DON_KIHOTE_ID,
  HERO_DUOLINGO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_JACK_RIPPER_ID,
  HERO_KANEKI_ID,
  HERO_LUCHE_ID,
  HERO_ZORO_ID,
} from "../../heroes";
import { queueHeroAbilityAttacks as queueNewHeroAttacks } from "../shared";
import { canJackTrapTriggerForTarget, cleanupJackTrapsForDeaths } from "../../jackSnares";

function chargeEvent(unit: UnitState, abilityId: string, delta: number): GameEvent {
  return {
    type: "chargesUpdated",
    unitId: unit.id,
    deltas: { [abilityId]: delta },
    now: { [abilityId]: getCharges(unit, abilityId) },
  };
}

function updateUnit(state: GameState, unit: UnitState): GameState {
  return { ...state, units: { ...state.units, [unit.id]: unit } };
}

function requestMadDelusionIfReady(state: GameState): ApplyResult {
  if (state.pendingRoll) return { state, events: [] };
  const don = Object.values(state.units).find(
    (unit) => unit.heroId === HERO_DON_KIHOTE_ID && unit.donMadDelusionPending && unit.position
  );
  if (!don) return { state, events: [] };
  return requestRoll(
    state,
    don.owner,
    "donMadDelusionDirection",
    {
      abilityId: ids.ABILITY_DON_KIHOTE_MADNESS,
      unitId: don.id,
      origin: don.donMadDelusionOrigin ?? don.position,
      options: ALL_DIRS,
    },
    don.id
  );
}

function finishDonMadnessDeath(state: GameState, don: UnitState): GameState {
  const nextState = updateUnit(state, {
    ...don,
    isAlive: false,
    position: null,
    donMadDelusionPending: false,
    donMadDelusionOrigin: undefined,
  });
  return {
    ...nextState,
    activeUnitId: nextState.activeUnitId === don.id ? null : nextState.activeUnitId,
    pendingMove:
      nextState.pendingMove?.unitId === don.id ? null : nextState.pendingMove,
  };
}

function getDonReactionOptions(state: GameState, don: UnitState): Coord[] {
  if (!don.position) return [];
  return ALL_DIRS
    .map((dir) => ({ col: don.position!.col + dir.col, row: don.position!.row + dir.row }))
    .filter(
      (cell) =>
        cell.col >= 0 &&
        cell.row >= 0 &&
        cell.col < state.boardSize &&
        cell.row < state.boardSize &&
        !isCellOccupied(state, cell),
    );
}

function requestDonReactionIfReady(state: GameState): ApplyResult {
  if (state.pendingRoll) return { state, events: [] };
  const don = Object.values(state.units).find(
    (unit) =>
      unit.heroId === HERO_DON_KIHOTE_ID &&
      unit.isAlive &&
      unit.donSorrowfulReactionAvailable &&
      !!unit.position,
  );
  if (!don) return { state, events: [] };
  const options = getDonReactionOptions(state, don);
  if (options.length === 0) {
    return { state: updateUnit(state, { ...don, donSorrowfulReactionAvailable: false }), events: [] };
  }
  return requestRoll(
    state,
    don.owner,
    "donSorrowfulMoveChoice",
    { unitId: don.id, options, optional: true },
    don.id,
  );
}

export function applyNewBatchPostAction(
  prevState: GameState,
  state: GameState,
  events: GameEvent[],
  _rng: RNG
): ApplyResult {
  let nextState = cleanupJackTrapsForDeaths(state, events);
  const nextEvents = [...events];

  for (const event of events) {
    if (event.type === "attackResolved") {
      let attacker = nextState.units[event.attackerId];
      let defender = nextState.units[event.defenderId];
      if (attacker?.heroId === HERO_DUOLINGO_ID) {
        const hasMoreInBatch = (nextState.pendingCombatQueue ?? []).some(
          (entry) => entry.attackerId === attacker!.id,
        );
        if (event.hit) {
          attacker = {
            ...attacker,
            duolingoAttackBatchHit: hasMoreInBatch,
            duolingoHitTargetsThisTurn: Array.from(
              new Set([...(attacker.duolingoHitTargetsThisTurn ?? []), event.defenderId])
            ),
          };
        } else if (!hasMoreInBatch && !attacker.duolingoAttackBatchHit) {
          attacker = addCharges(attacker, ids.ABILITY_DUOLINGO_SKIP_CLASSES, 1);
          nextEvents.push(chargeEvent(attacker, ids.ABILITY_DUOLINGO_SKIP_CLASSES, 1));
          if (getCharges(attacker, ids.ABILITY_DUOLINGO_SKIP_CLASSES) >= 12) {
            attacker = { ...attacker, duolingoBerserkerUnlocked: true };
            if (attacker.charges[ids.ABILITY_BERSERK_AUTO_DEFENSE] === undefined) {
              attacker = setCharges(attacker, ids.ABILITY_BERSERK_AUTO_DEFENSE, 0);
            }
          }
        } else if (!hasMoreInBatch) {
          attacker = { ...attacker, duolingoAttackBatchHit: false };
        }
        nextState = updateUnit(nextState, attacker);
      }
      if (attacker?.heroId === HERO_KANEKI_ID && event.hit) {
        attacker = addCharges(attacker, ids.ABILITY_KANEKI_RC_CELLS, 1);
        if (getCharges(attacker, ids.ABILITY_KANEKI_RC_CELLS) > 5) {
          attacker = { ...attacker, kanekiCentipedeUnlocked: true };
        }
        nextState = updateUnit(nextState, attacker);
        nextEvents.push(chargeEvent(attacker, ids.ABILITY_KANEKI_RC_CELLS, 1));
      }
      if (attacker?.heroId === HERO_ZORO_ID && event.hit) {
        attacker = addCharges(attacker, ids.ABILITY_ZORO_DETERMINATION, 1);
        nextState = updateUnit(nextState, attacker);
        nextEvents.push(chargeEvent(attacker, ids.ABILITY_ZORO_DETERMINATION, 1));
      }
      if (attacker?.heroId === HERO_JACK_RIPPER_ID && event.damage > 0) {
        attacker = {
          ...attacker,
          jackKnownHpByTarget: {
            ...(attacker.jackKnownHpByTarget ?? {}),
            [event.defenderId]: event.defenderHpAfter,
          },
        };
        nextState = updateUnit(nextState, attacker);
      }
      if (defender?.heroId === HERO_LUCHE_ID && !event.hit) {
        defender = addCharges(defender, ids.ABILITY_LUCHE_SUN_GLORY, 1);
        nextState = updateUnit(nextState, defender);
        nextEvents.push(chargeEvent(defender, ids.ABILITY_LUCHE_SUN_GLORY, 1));
      }
      if (
        defender?.heroId === HERO_DON_KIHOTE_ID &&
        event.hit &&
        event.damage > 0 &&
        defender.isAlive &&
        defender.hp > 0 &&
        !defender.donMadDelusionPending &&
        attacker &&
        attacker.owner !== defender.owner
      ) {
        defender = { ...defender, donSorrowfulReactionAvailable: true };
        nextState = updateUnit(nextState, defender);
      }
    }

    if (event.type === "unitDied") {
      let killer = event.killerId ? nextState.units[event.killerId] : undefined;
      if (killer?.heroId === HERO_KANEKI_ID) {
        const victimBefore = prevState.units[event.unitId];
        if (victimBefore?.heroId !== HERO_FALSE_TRAIL_TOKEN_ID) {
          killer = addCharges(killer, ids.ABILITY_KANEKI_RC_CELLS, 3);
          if (getCharges(killer, ids.ABILITY_KANEKI_RC_CELLS) > 5) {
            killer = { ...killer, kanekiCentipedeUnlocked: true };
          }
          nextState = updateUnit(nextState, killer);
          nextEvents.push(chargeEvent(killer, ids.ABILITY_KANEKI_RC_CELLS, 3));
        }
      }
      const dead = nextState.units[event.unitId];
      const before = prevState.units[event.unitId];
      if (dead?.heroId === HERO_DON_KIHOTE_ID && before?.position && !dead.donMadDelusionPending) {
        const pendingDon: UnitState = {
          ...dead,
          isAlive: true,
          hp: 0,
          position: { ...before.position },
          donMadDelusionPending: true,
          donMadDelusionOrigin: { ...before.position },
        };
        nextState = updateUnit(nextState, pendingDon);
        nextEvents.push(abilityUsed(pendingDon.id, ids.ABILITY_DON_KIHOTE_MADNESS));
      }
    }

    if (event.type === "unitMoved") {
      const moved = nextState.units[event.unitId];
      const trapIndex = (nextState.jackTraps ?? []).findIndex(
        (trap) =>
          canJackTrapTriggerForTarget(trap, event.unitId) &&
          coordsEqual(trap.position, event.to),
      );
      if (moved && trapIndex >= 0) {
        const traps = [...(nextState.jackTraps ?? [])];
        traps[trapIndex] = {
          ...traps[trapIndex],
          isRevealed: true,
          trappedUnitId: moved.id,
          triggeredTargetIds: Array.from(
            new Set([...(traps[trapIndex].triggeredTargetIds ?? []), moved.id]),
          ),
        };
        nextState = {
          ...nextState,
          jackTraps: traps,
          units: {
            ...nextState.units,
            [moved.id]: { ...moved, immobilizedUntilOwnTurnStart: true },
          },
        };
      }
    }

    if (event.type === "aoeResolved" && event.abilityId === ids.ABILITY_DON_KIHOTE_MADNESS) {
      const don = nextState.units[event.sourceUnitId];
      if (don?.donMadDelusionPending) {
        nextState = finishDonMadnessDeath(nextState, don);
      }
    }
  }

  const requested = requestMadDelusionIfReady(nextState);
  const donReaction = requestDonReactionIfReady(requested.state);
  return {
    state: donReaction.state,
    events: [...nextEvents, ...requested.events, ...donReaction.events],
  };
}

export function resolveDonSorrowfulMove(
  state: GameState,
  pending: PendingRoll,
  choice: unknown,
): ApplyResult {
  const unitId = typeof pending.context.unitId === "string" ? pending.context.unitId : "";
  const don = state.units[unitId];
  if (!don || don.heroId !== HERO_DON_KIHOTE_ID || !don.donSorrowfulReactionAvailable || !don.position) {
    return { state: clearPendingRoll(state), events: [] };
  }
  if (choice === "skip") {
    return {
      state: updateUnit(clearPendingRoll(state), { ...don, donSorrowfulReactionAvailable: false }),
      events: [],
    };
  }
  const data = choice && typeof choice === "object"
    ? choice as { type?: unknown; destination?: unknown }
    : null;
  const raw = data?.destination as { col?: unknown; row?: unknown } | undefined;
  const destination = raw && Number.isInteger(raw.col) && Number.isInteger(raw.row)
    ? { col: raw.col as number, row: raw.row as number }
    : null;
  const options = getDonReactionOptions(state, don);
  if (
    data?.type !== "donSorrowfulMove" ||
    !destination ||
    !options.some((option) => coordsEqual(option, destination))
  ) {
    return { state, events: [] };
  }
  const moved = { ...don, position: destination, donSorrowfulReactionAvailable: false };
  return {
    state: updateUnit(clearPendingRoll(state), moved),
    events: [
      abilityUsed(don.id, ids.ABILITY_DON_KIHOTE_SORROWFUL_COUNTENANCE),
      { type: "unitMoved", unitId: don.id, from: don.position, to: destination },
    ],
  };
}

export function resolveDonMadDelusionDirection(
  state: GameState,
  pending: PendingRoll,
  choice: unknown
): ApplyResult {
  const data = choice && typeof choice === "object" ? choice as { type?: unknown; direction?: unknown } : {};
  const directionRaw = data.direction as { col?: unknown; row?: unknown } | undefined;
  const direction: Coord | null =
    data.type === "donMadDelusionDirection" &&
    directionRaw && Number.isInteger(directionRaw.col) && Number.isInteger(directionRaw.row)
      ? { col: directionRaw.col as number, row: directionRaw.row as number }
      : null;
  if (!direction || !ALL_DIRS.some((item) => coordsEqual(item, direction))) return { state, events: [] };
  const unitId = typeof pending.context.unitId === "string" ? pending.context.unitId : "";
  const don = state.units[unitId];
  if (!don || !don.donMadDelusionPending || !don.position) return { state: clearPendingRoll(state), events: [] };
  const targetIds: string[] = [];
  let cell = { col: don.position.col + direction.col, row: don.position.row + direction.row };
  while (cell.col >= 0 && cell.row >= 0 && cell.col < state.boardSize && cell.row < state.boardSize) {
    const target = Object.values(state.units).find((candidate) => candidate.isAlive && candidate.position && coordsEqual(candidate.position, cell));
    if (target && target.owner !== don.owner) targetIds.push(target.id);
    cell = { col: cell.col + direction.col, row: cell.row + direction.row };
  }
  const base = clearPendingRoll(state);
  if (targetIds.length === 0) {
    return {
      state: finishDonMadnessDeath(base, don),
      events: [],
    };
  }
  const queued = queueNewHeroAttacks(base, don, ids.ABILITY_DON_KIHOTE_MADNESS, targetIds, { damageBonus: 1, center: don.position });
  return queued;
}

export function resolveDonWindmillsReposition(
  state: GameState,
  pending: PendingRoll,
  choice: unknown,
): ApplyResult {
  const context = pending.context as {
    donId?: unknown;
    giantId?: unknown;
    affectedIds?: unknown;
    index?: unknown;
    pathCells?: unknown;
    center?: unknown;
  };
  const donId = typeof context.donId === "string" ? context.donId : "";
  const affectedIds = Array.isArray(context.affectedIds)
    ? context.affectedIds.filter((id): id is string => typeof id === "string")
    : [];
  const index = typeof context.index === "number" ? context.index : 0;
  const pathCells = Array.isArray(context.pathCells)
    ? context.pathCells.filter(
        (cell): cell is Coord =>
          !!cell &&
          typeof cell === "object" &&
          Number.isInteger((cell as Coord).col) &&
          Number.isInteger((cell as Coord).row),
      )
    : [];
  const don = state.units[donId];
  const target = state.units[affectedIds[index] ?? ""];
  if (!don || !target) return { state: clearPendingRoll(state), events: [] };

  let nextState = state;
  let repositionEvent: GameEvent | null = null;
  const data = choice && typeof choice === "object"
    ? (choice as { type?: unknown; destination?: unknown })
    : null;
  if (data?.type === "donWindmillsReposition" && target.isAlive && target.position) {
    const raw = data.destination as { col?: unknown; row?: unknown } | undefined;
    const destination = raw && Number.isInteger(raw.col) && Number.isInteger(raw.row)
      ? { col: raw.col as number, row: raw.row as number }
      : null;
    const legal =
      destination &&
      chebyshev(target.position, destination) === 1 &&
      pathCells.some((cell) => chebyshev(cell, destination) <= 1) &&
      destination.col >= 0 &&
      destination.row >= 0 &&
      destination.col < state.boardSize &&
      destination.row < state.boardSize &&
      !Object.values(state.units).some(
        (unit) => unit.isAlive && unit.position && coordsEqual(unit.position, destination),
      );
    if (!legal || !destination) return { state, events: [] };
    const from = target.position;
    nextState = updateUnit(state, { ...target, position: destination });
    repositionEvent = { type: "unitMoved", unitId: target.id, from, to: destination };
  } else {
    return { state, events: [] };
  }

  let nextIndex = index + 1;
  while (nextIndex < affectedIds.length) {
    const nextTarget = nextState.units[affectedIds[nextIndex]];
    const options = nextTarget?.position
      ? ALL_DIRS.map((dir) => ({ col: nextTarget.position!.col + dir.col, row: nextTarget.position!.row + dir.row }))
          .filter((cell) => cell.col >= 0 && cell.row >= 0 && cell.col < nextState.boardSize && cell.row < nextState.boardSize)
          .filter((cell) => pathCells.some((pathCell) => chebyshev(pathCell, cell) <= 1))
          .filter((cell) => !Object.values(nextState.units).some((unit) => unit.isAlive && unit.position && coordsEqual(unit.position, cell)))
      : [];
    if (options.length > 0) {
      const requested = requestRoll(
        clearPendingRoll(nextState),
        nextTarget?.owner ?? pending.player,
        "donWindmillsRepositionChoice",
        { ...context, index: nextIndex, options },
        don.id,
      );
      return {
        state: requested.state,
        events: [...(repositionEvent ? [repositionEvent] : []), ...requested.events],
      };
    }
    nextIndex += 1;
  }
  const base = clearPendingRoll(nextState);
  const giantId = typeof context.giantId === "string" ? context.giantId : "";
  const aliveTargets = giantId && base.units[giantId]?.isAlive ? [giantId] : [];
  const queued = queueNewHeroAttacks(
    base,
    base.units[don.id],
    ids.ABILITY_DON_KIHOTE_WINDMILLS,
    aliveTargets,
    { center: context.center as Coord | undefined },
  );
  return {
    state: queued.state,
    events: [...(repositionEvent ? [repositionEvent] : []), ...queued.events],
  };
}

function abilityUsed(unitId: string, abilityId: string): GameEvent {
  return { type: "abilityUsed", unitId, abilityId };
}
