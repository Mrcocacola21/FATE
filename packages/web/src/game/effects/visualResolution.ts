import type { ProjectedGameEvent, PlayerView } from "rules";
import type { BoardEventBatch, PresentationEvent } from "./types";

const MAX_DEFERRED_CHAINS = 64;
const MAX_DEFERRED_EVENTS = 1024;

export type VisualHpByUnitId = Record<string, number>;
export type VisualUnitsByUnitId = PlayerView["units"];

export interface VisualResolutionState {
  initialized: boolean;
  enabled: boolean;
  lastProcessedRevision: number;
  streamId: string | undefined;
  lastPreviewId: string | undefined;
  groupActive: boolean;
  deferredVisualsByChainId: Map<string, PresentationEvent[]>;
  /** Compatibility buffer for older servers that expose only pending queue state. */
  bufferedEvents: PresentationEvent[];
  visualBatch: BoardEventBatch | null;
  visualHpByUnitId: VisualHpByUnitId;
  visualUnitsByUnitId: VisualUnitsByUnitId;
}

export interface VisualResolutionInput {
  batch: BoardEventBatch | null | undefined;
  view: PlayerView;
  enabled: boolean;
}

const REDUNDANT_AGGREGATED_EVENT_TYPES = new Set<ProjectedGameEvent["type"]>([
  "carpetStrikeTriggered",
  "carpetStrikeCenter",
  "carpetStrikeAttackRolled",
]);

export function snapshotVisualHp(view: PlayerView): VisualHpByUnitId {
  return Object.fromEntries(Object.values(view.units).map((unit) => [unit.id, unit.hp]));
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

export function visualHpSnapshotsEqual(left: VisualHpByUnitId, right: VisualHpByUnitId): boolean {
  const leftIds = Object.keys(left);
  const rightIds = Object.keys(right);
  return (
    leftIds.length === rightIds.length && leftIds.every((unitId) => left[unitId] === right[unitId])
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
  events: PresentationEvent[],
): PresentationEvent[] {
  const aggregateEvents = events.filter(
    (event): event is Extract<ProjectedGameEvent, { type: "aoeResolved" }> => event.type === "aoeResolved",
  );
  if (aggregateEvents.length === 0) {
    return events;
  }
  return events.filter((event) => !REDUNDANT_AGGREGATED_EVENT_TYPES.has(event.type));
}

export function createVisualResolutionState(input: VisualResolutionInput): VisualResolutionState {
  return {
    initialized: true,
    enabled: input.enabled,
    lastProcessedRevision: input.batch?.previewId ? -1 : (input.batch?.revision ?? -1),
    streamId: input.batch?.streamId,
    lastPreviewId: undefined,
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

  if (input.batch?.previewId) {
    if (input.batch.previewId === state.lastPreviewId) return state;
    return { ...state, lastPreviewId: input.batch.previewId, visualBatch: input.batch };
  }
  if (input.batch && input.batch.streamId !== state.streamId) {
    state = createVisualResolutionState({ ...input, batch: null });
    state.streamId = input.batch.streamId;
  }

  const pending = isVisualResolutionPending(input.view);
  const freshBatch =
    input.batch && input.batch.revision > state.lastProcessedRevision ? input.batch : null;
  const groupActive = state.groupActive || pending || state.deferredVisualsByChainId.size > 0;

  if (!freshBatch) {
    return groupActive === state.groupActive ? state : { ...state, groupActive, visualBatch: null };
  }

  const deferredVisualsByChainId = new Map(state.deferredVisualsByChainId);
  let legacyBufferedEvents = [...state.bufferedEvents];
  const playableEvents: PresentationEvent[] = [];
  let explicitChainEventSeen = false;

  for (const event of freshBatch.events) {
    // Dice are needed for the next manual decision even while outcomes defer.
    if (event.type === "rollResolved") {
      playableEvents.push(event);
      continue;
    }
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
      deferredVisualsByChainId.set(chainId, [...buffered, event].slice(-MAX_DEFERRED_EVENTS));
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
    const earlyRolls = playableEvents.filter(event => event.type === "rollResolved");
    legacyBufferedEvents.push(...playableEvents.filter(event => event.type !== "rollResolved"));
    playableEvents.splice(0, playableEvents.length, ...earlyRolls);
  } else if (groupActive && legacyBufferedEvents.length > 0) {
    playableEvents.unshift(...legacyBufferedEvents);
    legacyBufferedEvents = [];
  }

  const nextGroupActive =
    pending || deferredVisualsByChainId.size > 0 || legacyBufferedEvents.length > 0;

  // Cosmetic overload is allowed to drop oldest work; retained work is never
  // sent through transport dedupe a second time when its chain completes.
  legacyBufferedEvents = legacyBufferedEvents.slice(-MAX_DEFERRED_EVENTS);
  let retained = 0;
  for (const [chainId, events] of [...deferredVisualsByChainId].reverse()) {
    retained += events.length;
    if (retained > MAX_DEFERRED_EVENTS) deferredVisualsByChainId.delete(chainId);
  }
  while (deferredVisualsByChainId.size > MAX_DEFERRED_CHAINS) {
    deferredVisualsByChainId.delete(deferredVisualsByChainId.keys().next().value!);
  }

  if (playableEvents.length === 0) {
    return {
      ...state,
      lastProcessedRevision: freshBatch.revision,
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
      lastProcessedRevision: freshBatch.revision,
      groupActive: nextGroupActive,
      deferredVisualsByChainId,
      bufferedEvents: legacyBufferedEvents,
      visualBatch: { ...freshBatch, events },
      visualHpByUnitId: nextGroupActive ? state.visualHpByUnitId : snapshotVisualHp(input.view),
      visualUnitsByUnitId: nextGroupActive
        ? state.visualUnitsByUnitId
        : snapshotVisualUnits(input.view),
    };
  }

  return {
    ...state,
    lastProcessedRevision: freshBatch.revision,
    groupActive: nextGroupActive,
    deferredVisualsByChainId,
    bufferedEvents: legacyBufferedEvents,
    visualBatch: { ...freshBatch, events: playableEvents },
    visualHpByUnitId: snapshotVisualHp(input.view),
    visualUnitsByUnitId: snapshotVisualUnits(input.view),
  };
}
