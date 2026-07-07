import type { GameState, PlayerId, UnitState } from "./model";
import { HERO_CHIKATILO_ID } from "./heroes";

export const CHIKATILO_ASSASSIN_MARK_RANGE = 2;
export const CHIKATILO_MARK_TRACKING_STARTS = "startOfChikatiloTurn" as const;
export const CHIKATILO_MARK_TRACKING_EXPIRES = "afterMarkedUnitTurn" as const;

export type ChikatiloMarkTrackingStarts =
  typeof CHIKATILO_MARK_TRACKING_STARTS;
export type ChikatiloMarkTrackingExpiry =
  typeof CHIKATILO_MARK_TRACKING_EXPIRES;

export interface ChikatiloMarkProjectionStatus {
  sourceUnitId: string;
  exactTrackingActive: boolean;
  trackingStarts: ChikatiloMarkTrackingStarts;
  trackingExpires: ChikatiloMarkTrackingExpiry;
}

function isLiveChikatilo(unit: UnitState | undefined): unit is UnitState {
  return !!unit && unit.isAlive && unit.heroId === HERO_CHIKATILO_ID;
}

export function getChikatiloMarkedTargetIds(unit: UnitState): string[] {
  return Array.isArray(unit.chikatiloMarkedTargets)
    ? unit.chikatiloMarkedTargets
    : [];
}

export function getChikatiloTrackedTargetIds(unit: UnitState): string[] {
  return Array.isArray(unit.chikatiloTrackedTargets)
    ? unit.chikatiloTrackedTargets
    : [];
}

export function isChikatiloTrackingTarget(
  chikatilo: UnitState,
  targetId: string
): boolean {
  if (!isLiveChikatilo(chikatilo)) return false;
  return getChikatiloTrackedTargetIds(chikatilo).includes(targetId);
}

export function canUnitTrackChikatiloMarkExactPosition(
  state: GameState,
  viewer: UnitState,
  target: UnitState
): boolean {
  if (!viewer.position || !target.position) return false;
  if (!target.isAlive || !target.isStealthed) return false;
  if (viewer.owner === target.owner) return false;
  if (!isChikatiloTrackingTarget(viewer, target.id)) return false;
  return !!state.units[viewer.id];
}

export function canViewerTrackExactPosition(
  state: GameState,
  viewerPlayerId: PlayerId,
  unitId: string
): boolean {
  const target = state.units[unitId];
  if (!target || !target.isAlive || !target.position || !target.isStealthed) {
    return false;
  }
  return Object.values(state.units).some((unit) => {
    if (unit.owner !== viewerPlayerId) return false;
    return canUnitTrackChikatiloMarkExactPosition(state, unit, target);
  });
}

export function activateChikatiloTrackingForStartTurn(
  state: GameState,
  chikatiloId: string
): GameState {
  const chikatilo = state.units[chikatiloId];
  if (!isLiveChikatilo(chikatilo)) return state;
  const marked = getChikatiloMarkedTargetIds(chikatilo).filter((targetId) => {
    const target = state.units[targetId];
    return !!target && target.isAlive && !!target.position;
  });
  const nextTracked = Array.from(new Set(marked));
  const previous = getChikatiloTrackedTargetIds(chikatilo);
  if (
    previous.length === nextTracked.length &&
    previous.every((targetId, index) => targetId === nextTracked[index])
  ) {
    return state;
  }
  return {
    ...state,
    units: {
      ...state.units,
      [chikatilo.id]: {
        ...chikatilo,
        chikatiloTrackedTargets: nextTracked,
      },
    },
  };
}

export function expireChikatiloTrackingAfterTargetTurn(
  state: GameState,
  targetUnitId: string | null
): GameState {
  if (!targetUnitId) return state;
  let changed = false;
  const units = { ...state.units };
  for (const unit of Object.values(state.units)) {
    if (!isLiveChikatilo(unit)) continue;
    const tracked = getChikatiloTrackedTargetIds(unit);
    if (!tracked.includes(targetUnitId)) continue;
    units[unit.id] = {
      ...unit,
      chikatiloTrackedTargets: tracked.filter((id) => id !== targetUnitId),
    };
    changed = true;
  }
  return changed ? { ...state, units } : state;
}

export function getChikatiloMarkStatusForViewer(
  state: GameState,
  viewerPlayerId: PlayerId,
  targetUnitId: string
): ChikatiloMarkProjectionStatus | undefined {
  const target = state.units[targetUnitId];
  if (!target || !target.isAlive) return undefined;
  const marker = Object.values(state.units)
    .filter((unit) => unit.owner === viewerPlayerId && isLiveChikatilo(unit))
    .find((unit) => getChikatiloMarkedTargetIds(unit).includes(targetUnitId));
  if (!marker) return undefined;
  return {
    sourceUnitId: marker.id,
    exactTrackingActive: isChikatiloTrackingTarget(marker, targetUnitId),
    trackingStarts: CHIKATILO_MARK_TRACKING_STARTS,
    trackingExpires: CHIKATILO_MARK_TRACKING_EXPIRES,
  };
}

export function stripChikatiloPrivateState<T extends UnitState>(unit: T): T {
  const projected: UnitState = { ...unit };
  delete projected.chikatiloMarkedTargets;
  delete projected.chikatiloTrackedTargets;
  delete projected.chikatiloMarkStatus;
  return projected as T;
}
