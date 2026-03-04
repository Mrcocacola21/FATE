import type {
  ApplyResult,
  GameEvent,
  GameState,
  PapyrusBoneStatus,
  PapyrusBoneType,
  UnitState,
} from "../../../model";
import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  getAbilitySpec,
  setCharges,
} from "../../../abilities";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../../../heroes";
import { evUnitDied } from "../../../core";
import { isPapyrus, isPapyrusBoneStatusActive } from "./helpers";

export function applyPapyrusBonePunish(
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

export function applyPapyrusBoneOnHits(
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

export function applyPapyrusUnbelieverFromDeaths(
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

export function clearExpiredPapyrusStatusesForSource(
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
