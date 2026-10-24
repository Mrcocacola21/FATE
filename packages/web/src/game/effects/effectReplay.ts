import type { PlayerView } from "rules";
import type { CombatVisualPlaybackPlan } from "./combatPlayback";
import type { BoardEventBatch, VisibleUnitPositions } from "./types";
import { effectsFromEventBatch } from "./eventToEffects";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";

export interface EffectReplayCapture {
  batch: BoardEventBatch;
  groupActive: boolean;
}

/** Capture released visuals, including earlier manual dice, after chain buffering. */
export function captureEffectReplay(
  previous: EffectReplayCapture | null,
  plan: CombatVisualPlaybackPlan,
  view: PlayerView,
  groupActive: boolean,
): EffectReplayCapture | null {
  if (plan.batch.previewId) return previous;
  const previousPositions: VisibleUnitPositions = {};
  for (const unit of Object.values(plan.startingUnitsByUnitId)) {
    if (unit.position) previousPositions[unit.id] = unit.position;
  }
  const hasVisuals =
    plan.queue.length > 0 ||
    (plan.batch.combatCues?.length ?? 0) > 0 ||
    effectsFromEventBatch(plan.batch.events, { view, previousPositions }).length > 0 ||
    mapEventBatchToVfx({ ...plan.batch, view, previousPositions }).length > 0;
  if (!hasVisuals && !previous?.groupActive) return previous;

  const continuing = previous?.groupActive && previous.batch.streamId === plan.batch.streamId;
  const events = [...(continuing ? previous.batch.events : []), ...plan.batch.events];
  const seen = new Set<string>();
  return {
    groupActive,
    batch: {
      revision: plan.batch.revision,
      streamId: plan.batch.streamId,
      presentationToken: plan.batch.presentationToken,
      view,
      events: events
        .filter((event) => {
          if (!event.eventId) return true;
          if (seen.has(event.eventId)) return false;
          seen.add(event.eventId);
          return true;
        })
        .slice(-1024),
      replayStartingState: continuing
        ? previous.batch.replayStartingState
        : {
            hp: plan.startingHpByUnitId,
            units: plan.startingUnitsByUnitId,
            attachments: plan.startingTransportAttachments,
          },
    },
  };
}
