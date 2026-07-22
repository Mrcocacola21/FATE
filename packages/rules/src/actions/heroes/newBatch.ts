import type { ApplyResult, Coord, GameAction, GameEvent, GameState, UnitState } from "../../model";
import { ALL_DIRS, chebyshev, coordsEqual, getUnitAt, isCellOccupied } from "../../board";
import { isInsideBoard } from "../../model";
import { linePath } from "../../path";
import { canAttackTarget } from "../../combat";
import { canDirectlyTargetUnit } from "../../visibility";
import { revealStealthedInArea } from "../../stealth";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { requestRoll } from "../../core";
import { getAbilitySpec, getCharges, spendCharges } from "../../abilities";
import {
  getDuolingoPushDestinations,
  getLucheLightRayLine,
  getZoroOniGiriDestinations,
} from "../../abilities/newBatchTargeting";
import * as ids from "../../abilities/constants";
import {
  HERO_ARTEMIDA_ID,
  HERO_DON_KIHOTE_ID,
  HERO_DUOLINGO_ID,
  HERO_JACK_RIPPER_ID,
  HERO_KANEKI_ID,
  HERO_LUCHE_ID,
  HERO_ZORO_ID,
  getHeroDefinition,
} from "../../heroes";
import { getUnitDefinition } from "../../units";
import { queueHeroAbilityAttacks as queueNewHeroAttacks } from "../shared";
import { applyJackTrapPlacement } from "../../jackSnares";

type AbilityAction = Extract<GameAction, { type: "useAbility" }>;

function parseCoord(value: unknown): Coord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { col?: unknown; row?: unknown };
  if (!Number.isInteger(raw.col) || !Number.isInteger(raw.row)) return null;
  return { col: raw.col as number, row: raw.row as number };
}

function payload(action: AbilityAction): Record<string, unknown> {
  return action.payload && typeof action.payload === "object"
    ? (action.payload as Record<string, unknown>)
    : {};
}

function hasAbilityCounterSource(data: Record<string, unknown>, counterId: string): boolean {
  const source = data.source;
  return !!source && typeof source === "object" &&
    (source as { type?: unknown }).type === "abilityCounter" &&
    (source as { counterId?: unknown }).counterId === counterId;
}

function hasHeroResourceSource(
  data: Record<string, unknown>,
  resourceId: string,
  amount: number,
): boolean {
  if (data.source === undefined) return true;
  const source = data.source;
  return !!source && typeof source === "object" &&
    (source as { type?: unknown }).type === "heroResource" &&
    (source as { resourceId?: unknown }).resourceId === resourceId &&
    (source as { amount?: unknown }).amount === amount;
}

function abilityUsed(unitId: string, abilityId: string): GameEvent {
  return { type: "abilityUsed", unitId, abilityId };
}

function commitNamedResource(
  state: GameState,
  unit: UnitState,
  abilityId: string,
  resourceId: string,
  amount: number,
  costs?: Parameters<typeof canSpendSlots>[1]
): { state: GameState; unit: UnitState; events: GameEvent[] } | null {
  const effectiveCosts = costs ?? getAbilitySpec(abilityId)?.actionCost?.consumes;
  if (!canSpendSlots(unit, effectiveCosts)) return null;
  const spent = spendCharges(unit, resourceId, amount);
  if (!spent.ok) return null;
  const updated = spendSlots(spent.unit, effectiveCosts);
  return {
    state: { ...state, units: { ...state.units, [updated.id]: updated } },
    unit: updated,
    events: [
      abilityUsed(updated.id, abilityId),
      {
        type: "chargesUpdated",
        unitId: updated.id,
        deltas: { [resourceId]: -amount },
        now: { [resourceId]: getCharges(updated, resourceId) },
      },
    ],
  };
}

function directionFrom(from: Coord, toward: Coord): Coord | null {
  const path = linePath(from, toward);
  if (!path || path.length < 2) return null;
  return { col: path[1].col - from.col, row: path[1].row - from.row };
}

export function isArtemidaAttackLineCell(
  state: GameState,
  caster: UnitState,
  center: Coord,
): boolean {
  if (!caster.position || !isInsideBoard(center, state.boardSize)) return false;
  const direction = directionFrom(caster.position, center);
  if (!direction) return false;

  let cursor = {
    col: caster.position.col + direction.col,
    row: caster.position.row + direction.row,
  };
  while (isInsideBoard(cursor, state.boardSize)) {
    if (cursor.col === center.col && cursor.row === center.row) return true;
    const occupant = getUnitAt(state, cursor);
    if (
      occupant &&
      occupant.owner !== caster.owner &&
      canDirectlyTargetUnit(state, caster.id, occupant.id)
    ) return false;
    cursor = { col: cursor.col + direction.col, row: cursor.row + direction.row };
  }
  return false;
}

function rayCells(state: GameState, from: Coord, toward: Coord): Coord[] {
  const dir = directionFrom(from, toward);
  if (!dir) return [];
  const result: Coord[] = [];
  let current = { col: from.col + dir.col, row: from.row + dir.row };
  while (isInsideBoard(current, state.boardSize)) {
    result.push(current);
    current = { col: current.col + dir.col, row: current.row + dir.row };
  }
  return result;
}

function lineCellsToEndpoint(from: Coord, endpoint: Coord): Coord[] {
  return linePath(from, endpoint)?.slice(1) ?? [];
}

function isBeyondEndpointOnRay(from: Coord, endpoint: Coord, cell: Coord): boolean {
  const endpointDirection = directionFrom(from, endpoint);
  const cellDirection = directionFrom(from, cell);
  if (!endpointDirection || !cellDirection || !coordsEqual(endpointDirection, cellDirection)) {
    return false;
  }
  return chebyshev(from, cell) > chebyshev(from, endpoint);
}

function unitIdsInCells(state: GameState, cells: Coord[], caster: UnitState, enemiesOnly: boolean): string[] {
  const keys = new Set(cells.map((cell) => `${cell.col},${cell.row}`));
  return Object.values(state.units)
    .filter((target) => target.isAlive && target.position && target.id !== caster.id)
    .filter((target) => !enemiesOnly || target.owner !== caster.owner)
    .filter((target) => keys.has(`${target.position!.col},${target.position!.row}`))
    .map((target) => target.id);
}

function applyDuolingoPush(state: GameState, unit: UnitState, action: AbilityAction): ApplyResult {
  if (unit.heroId !== HERO_DUOLINGO_ID || !unit.position) return { state, events: [] };
  const data = payload(action);
  const targetId = typeof data.targetId === "string" ? data.targetId : "";
  let destination = parseCoord(data.destination ?? data.position);
  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position) return { state, events: [] };
  const useCounter = hasAbilityCounterSource(data, ids.ABILITY_DUOLINGO_PUSH_NOTIFICATION);
  const useMissedLessons = hasHeroResourceSource(data, ids.ABILITY_DUOLINGO_SKIP_CLASSES, 3);
  if (!useCounter && !useMissedLessons) return { state, events: [] };
  if (!destination) return { state, events: [] };
  if (!getDuolingoPushDestinations(state, unit, target).some((cell) => coordsEqual(cell, destination!))) return { state, events: [] };
  const committed = commitNamedResource(
    state,
    unit,
    ids.ABILITY_DUOLINGO_PUSH_NOTIFICATION,
    useCounter ? ids.ABILITY_DUOLINGO_PUSH_NOTIFICATION : ids.ABILITY_DUOLINGO_SKIP_CLASSES,
    3,
    { move: true },
  );
  if (!committed) return { state, events: [] };
  const moved: UnitState = { ...committed.unit, position: destination, isStealthed: false, stealthTurnsLeft: 0 };
  const events = [...committed.events, { type: "unitMoved", unitId: moved.id, from: unit.position, to: destination } as GameEvent];
  if (unit.isStealthed) events.push({ type: "stealthRevealed", unitId: unit.id, reason: "forcedDisplacement", revealerId: unit.id });
  return { state: { ...committed.state, units: { ...committed.state.units, [moved.id]: moved } }, events };
}

function applyLucheLine(state: GameState, unit: UnitState, action: AbilityAction, isImpulse: boolean): ApplyResult {
  const data = payload(action);
  const target = parseCoord(data.target ?? data.center ?? data.line);
  if (unit.heroId !== HERO_LUCHE_ID || !unit.position || !target) return { state, events: [] };
  const useCounter = isImpulse;
  const useSun = !isImpulse && hasHeroResourceSource(data, ids.ABILITY_LUCHE_SUN_GLORY, 2);
  if (!useCounter && !useSun) return { state, events: [] };
  const cells = getLucheLightRayLine(state, unit, target);
  if (cells.length === 0) return { state, events: [] };
  const committed = commitNamedResource(
    state,
    unit,
    ids.ABILITY_LUCHE_DIVINE_RAY,
    useCounter ? ids.ABILITY_LUCHE_DIVINE_RAY : ids.ABILITY_LUCHE_SUN_GLORY,
    2,
    useCounter ? {} : { action: true },
  );
  if (!committed) return { state, events: [] };
  const queued = queueNewHeroAttacks(committed.state, committed.unit, ids.ABILITY_LUCHE_DIVINE_RAY, unitIdsInCells(committed.state, cells, committed.unit, true), { blindOnHit: true, center: target });
  return { state: queued.state, events: [...committed.events, ...queued.events] };
}

function applyLucheFallingSun(state: GameState, unit: UnitState): ApplyResult {
  if (unit.heroId !== HERO_LUCHE_ID || !unit.position) return { state, events: [] };
  const targets = Object.values(state.units).filter((target) => target.owner !== unit.owner && canAttackTarget(state, unit, target)).map((target) => target.id);
  const committed = commitNamedResource(state, unit, ids.ABILITY_LUCHE_BURNING_SUN, ids.ABILITY_LUCHE_SUN_GLORY, 5);
  if (!committed) return { state, events: [] };
  const queued = queueNewHeroAttacks(committed.state, committed.unit, ids.ABILITY_LUCHE_BURNING_SUN, targets, { damageOverride: 2, ignoreBonuses: true, blindOnHit: true, center: unit.position, radius: 2 });
  return { state: queued.state, events: [...committed.events, ...queued.events] };
}

function applyKanekiRegeneration(state: GameState, unit: UnitState, action: AbilityAction): ApplyResult {
  if (unit.heroId !== HERO_KANEKI_ID) return { state, events: [] };
  const amount = Number(payload(action).amount);
  const maxHp = getHeroDefinition(unit.heroId)?.baseHpOverride ?? getUnitDefinition(unit.class).maxHp;
  if (!Number.isInteger(amount) || amount <= 0) return { state, events: [] };
  if (amount <= 0) return { state, events: [] };
  const heal = Math.min(amount, Math.max(0, maxHp - unit.hp));
  if (heal <= 0 || heal !== amount) return { state, events: [] };
  const committed = commitNamedResource(state, unit, ids.ABILITY_KANEKI_REGENERATION, ids.ABILITY_KANEKI_RC_CELLS, amount);
  if (!committed) return { state, events: [] };
  const healed = { ...committed.unit, hp: committed.unit.hp + heal };
  return { state: { ...committed.state, units: { ...committed.state.units, [healed.id]: healed } }, events: [...committed.events, { type: "unitHealed", unitId: healed.id, amount: heal, hpAfter: healed.hp, sourceAbilityId: ids.ABILITY_KANEKI_REGENERATION }] };
}

function applyZoroOniGiri(state: GameState, unit: UnitState, action: AbilityAction, isImpulse: boolean): ApplyResult {
  if (unit.heroId !== HERO_ZORO_ID || !unit.position) return { state, events: [] };
  const data = payload(action);
  const targetId = typeof data.targetId === "string" ? data.targetId : "";
  let destination = parseCoord(data.destination ?? data.position);
  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position || target.owner === unit.owner) return { state, events: [] };
  const useCounter = isImpulse || hasAbilityCounterSource(data, ids.ABILITY_ZORO_ONI_GIRI);
  const useDetermination = !isImpulse && hasHeroResourceSource(data, ids.ABILITY_ZORO_DETERMINATION, 2);
  if (!useCounter && !useDetermination) return { state, events: [] };
  if (!destination) return { state, events: [] };
  if (!getZoroOniGiriDestinations(state, unit, target).some((cell) => coordsEqual(cell, destination!))) return { state, events: [] };
  const committed = commitNamedResource(
    state,
    unit,
    ids.ABILITY_ZORO_ONI_GIRI,
    useCounter ? ids.ABILITY_ZORO_ONI_GIRI : ids.ABILITY_ZORO_DETERMINATION,
    2,
    { action: true, move: true },
  );
  if (!committed) return { state, events: [] };
  const moved = { ...committed.unit, position: destination };
  const movedState = { ...committed.state, units: { ...committed.state.units, [moved.id]: moved } };
  const queued = queueNewHeroAttacks(movedState, moved, ids.ABILITY_ZORO_ONI_GIRI, [target.id], { center: target.position });
  return { state: queued.state, events: [...committed.events, { type: "unitMoved", unitId: moved.id, from: unit.position, to: destination }, ...queued.events] };
}

function applyZoroAsura(state: GameState, unit: UnitState): ApplyResult {
  if (unit.heroId !== HERO_ZORO_ID || !unit.position) return { state, events: [] };
  const targets = Object.values(state.units).filter((target) => target.isAlive && target.position && target.owner !== unit.owner && chebyshev(unit.position!, target.position) <= 2).map((target) => target.id);
  const committed = commitNamedResource(state, unit, ids.ABILITY_ZORO_ASURA, ids.ABILITY_ZORO_DETERMINATION, 6);
  if (!committed) return { state, events: [] };
  const queued = queueNewHeroAttacks(committed.state, committed.unit, ids.ABILITY_ZORO_ASURA, targets, { damageBonus: 1, center: unit.position, radius: 2 });
  return { state: queued.state, events: [...committed.events, ...queued.events] };
}

function applyDonReaction(state: GameState, unit: UnitState, action: AbilityAction): ApplyResult {
  const destination = parseCoord(payload(action).destination ?? payload(action).position);
  if (payload(action).reaction !== true || unit.heroId !== HERO_DON_KIHOTE_ID || !unit.position || !unit.donSorrowfulReactionAvailable || !destination) return { state, events: [] };
  if (chebyshev(unit.position, destination) !== 1 || !isInsideBoard(destination, state.boardSize) || isCellOccupied(state, destination)) return { state, events: [] };
  const moved = { ...unit, position: destination, donSorrowfulReactionAvailable: false };
  return { state: { ...state, units: { ...state.units, [moved.id]: moved } }, events: [abilityUsed(unit.id, ids.ABILITY_DON_KIHOTE_SORROWFUL_COUNTENANCE), { type: "unitMoved", unitId: moved.id, from: unit.position, to: destination }] };
}

function applyDonWindmills(state: GameState, unit: UnitState, action: AbilityAction): ApplyResult {
  if (unit.heroId !== HERO_DON_KIHOTE_ID || !unit.position) return { state, events: [] };
  const targetId = typeof payload(action).targetId === "string" ? payload(action).targetId as string : "";
  const target = state.units[targetId];
  if (!target || !target.isAlive || !target.position || !target.heroId || target.owner === unit.owner || !canDirectlyTargetUnit(state, unit.id, target.id)) return { state, events: [] };
  if (unit.blindUntilOwnTurnStart && chebyshev(unit.position, target.position) > 1) return { state, events: [] };
  const path = linePath(unit.position, target.position);
  if (!path || path.length < 2) return { state, events: [] };
  const crossed = path.slice(1, -1).map((cell) => getUnitAt(state, cell)).filter((candidate): candidate is UnitState => !!candidate && candidate.owner !== unit.owner);
  const destination = path[path.length - 2];
  const occupyingDestination = getUnitAt(state, destination);
  if (occupyingDestination) return { state, events: [] };
  const spec = getAbilitySpec(ids.ABILITY_DON_KIHOTE_WINDMILLS);
  if (!spec || !canSpendSlots(unit, spec.actionCost?.consumes)) return { state, events: [] };
  const chargeSpend = spendCharges(unit, spec.id, 3);
  if (!chargeSpend.ok) return { state, events: [] };
  let moved = spendSlots(chargeSpend.unit, spec.actionCost?.consumes);
  moved = { ...moved, position: destination };
  let units = { ...state.units, [moved.id]: moved };
  const events: GameEvent[] = [abilityUsed(moved.id, spec.id), { type: "unitMoved", unitId: moved.id, from: unit.position, to: destination }];
  events.push({ type: "chargesUpdated", unitId: moved.id, deltas: { [spec.id]: -3 }, now: { [spec.id]: getCharges(moved, spec.id) } });
  for (const passed of crossed) {
    const damaged = { ...passed, hp: Math.max(0, passed.hp - 1) };
    units[passed.id] = damaged.hp === 0 ? { ...damaged, isAlive: false, position: null } : damaged;
    if (damaged.hp === 0) events.push({ type: "unitDied", unitId: damaged.id, killerId: moved.id });
  }
  const movedState: GameState = { ...state, units };
  const repositionIds = crossed
    .map((passed) => passed.id)
    .filter((id) => !!movedState.units[id]?.isAlive);
  if (repositionIds.length > 0) {
    const firstAffected = movedState.units[repositionIds[0]];
    const options = firstAffected?.position
      ? ALL_DIRS.map((dir) => ({ col: firstAffected.position!.col + dir.col, row: firstAffected.position!.row + dir.row }))
          .filter((cell) => isInsideBoard(cell, state.boardSize))
          .filter((cell) => !isCellOccupied(movedState, cell))
          .filter((cell) => path.some((pathCell) => chebyshev(pathCell, cell) <= 1))
      : [];
    if (options.length > 0) {
      const requested = requestRoll(
        movedState,
        firstAffected.owner,
        "donWindmillsRepositionChoice",
        { donId: moved.id, giantId: target.id, affectedIds: repositionIds, index: 0, pathCells: path, center: target.position, options },
        moved.id,
      );
      return { state: requested.state, events: [...events, ...requested.events] };
    }
  }
  const queued = queueNewHeroAttacks(movedState, moved, spec.id, [target.id], { center: target.position });
  return { state: queued.state, events: [...events, ...queued.events] };
}

function applyJackTrap(state: GameState, unit: UnitState, action: AbilityAction, isImpulse: boolean, rng: { next: () => number }): ApplyResult {
  const position = parseCoord(payload(action).position ?? payload(action).center);
  const explodePosition = parseCoord(payload(action).explodePosition);
  if (!isImpulse || unit.heroId !== HERO_JACK_RIPPER_ID || !position || !isInsideBoard(position, state.boardSize)) return { state, events: [] };
  return applyJackTrapPlacement(state, unit, position, explodePosition, rng);
}

function applyJackHolyMother(state: GameState, unit: UnitState, action: AbilityAction): ApplyResult {
  const targetId = typeof payload(action).targetId === "string" ? payload(action).targetId as string : "";
  const target = state.units[targetId];
  if (unit.heroId !== HERO_JACK_RIPPER_ID || unit.jackHolyMotherUsed || !target || !target.isAlive || !target.position || target.owner === unit.owner) return { state, events: [] };
  if (!canAttackTarget(state, unit, target)) return { state, events: [] };
  const onTrap = (state.jackTraps ?? []).some((trap) => trap.sourceUnitId === unit.id && coordsEqual(trap.position, target.position!));
  const spec = getAbilitySpec(ids.ABILITY_JACK_RIPPER_DISMEMBERMENT);
  if (!onTrap || !spec || !canSpendSlots(unit, spec.actionCost?.consumes)) return { state, events: [] };
  const updated = { ...spendSlots(unit, spec.actionCost?.consumes), jackHolyMotherUsed: true };
  const committed = { ...state, units: { ...state.units, [unit.id]: updated } };
  const queue = queueNewHeroAttacks(committed, updated, spec.id, [target.id, target.id, target.id, target.id], { damageOverride: 3, ignoreBonuses: true, center: target.position, preserveDuplicates: true });
  return { state: queue.state, events: [abilityUsed(unit.id, spec.id), ...queue.events] };
}

function applyArtemisInsight(state: GameState, unit: UnitState, action: AbilityAction, rng: { next: () => number }, isImpulse: boolean): ApplyResult {
  const center = parseCoord(payload(action).center ?? payload(action).target);
  if (
    !isImpulse ||
    unit.heroId !== HERO_ARTEMIDA_ID ||
    !unit.position ||
    !center ||
    !isArtemidaAttackLineCell(state, unit, center)
  ) return { state, events: [] };
  if (unit.blindUntilOwnTurnStart && chebyshev(unit.position, center) > 1) return { state, events: [] };
  const spent = spendCharges(unit, ids.ABILITY_ARTEMIDA_MOONLIGHT_SHINE, 3);
  if (!spent.ok) return { state, events: [] };
  const base = { ...state, units: { ...state.units, [unit.id]: spent.unit } };
  const revealed = revealStealthedInArea(base, center, 1, rng, (target) => target.owner !== unit.owner);
  return { state: revealed.state, events: [abilityUsed(unit.id, ids.ABILITY_ARTEMIDA_MOONLIGHT_SHINE), ...revealed.events, { type: "aoeResolved", sourceUnitId: unit.id, abilityId: ids.ABILITY_ARTEMIDA_MOONLIGHT_SHINE, casterId: unit.id, center, radius: 1, affectedUnitIds: [], revealedUnitIds: revealed.events.filter((event) => event.type === "stealthRevealed").map((event) => event.type === "stealthRevealed" ? event.unitId : ""), damagedUnitIds: [], damageByUnitId: {} }] };
}

function applyArtemisSickle(state: GameState, unit: UnitState, action: AbilityAction): ApplyResult {
  const toward = parseCoord(payload(action).target ?? payload(action).direction ?? payload(action).center);
  if (
    unit.heroId !== HERO_ARTEMIDA_ID ||
    !unit.position ||
    !toward ||
    !isArtemidaAttackLineCell(state, unit, toward)
  ) return { state, events: [] };
  if (unit.blindUntilOwnTurnStart && chebyshev(unit.position, toward) > 1) return { state, events: [] };
  const spec = getAbilitySpec(ids.ABILITY_ARTEMIDA_SILVER_CRESCENT);
  if (!spec || !canSpendSlots(unit, spec.actionCost?.consumes)) return { state, events: [] };
  const spent = spendCharges(unit, spec.id, 5);
  if (!spent.ok) return { state, events: [] };
  const updated = spendSlots(spent.unit, spec.actionCost?.consumes);
  const base = { ...state, units: { ...state.units, [unit.id]: updated } };
  const line = lineCellsToEndpoint(unit.position, toward);
  const affected: Coord[] = [];
  for (const cell of line) {
    affected.push(cell);
    for (const dir of ALL_DIRS) {
      const adjacent = { col: cell.col + dir.col, row: cell.row + dir.row };
      if (
        isInsideBoard(adjacent, state.boardSize) &&
        !coordsEqual(adjacent, unit.position) &&
        !isBeyondEndpointOnRay(unit.position, toward, adjacent)
      ) affected.push(adjacent);
    }
  }
  const targets = unitIdsInCells(base, affected, updated, false);
  const queued = queueNewHeroAttacks(base, updated, spec.id, targets, { damageOverride: 2, ignoreBonuses: true, allowFriendlyTarget: true, center: toward });
  return { state: queued.state, events: [abilityUsed(unit.id, spec.id), ...queued.events] };
}

export function applyNewBatchAbility(
  state: GameState,
  unit: UnitState,
  action: AbilityAction,
  rng: { next: () => number },
  execution?: { startTurnImpulse?: boolean },
): ApplyResult | null {
  const isStartTurnImpulse = execution?.startTurnImpulse === true;
  switch (action.abilityId) {
    case ids.ABILITY_DUOLINGO_PUSH_NOTIFICATION: return applyDuolingoPush(state, unit, action);
    case ids.ABILITY_LUCHE_DIVINE_RAY: return applyLucheLine(state, unit, action, isStartTurnImpulse);
    case ids.ABILITY_LUCHE_BURNING_SUN: return applyLucheFallingSun(state, unit);
    case ids.ABILITY_KANEKI_REGENERATION: return applyKanekiRegeneration(state, unit, action);
    case ids.ABILITY_ZORO_ONI_GIRI: return applyZoroOniGiri(state, unit, action, isStartTurnImpulse);
    case ids.ABILITY_ZORO_ASURA: return applyZoroAsura(state, unit);
    case ids.ABILITY_DON_KIHOTE_SORROWFUL_COUNTENANCE: return applyDonReaction(state, unit, action);
    case ids.ABILITY_DON_KIHOTE_WINDMILLS: return applyDonWindmills(state, unit, action);
    case ids.ABILITY_JACK_RIPPER_SNARES: return applyJackTrap(state, unit, action, isStartTurnImpulse, rng);
    case ids.ABILITY_JACK_RIPPER_DISMEMBERMENT: return applyJackHolyMother(state, unit, action);
    case ids.ABILITY_ARTEMIDA_MOONLIGHT_SHINE: return applyArtemisInsight(state, unit, action, rng, isStartTurnImpulse);
    case ids.ABILITY_ARTEMIDA_SILVER_CRESCENT: return applyArtemisSickle(state, unit, action);
    default: return null;
  }
}
