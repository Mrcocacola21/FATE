import type { GameEvent, PlayerView } from "rules";
import type { BoardEventBatch } from "./types";

export type VisualHpByUnitId = Record<string, number>;
export type VisualUnitsByUnitId = PlayerView["units"];

export interface VisualResolutionState {
  initialized: boolean;
  enabled: boolean;
  lastProcessedLogIndex: number;
  groupActive: boolean;
  deferredVisualsByChainId: Map<string, GameEvent[]>;
  /** Compatibility buffer for older servers that expose only pending queue state. */
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
 * Remove only bookkeeping events duplicated by the aggregate AoE marker.
 * Per-target attack events are retained because they carry the ordered HP
 * snapshots needed by gradual playback. The effects mapper suppresses the
 * aggregate event's duplicate target flashes while keeping its area/ability VFX.
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
  return events.filter(
    (event) => !REDUNDANT_AGGREGATED_EVENT_TYPES.has(event.type),
  );
}

export function createVisualResolutionState(
  input: VisualResolutionInput,
): VisualResolutionState {
  return {
    initialized: true,
    enabled: input.enabled,
    lastProcessedLogIndex: input.batch?.logIndex ?? -1,
    groupActive: input.enabled && isVisualResolutionPending(input.view),
    deferredVisualsByChainId: new Map(),
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
  const groupActive =
    state.groupActive ||
    pending ||
    state.deferredVisualsByChainId.size > 0;

  if (!freshBatch) {
    return groupActive === state.groupActive
      ? state
      : { ...state, groupActive, visualBatch: null };
  }

  const deferredVisualsByChainId = new Map(state.deferredVisualsByChainId);
  let legacyBufferedEvents = [...state.bufferedEvents];
  const playableEvents: GameEvent[] = [];
  let explicitChainEventSeen = false;

  for (const event of freshBatch.events) {
    const chainId = event.chainId ?? event.visualBatchId;
    if (chainId && event.isChainComplete) {
      explicitChainEventSeen = true;
      playableEvents.push(...(deferredVisualsByChainId.get(chainId) ?? []));
      deferredVisualsByChainId.delete(chainId);
      continue;
    }
    if (chainId && event.deferVisuals) {
      explicitChainEventSeen = true;
      const buffered = deferredVisualsByChainId.get(chainId) ?? [];
      deferredVisualsByChainId.set(chainId, [...buffered, event]);
      continue;
    }
    playableEvents.push(event);
  }

  if (explicitChainEventSeen) {
    if (legacyBufferedEvents.length > 0 && !pending) {
      playableEvents.unshift(...legacyBufferedEvents);
      legacyBufferedEvents = [];
    }
  } else if (pending) {
    legacyBufferedEvents.push(...playableEvents.splice(0));
  } else if (groupActive && legacyBufferedEvents.length > 0) {
    playableEvents.unshift(...legacyBufferedEvents);
    legacyBufferedEvents = [];
  }

  const nextGroupActive =
    pending ||
    deferredVisualsByChainId.size > 0 ||
    legacyBufferedEvents.length > 0;

  if (playableEvents.length === 0) {
    return {
      ...state,
      lastProcessedLogIndex: freshBatch.logIndex,
      groupActive: nextGroupActive,
      deferredVisualsByChainId,
      bufferedEvents: legacyBufferedEvents,
      visualBatch: null,
    };
  }

  if (groupActive || explicitChainEventSeen) {
    const events = collapseCompletedVisualResolutionEvents(playableEvents);
    return {
      ...state,
      lastProcessedLogIndex: freshBatch.logIndex,
      groupActive: nextGroupActive,
      deferredVisualsByChainId,
      bufferedEvents: legacyBufferedEvents,
      visualBatch: { logIndex: freshBatch.logIndex, events },
      visualHpByUnitId: nextGroupActive
        ? state.visualHpByUnitId
        : snapshotVisualHp(input.view),
      visualUnitsByUnitId: nextGroupActive
        ? state.visualUnitsByUnitId
        : snapshotVisualUnits(input.view),
    };
  }

  return {
    ...state,
    lastProcessedLogIndex: freshBatch.logIndex,
    groupActive: nextGroupActive,
    deferredVisualsByChainId,
    bufferedEvents: legacyBufferedEvents,
    visualBatch: { logIndex: freshBatch.logIndex, events: playableEvents },
    visualHpByUnitId: snapshotVisualHp(input.view),
    visualUnitsByUnitId: snapshotVisualUnits(input.view),
  };
}
