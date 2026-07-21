import type { GameEvent, PlayerView } from "rules";
import type { BoardEventBatch } from "./types";

export type VisualHpByUnitId = Record<string, number>;
export type VisualUnitsByUnitId = PlayerView["units"];

export interface VisualResolutionState {
  initialized: boolean;
  enabled: boolean;
  lastProcessedLogIndex: number;
  groupActive: boolean;
  bufferedEvents: GameEvent[];
  visualBatch: BoardEventBatch | null;
  visualHpByUnitId: VisualHpByUnitId;
  visualUnitsByUnitId: VisualUnitsByUnitId;
}

export interface VisualResolutionInput {
  batch: BoardEventBatch | null | undefined;
  view: PlayerView;
  enabled: boolean;
}

const REDUNDANT_AGGREGATED_EVENT_TYPES = new Set<GameEvent["type"]>([
  "carpetStrikeTriggered",
  "carpetStrikeCenter",
  "carpetStrikeAttackRolled",
]);

export function snapshotVisualHp(view: PlayerView): VisualHpByUnitId {
  return Object.fromEntries(
    Object.values(view.units).map((unit) => [unit.id, unit.hp]),
  );
}

export function snapshotVisualUnits(view: PlayerView): VisualUnitsByUnitId {
  return Object.fromEntries(
    Object.values(view.units).map((unit) => [
      unit.id,
      {
        ...unit,
        position: unit.position ? { ...unit.position } : null,
      },
    ]),
  );
}

export function visualHpSnapshotsEqual(
  left: VisualHpByUnitId,
  right: VisualHpByUnitId,
): boolean {
  const leftIds = Object.keys(left);
  const rightIds = Object.keys(right);
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((unitId) => left[unitId] === right[unitId])
  );
}

export function isVisualResolutionPending(view: PlayerView): boolean {
  return Boolean(view.pendingAoEPreview) || (view.pendingCombatQueueCount ?? 0) > 0;
}

/**
 * AoE resolution already contains the aggregate hit/miss/damage result. Keeping
 * its per-target attack events would render every result twice when a buffered
 * group is finally released. Other queued attacks have no aggregate event, so
 * their individual attackResolved events are intentionally preserved.
 */
export function collapseCompletedVisualResolutionEvents(
  events: GameEvent[],
): GameEvent[] {
  const aggregateEvents = events.filter(
    (event): event is Extract<GameEvent, { type: "aoeResolved" }> =>
      event.type === "aoeResolved",
  );
  if (aggregateEvents.length === 0) {
    return events;
  }
  const aggregatedTargetIds = new Set(
    aggregateEvents.flatMap((event) => event.affectedUnitIds ?? []),
  );
  return events.filter((event) => {
    if (REDUNDANT_AGGREGATED_EVENT_TYPES.has(event.type)) return false;
    if (event.type === "attackResolved") {
      return !aggregatedTargetIds.has(event.defenderId);
    }
    return true;
  });
}

export function createVisualResolutionState(
  input: VisualResolutionInput,
): VisualResolutionState {
  return {
    initialized: true,
    enabled: input.enabled,
    lastProcessedLogIndex: input.batch?.logIndex ?? -1,
    groupActive: input.enabled && isVisualResolutionPending(input.view),
    bufferedEvents: [],
    visualBatch: null,
    visualHpByUnitId: snapshotVisualHp(input.view),
    visualUnitsByUnitId: snapshotVisualUnits(input.view),
  };
}

export function advanceVisualResolution(
  state: VisualResolutionState,
  input: VisualResolutionInput,
): VisualResolutionState {
  if (!state.initialized || !input.enabled || !state.enabled) {
    return createVisualResolutionState(input);
  }

  const pending = isVisualResolutionPending(input.view);
  const freshBatch =
    input.batch && input.batch.logIndex > state.lastProcessedLogIndex
      ? input.batch
      : null;
  const groupActive = state.groupActive || pending;

  if (!freshBatch) {
    return groupActive === state.groupActive
      ? state
      : { ...state, groupActive, visualBatch: null };
  }

  if (pending) {
    return {
      ...state,
      lastProcessedLogIndex: freshBatch.logIndex,
      groupActive: true,
      bufferedEvents: [...state.bufferedEvents, ...freshBatch.events],
      visualBatch: null,
    };
  }

  if (groupActive) {
    const events = collapseCompletedVisualResolutionEvents([
      ...state.bufferedEvents,
      ...freshBatch.events,
    ]);
    return {
      ...state,
      lastProcessedLogIndex: freshBatch.logIndex,
      groupActive: false,
      bufferedEvents: [],
      visualBatch: { logIndex: freshBatch.logIndex, events },
      visualHpByUnitId: snapshotVisualHp(input.view),
      visualUnitsByUnitId: snapshotVisualUnits(input.view),
    };
  }

  return {
    ...state,
    lastProcessedLogIndex: freshBatch.logIndex,
    visualBatch: freshBatch,
    visualHpByUnitId: snapshotVisualHp(input.view),
    visualUnitsByUnitId: snapshotVisualUnits(input.view),
  };
}
