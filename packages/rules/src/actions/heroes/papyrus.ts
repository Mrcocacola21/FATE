import type {
  ApplyResult,
  Coord,
  GameAction,
  GameEvent,
  GameState,
  PapyrusBoneStatus,
  PapyrusBoneType,
  PapyrusLineAxis,
  UnitState,
} from "../../model";
import { isInsideBoard } from "../../model";
import { getUnitAt } from "../../board";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_PAPYRUS_COOL_GUY,
  ABILITY_PAPYRUS_LONG_BONE,
  ABILITY_PAPYRUS_ORANGE_BONE,
  ABILITY_PAPYRUS_SPAGHETTI,
  getAbilitySpec,
  getCharges,
  setCharges,
  spendCharges,
} from "../../abilities";
import { HERO_FALSE_TRAIL_TOKEN_ID, HERO_PAPYRUS_ID } from "../../heroes";
import { canSpendSlots, spendSlots } from "../../turnEconomy";
import { getUnitBaseMaxHp } from "../shared";
import { evAbilityUsed, evAoeResolved, evUnitDied, evUnitHealed, requestRoll } from "../../core";
import type { TricksterAoEContext } from "../../pendingRoll/types";

interface LinePayload {
  target?: Coord;
  axis?: PapyrusLineAxis;
}

interface OrangeBonePayload {
  enabled?: boolean;
  boneType?: PapyrusBoneType;
}

interface LongBonePayload {
  enabled?: boolean;
  axis?: PapyrusLineAxis;
}

function isPapyrus(unit: UnitState | undefined): unit is UnitState {
  return !!unit && unit.heroId === HERO_PAPYRUS_ID;
}

function isLineAxis(value: unknown): value is PapyrusLineAxis {
  return (
    value === "row" ||
    value === "col" ||
    value === "diagMain" ||
    value === "diagAnti"
  );
}

function parseCoord(value: unknown): Coord | null {
  if (!value || typeof value !== "object") return null;
  const col = (value as { col?: unknown }).col;
  const row = (value as { row?: unknown }).row;
  if (typeof col !== "number" || typeof row !== "number") return null;
  return { col, row };
}

function getPapyrusLineCells(
  boardSize: number,
  axis: PapyrusLineAxis,
  target: Coord
): Coord[] {
  const cells: Coord[] = [];
  for (let col = 0; col < boardSize; col += 1) {
    for (let row = 0; row < boardSize; row += 1) {
      let matches = false;
      if (axis === "row") {
        matches = row === target.row;
      } else if (axis === "col") {
        matches = col === target.col;
      } else if (axis === "diagMain") {
        matches = col - row === target.col - target.row;
      } else if (axis === "diagAnti") {
        matches = col + row === target.col + target.row;
      }
      if (matches) {
        cells.push({ col, row });
      }
    }
  }
  return cells;
}

function getUnitsOnPapyrusLine(
  state: GameState,
  casterId: string,
  axis: PapyrusLineAxis,
  target: Coord
): string[] {
  const ids: string[] = [];
  for (const cell of getPapyrusLineCells(state.boardSize, axis, target)) {
    const unit = getUnitAt(state, cell);
    if (!unit || !unit.isAlive || unit.id === casterId) continue;
    ids.push(unit.id);
  }
  return ids.sort((a, b) => {
    const aUnit = state.units[a];
    const bUnit = state.units[b];
    const aPos = aUnit?.position;
    const bPos = bUnit?.position;
    if (!aPos || !bPos) return a.localeCompare(b);
    if (aPos.row !== bPos.row) return aPos.row - bPos.row;
    if (aPos.col !== bPos.col) return aPos.col - bPos.col;
    return a.localeCompare(b);
  });
}

function getPapyrusCoolGuyCost(unit: UnitState): number {
  return unit.papyrusUnbelieverActive ? 3 : 5;
}

function isPapyrusBoneStatusActive(
  state: GameState,
  status: PapyrusBoneStatus | undefined
): status is PapyrusBoneStatus {
  if (!status) return false;
  const source = state.units[status.sourceUnitId];
  if (!source || !source.isAlive || source.heroId !== HERO_PAPYRUS_ID) {
    return false;
  }
  const sourceOwnTurns = source.ownTurnsStarted ?? 0;
  return sourceOwnTurns < status.expiresOnSourceOwnTurn;
}

function getActionActorId(
  prevState: GameState,
  action: GameAction
): string | undefined {
  if (
    action.type === "move" ||
    action.type === "requestMoveOptions" ||
    action.type === "enterStealth" ||
    action.type === "searchStealth" ||
    action.type === "useAbility" ||
    action.type === "unitStartTurn"
  ) {
    return action.unitId;
  }
  if (action.type === "attack") {
    return action.attackerId;
  }
  if (action.type === "resolvePendingRoll") {
    const pending = prevState.pendingRoll;
    const unitId = pending?.context?.unitId;
    return typeof unitId === "string" ? unitId : undefined;
  }
  return undefined;
}

function applyPapyrusBonePunish(
  state: GameState,
  targetId: string,
  expectedBoneType: PapyrusBoneType,
  reason: "moveSpent" | "moveNotSpent"
): ApplyResult {
  const target = state.units[targetId];
  if (!target || !target.isAlive) return { state, events: [] };
  const status = target.papyrusBoneStatus;
  if (
    !isPapyrusBoneStatusActive(state, status) ||
    status.kind !== expectedBoneType
  ) {
    return { state, events: [] };
  }
  if (
    expectedBoneType === "blue" &&
    status.bluePunishedTurnNumber === state.turnNumber
  ) {
    return { state, events: [] };
  }

  const hpAfter = Math.max(0, target.hp - 1);
  const updatedStatus: PapyrusBoneStatus = {
    ...status,
    bluePunishedTurnNumber:
      expectedBoneType === "blue" ? state.turnNumber : status.bluePunishedTurnNumber,
  };
  let updatedTarget: UnitState = {
    ...target,
    hp: hpAfter,
    papyrusBoneStatus: updatedStatus,
  };
  const events: GameEvent[] = [
    {
      type: "papyrusBonePunished",
      papyrusId: status.sourceUnitId,
      targetId: updatedTarget.id,
      boneType: status.kind,
      damage: 1,
      reason,
      hpAfter,
    },
  ];

  if (hpAfter <= 0) {
    updatedTarget = {
      ...updatedTarget,
      isAlive: false,
      position: null,
    };
    events.push(
      evUnitDied({
        unitId: updatedTarget.id,
        killerId: status.sourceUnitId,
      })
    );
  }

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedTarget.id]: updatedTarget,
      },
    },
    events,
  };
}

function applyPapyrusBoneOnHits(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  let nextState = state;
  const nextEvents: GameEvent[] = [];

  for (const event of events) {
    if (event.type !== "attackResolved" || !event.hit) continue;

    const papyrus = nextState.units[event.attackerId];
    if (!isPapyrus(papyrus) || !papyrus.isAlive) continue;
    const target = nextState.units[event.defenderId];
    if (!target || !target.isAlive) continue;

    const boneType: PapyrusBoneType =
      papyrus.papyrusUnbelieverActive && papyrus.papyrusBoneMode === "orange"
        ? "orange"
        : "blue";
    const expiresOnSourceOwnTurn = (papyrus.ownTurnsStarted ?? 0) + 1;
    const status: PapyrusBoneStatus = {
      sourceUnitId: papyrus.id,
      kind: boneType,
      expiresOnSourceOwnTurn,
      bluePunishedTurnNumber: undefined,
    };

    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [target.id]: {
          ...target,
          papyrusBoneStatus: status,
        },
      },
    };
    nextEvents.push({
      type: "papyrusBoneApplied",
      papyrusId: papyrus.id,
      targetId: target.id,
      boneType,
      expiresOnSourceOwnTurn,
    });
  }

  return { state: nextState, events: nextEvents };
}

function applyPapyrusUnbelieverFromDeaths(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const fallenHeroIds = events
    .filter((event) => event.type === "unitDied")
    .map((event) => (event.type === "unitDied" ? event.unitId : ""))
    .filter((unitId) => {
      const unit = state.units[unitId];
      return !!unit?.heroId && unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID;
    });
  if (fallenHeroIds.length === 0) {
    return { state, events: [] };
  }

  const uniqueFallen = Array.from(new Set(fallenHeroIds)).sort();
  let nextState = state;
  const nextEvents: GameEvent[] = [];

  for (const papyrus of Object.values(state.units).sort((a, b) =>
    a.id.localeCompare(b.id)
  )) {
    if (!isPapyrus(papyrus) || !papyrus.isAlive || papyrus.papyrusUnbelieverActive) {
      continue;
    }
    const fallenAllyId = uniqueFallen.find((unitId) => {
      const fallen = nextState.units[unitId];
      if (!fallen || !fallen.heroId) return false;
      if (fallen.id === papyrus.id) return false;
      return fallen.owner === papyrus.owner;
    });
    if (!fallenAllyId) continue;

    const berserkSpec = getAbilitySpec(ABILITY_BERSERK_AUTO_DEFENSE);
    const berserkFull = berserkSpec?.maxCharges ?? 6;
    let transformedPapyrus: UnitState = {
      ...papyrus,
      papyrusUnbelieverActive: true,
      papyrusBoneMode: papyrus.papyrusBoneMode ?? "blue",
      papyrusLongBoneMode: papyrus.papyrusLongBoneMode ?? false,
      papyrusLineAxis: papyrus.papyrusLineAxis ?? "row",
    };
    transformedPapyrus = setCharges(
      transformedPapyrus,
      ABILITY_BERSERK_AUTO_DEFENSE,
      berserkFull
    );

    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [papyrus.id]: transformedPapyrus,
      },
    };
    nextEvents.push({
      type: "papyrusUnbelieverActivated",
      papyrusId: papyrus.id,
      fallenAllyId,
    });
  }

  return { state: nextState, events: nextEvents };
}

function startPapyrusLineAttack(
  state: GameState,
  caster: UnitState,
  axis: PapyrusLineAxis,
  target: Coord,
  abilityId?: string
): ApplyResult {
  const affectedUnitIds = getUnitsOnPapyrusLine(state, caster.id, axis, target);
  const events: GameEvent[] = [];

  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: caster.id,
        abilityId,
        casterId: caster.id,
        center: target,
        radius: 0,
        affectedUnitIds,
        revealedUnitIds: [],
        damagedUnitIds: [],
        damageByUnitId: {},
      })
    );
    return { state, events };
  }

  const queuedState: GameState = {
    ...state,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: caster.id,
      abilityId: abilityId ?? ABILITY_PAPYRUS_LONG_BONE,
      center: target,
      radius: 0,
      affectedUnitIds,
      revealedUnitIds: [],
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: TricksterAoEContext = {
    casterId: caster.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
    allowFriendlyTarget: true,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
  };

  const requested = requestRoll(
    queuedState,
    caster.owner,
    "tricksterAoE_attackerRoll",
    ctx,
    caster.id
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function applyPapyrusSpaghetti(
  state: GameState,
  unit: UnitState
): ApplyResult {
  if (!isPapyrus(unit) || !unit.isAlive) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_PAPYRUS_SPAGHETTI);
  if (!spec) {
    return { state, events: [] };
  }
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const chargeCost = spec.chargesPerUse ?? spec.chargeCost ?? 3;
  const spent = spendCharges(unit, spec.id, chargeCost);
  if (!spent.ok) {
    return { state, events: [] };
  }

  const maxHp = getUnitBaseMaxHp(unit);
  const slotted = spendSlots(spent.unit, costs);
  const hpBefore = slotted.hp;
  const healed = Math.max(0, Math.min(2, maxHp - hpBefore));
  const updatedUnit: UnitState = {
    ...slotted,
    hp: Math.min(maxHp, hpBefore + 2),
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];
  if (healed > 0) {
    events.push(
      evUnitHealed({
        unitId: updatedUnit.id,
        amount: healed,
        hpAfter: updatedUnit.hp,
        sourceAbilityId: spec.id,
      })
    );
  }

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
    },
    events,
  };
}

export function applyPapyrusCoolGuy(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isPapyrus(unit) || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(ABILITY_PAPYRUS_COOL_GUY);
  if (!spec) {
    return { state, events: [] };
  }
  const costs = spec.actionCost?.consumes ?? {};
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  const payload = (action.payload ?? {}) as LinePayload;
  const target = parseCoord(payload.target);
  if (!target || !isInsideBoard(target, state.boardSize)) {
    return { state, events: [] };
  }
  const axis = isLineAxis(payload.axis)
    ? payload.axis
    : unit.papyrusLineAxis ?? "row";
  const chargeCost = getPapyrusCoolGuyCost(unit);
  if (getCharges(unit, spec.id) < chargeCost) {
    return { state, events: [] };
  }

  const spent = spendCharges(unit, spec.id, chargeCost);
  if (!spent.ok) {
    return { state, events: [] };
  }
  const updatedUnit: UnitState = spendSlots(
    {
      ...spent.unit,
      papyrusLineAxis: axis,
    },
    costs
  );
  const updatedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };
  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  const lineAttack = startPapyrusLineAttack(
    updatedState,
    updatedUnit,
    axis,
    target,
    spec.id
  );
  return {
    state: lineAttack.state,
    events: [...events, ...lineAttack.events],
  };
}

export function applyPapyrusOrangeBoneToggle(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isPapyrus(unit) || !unit.papyrusUnbelieverActive) {
    return { state, events: [] };
  }

  const payload = (action.payload ?? {}) as OrangeBonePayload;
  let boneMode: PapyrusBoneType;
  if (payload.boneType === "blue" || payload.boneType === "orange") {
    boneMode = payload.boneType;
  } else if (typeof payload.enabled === "boolean") {
    boneMode = payload.enabled ? "orange" : "blue";
  } else {
    boneMode = unit.papyrusBoneMode === "orange" ? "blue" : "orange";
  }

  const updatedUnit: UnitState = {
    ...unit,
    papyrusBoneMode: boneMode,
  };
  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
    },
    events: [
      evAbilityUsed({
        unitId: updatedUnit.id,
        abilityId: ABILITY_PAPYRUS_ORANGE_BONE,
      }),
    ],
  };
}

export function applyPapyrusLongBoneToggle(
  state: GameState,
  unit: UnitState,
  action: Extract<GameAction, { type: "useAbility" }>
): ApplyResult {
  if (!isPapyrus(unit) || !unit.papyrusUnbelieverActive) {
    return { state, events: [] };
  }

  const payload = (action.payload ?? {}) as LongBonePayload;
  const axis = isLineAxis(payload.axis)
    ? payload.axis
    : unit.papyrusLineAxis ?? "row";
  const enabled =
    typeof payload.enabled === "boolean"
      ? payload.enabled
      : !(unit.papyrusLongBoneMode ?? false);

  const updatedUnit: UnitState = {
    ...unit,
    papyrusLongBoneMode: enabled,
    papyrusLineAxis: axis,
  };
  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [updatedUnit.id]: updatedUnit,
      },
    },
    events: [
      evAbilityUsed({
        unitId: updatedUnit.id,
        abilityId: ABILITY_PAPYRUS_LONG_BONE,
      }),
    ],
  };
}

export function maybeApplyPapyrusLongBoneAttack(
  state: GameState,
  attackerId: string,
  anchorTargetId: string
): ApplyResult | null {
  const attacker = state.units[attackerId];
  const anchorTarget = state.units[anchorTargetId];
  if (!isPapyrus(attacker) || !attacker.papyrusUnbelieverActive) {
    return null;
  }
  if (!attacker.papyrusLongBoneMode || !attacker.isAlive || !attacker.position) {
    return null;
  }
  if (!anchorTarget || !anchorTarget.isAlive || !anchorTarget.position) {
    return { state, events: [] };
  }
  if (!canSpendSlots(attacker, { attack: true, action: true })) {
    return { state, events: [] };
  }

  const updatedAttacker: UnitState = spendSlots(attacker, {
    attack: true,
    action: true,
  });
  const updatedState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedAttacker.id]: updatedAttacker,
    },
  };
  const axis = updatedAttacker.papyrusLineAxis ?? "row";
  return startPapyrusLineAttack(
    updatedState,
    updatedAttacker,
    axis,
    anchorTarget.position,
    ABILITY_PAPYRUS_LONG_BONE
  );
}

function clearExpiredPapyrusStatusesForSource(
  state: GameState,
  sourcePapyrusId: string
): GameState {
  const source = state.units[sourcePapyrusId];
  if (!isPapyrus(source)) return state;
  const sourceOwnTurns = source.ownTurnsStarted ?? 0;

  let changed = false;
  const units: Record<string, UnitState> = { ...state.units };
  for (const unit of Object.values(state.units)) {
    const status = unit.papyrusBoneStatus;
    if (!status || status.sourceUnitId !== sourcePapyrusId) continue;
    if (sourceOwnTurns < status.expiresOnSourceOwnTurn) continue;
    changed = true;
    units[unit.id] = {
      ...unit,
      papyrusBoneStatus: undefined,
    };
  }

  return changed ? { ...state, units } : state;
}

export function applyPapyrusPostAction(
  prevState: GameState,
  action: GameAction,
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  let nextState = state;
  let nextEvents: GameEvent[] = [...events];

  if (action.type === "unitStartTurn") {
    nextState = clearExpiredPapyrusStatusesForSource(nextState, action.unitId);
  }

  const actorId = getActionActorId(prevState, action);
  if (actorId) {
    const prevActor = prevState.units[actorId];
    const nextActor = nextState.units[actorId];
    if (
      prevActor &&
      nextActor &&
      !prevActor.turn.moveUsed &&
      nextActor.turn.moveUsed
    ) {
      const punished = applyPapyrusBonePunish(
        nextState,
        actorId,
        "blue",
        "moveSpent"
      );
      nextState = punished.state;
      nextEvents = [...nextEvents, ...punished.events];
    }
  }

  if (action.type === "endTurn") {
    const endingUnitId = prevState.activeUnitId;
    if (endingUnitId) {
      const endingUnitBefore = prevState.units[endingUnitId];
      if (endingUnitBefore && !endingUnitBefore.turn.moveUsed) {
        const punished = applyPapyrusBonePunish(
          nextState,
          endingUnitId,
          "orange",
          "moveNotSpent"
        );
        nextState = punished.state;
        nextEvents = [...nextEvents, ...punished.events];
      }
    }
  }

  const appliedBones = applyPapyrusBoneOnHits(nextState, nextEvents);
  nextState = appliedBones.state;
  nextEvents = [...nextEvents, ...appliedBones.events];

  const transformed = applyPapyrusUnbelieverFromDeaths(nextState, nextEvents);
  nextState = transformed.state;
  nextEvents = [...nextEvents, ...transformed.events];

  return {
    state: nextState,
    events: nextEvents,
  };
}

