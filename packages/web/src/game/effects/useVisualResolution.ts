import { presentationBatchKey } from "./batchIdentity";
import {
  MAX_PRESENTATION_BATCHES,
  presentationBatchHasExpired,
  presentationBatchIsCurrent,
} from "./presentationSession";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PlayerView } from "rules";
import { usePrefersReducedMotion } from "../../features/vfx/vfxPreferences";
import {
  buildCombatVisualPlaybackPlan,
  combatVisualPlaybackFrame,
  type CombatVisualPlaybackPlan,
  type UnitVisualStateByUnitId,
  type CombatPresentationCue,
  type CombatVisualPlaybackFrame,
} from "./combatPlayback";
import type { BoardEventBatch } from "./types";
import { captureEffectReplay, type EffectReplayCapture } from "./effectReplay";
import type { TransportAttachment } from "./riverPresentation";
import {
  advanceVisualResolution,
  createVisualResolutionState,
  snapshotVisualHp,
  snapshotVisualUnits,
  visualHpSnapshotsEqual,
  type VisualHpByUnitId,
  type VisualResolutionState,
  type VisualUnitsByUnitId,
} from "./visualResolution";

const SNAPSHOT_SYNC_FALLBACK_MS = 1500;
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface RenderedVisualState {
  visualAttackByUnitId: CombatVisualPlaybackFrame["visualAttackByUnitId"];
  transportAttachments: TransportAttachment[];
  visualMotionByUnitId: CombatVisualPlaybackFrame["visualMotionByUnitId"];
  visualHpByUnitId: VisualHpByUnitId;
  visualUnitsByUnitId: VisualUnitsByUnitId;
  visualStateByUnitId: UnitVisualStateByUnitId;
  roll: Extract<CombatPresentationCue, { kind: "roll" }> | null;
}

function baseline(view: PlayerView): RenderedVisualState {
  return {
    visualAttackByUnitId: {},
    transportAttachments: [],
    visualMotionByUnitId: {},
    visualHpByUnitId: snapshotVisualHp(view),
    visualUnitsByUnitId: snapshotVisualUnits(view),
    visualStateByUnitId: {},
    roll: null,
  };
}

export function useVisualResolution(params: {
  batch: BoardEventBatch | null | undefined;
  batches?: BoardEventBatch[];
  onBatchesConsumed?: (batches: BoardEventBatch[]) => void;
  onReplayReady?: (batch: BoardEventBatch) => void;
  view: PlayerView;
  enabled: boolean;
  sessionKey: string | null | undefined;
}): {
  visualAttackByUnitId: CombatVisualPlaybackFrame["visualAttackByUnitId"];
  transportAttachments: TransportAttachment[];
  visualMotionByUnitId: CombatVisualPlaybackFrame["visualMotionByUnitId"];
  batch: BoardEventBatch | null;
  visualHpByUnitId: VisualHpByUnitId;
  visualUnitsByUnitId: VisualUnitsByUnitId;
  visualStateByUnitId: UnitVisualStateByUnitId;
  roll: Extract<CombatPresentationCue, { kind: "roll" }> | null;
} {
  const { batch, batches, onBatchesConsumed, onReplayReady, view, enabled, sessionKey } = params;
  const reducedMotion = usePrefersReducedMotion();
  const initialBatch = batches ? null : batch;
  const latestInputRef = useRef({ batch: initialBatch, view, enabled });
  latestInputRef.current = { batch: initialBatch, view, enabled };
  const [resolution, setResolution] = useState<VisualResolutionState>(() =>
    createVisualResolutionState({ batch: initialBatch, view, enabled }),
  );
  const resolutionRef = useRef(resolution);
  const [rendered, setRendered] = useState<RenderedVisualState>(() => baseline(view));
  const [plans, setPlans] = useState<CombatVisualPlaybackPlan[]>([]);
  const [playingBatch, setPlayingBatch] = useState<BoardEventBatch | null>(null);
  const renderedSessionKeyRef = useRef(sessionKey);
  const activePlan = plans[0] ?? null;
  const processedBatchKeysRef = useRef<Set<string>>(new Set());
  const replayCaptureRef = useRef<EffectReplayCapture | null>(null);
  const queuedTailRef = useRef<{
    hp: VisualHpByUnitId;
    units: VisualUnitsByUnitId;
    attachments: TransportAttachment[];
  }>({
    hp: rendered.visualHpByUnitId,
    units: rendered.visualUnitsByUnitId,
    attachments: [],
  });

  useBeforePaint(() => {
    renderedSessionKeyRef.current = sessionKey;
    const nextResolution = createVisualResolutionState(latestInputRef.current);
    const nextRendered = baseline(latestInputRef.current.view);
    resolutionRef.current = nextResolution;
    setResolution(nextResolution);
    setRendered(nextRendered);
    setPlans([]);
    setPlayingBatch(null);
    processedBatchKeysRef.current = new Set();
    replayCaptureRef.current = null;
    queuedTailRef.current = {
      hp: nextRendered.visualHpByUnitId,
      units: nextRendered.visualUnitsByUnitId,
      attachments: [],
    };
  }, [sessionKey]);

  useBeforePaint(() => {
    const incoming = batches ?? (batch ? [batch] : []);
    let current = resolutionRef.current;
    const nextPlans: CombatVisualPlaybackPlan[] = [];
    for (const inputBatch of incoming) {
      if (!presentationBatchIsCurrent(inputBatch)) continue;
      const batchView = inputBatch.view ?? view;
      current = advanceVisualResolution(current, { batch: inputBatch, view: batchView, enabled });
      const releasedBatch = current.visualBatch;
      if (!enabled || !releasedBatch) continue;
      const key = presentationBatchKey(releasedBatch);
      if (processedBatchKeysRef.current.has(key)) continue;
      processedBatchKeysRef.current.add(key);
      if (processedBatchKeysRef.current.size > MAX_PRESENTATION_BATCHES) {
        processedBatchKeysRef.current.delete(processedBatchKeysRef.current.values().next().value!);
      }
      if (presentationBatchHasExpired(releasedBatch)) continue;
      const starting = releasedBatch.replayStartingState ?? queuedTailRef.current;
      const plan = buildCombatVisualPlaybackPlan({
        batch: releasedBatch,
        startingHpByUnitId: starting.hp,
        startingUnitsByUnitId: starting.units,
        finalView: batchView,
        reducedMotion,
        holdResolvedState: !releasedBatch.previewId && current.groupActive,
        transportAttachments: starting.attachments,
      });
      if (onReplayReady && !releasedBatch.previewId) {
        const capture = captureEffectReplay(replayCaptureRef.current, plan, batchView,
          current.groupActive || Boolean(batchView.pendingRoll) || Boolean(batchView.pendingDecision));
        if (capture !== replayCaptureRef.current && capture && !capture.groupActive) {
          onReplayReady(capture.batch);
        }
        replayCaptureRef.current = capture;
      }
      if (releasedBatch.previewId) {
        // A preview can show old HP/positions, but always returns to the live board.
        plan.finalHpByUnitId = snapshotVisualHp(view);
        plan.finalUnitsByUnitId = snapshotVisualUnits(view);
        plan.transportAttachments = queuedTailRef.current.attachments;
      }
      plan.playbackSessionKey = sessionKey;
      queuedTailRef.current = { hp: plan.finalHpByUnitId, units: plan.finalUnitsByUnitId, attachments: plan.transportAttachments };
      nextPlans.push(plan);
    }
    if (incoming.length === 0) {
      current = advanceVisualResolution(current, { batch: null, view, enabled });
    }
    if (onReplayReady && replayCaptureRef.current?.groupActive && !current.groupActive &&
      !view.pendingRoll && !view.pendingDecision) {
      const capture = replayCaptureRef.current;
      replayCaptureRef.current = { groupActive: false, batch: { ...capture.batch, view } };
      onReplayReady(replayCaptureRef.current.batch);
    }
    resolutionRef.current = current;
    setResolution(current);
    if (nextPlans.length)
      setPlans((queued) => [...queued, ...nextPlans].slice(-MAX_PRESENTATION_BATCHES));
    if (batches?.length) onBatchesConsumed?.(batches);
  }, [batch, batches, enabled, onBatchesConsumed, onReplayReady, reducedMotion, view, sessionKey]);

  useBeforePaint(() => {
    const plan = activePlan;
    // Reset effects run in this same commit. Never restart a plan retained by
    // the previous render while those reset state updates are being applied.
    if (plan && plan.playbackSessionKey !== sessionKey) return;
    if (!plan) {
      setPlayingBatch(null);
      return;
    }
    if (!presentationBatchIsCurrent(plan.batch) || presentationBatchHasExpired(plan.batch)) {
      setPlans((current) => current.slice(1));
      setRendered(baseline(latestInputRef.current.view));
      return;
    }
    let animationFrame = 0;
    let cancelled = false;
    const startedAt = performance.now();
    setPlayingBatch({ ...plan.batch, playbackStartedAt: Date.now() });
    const initialFrame = combatVisualPlaybackFrame(plan, 0);
    setRendered({
      visualAttackByUnitId: initialFrame.visualAttackByUnitId,
      transportAttachments: initialFrame.transportAttachments,
      visualMotionByUnitId: initialFrame.visualMotionByUnitId,
      visualHpByUnitId: initialFrame.visualHpByUnitId,
      visualUnitsByUnitId: initialFrame.visualUnitsByUnitId,
      visualStateByUnitId: initialFrame.visualStateByUnitId,
      roll: initialFrame.roll,
    });

    const tick = (now: number) => {
      if (cancelled || !presentationBatchIsCurrent(plan.batch)) return;
      const frame = combatVisualPlaybackFrame(plan, now - startedAt);
      setRendered({
        visualAttackByUnitId: frame.visualAttackByUnitId,
        transportAttachments: frame.transportAttachments,
        visualMotionByUnitId: frame.visualMotionByUnitId,
        visualHpByUnitId: frame.visualHpByUnitId,
        visualUnitsByUnitId: frame.visualUnitsByUnitId,
        visualStateByUnitId: frame.visualStateByUnitId,
        roll: frame.roll,
      });
      if (frame.complete) {
        setPlans((current) => current.slice(1));
        return;
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [activePlan, sessionKey]);

  useEffect(() => {
    if (enabled) return;
    const next = baseline(view);
    setPlans([]);
    setPlayingBatch(null);
    setRendered(next);
    queuedTailRef.current = {
      hp: next.visualHpByUnitId,
      units: next.visualUnitsByUnitId,
      attachments: [],
    };
  }, [enabled, view]);

  useEffect(() => {
    if (!enabled || plans.length > 0 || resolution.groupActive || (view.pendingDecision && queuedTailRef.current.attachments.length > 0)) return;
    const authoritativeHp = snapshotVisualHp(view);
    const positionsEqual =
      Object.keys(view.units).length === Object.keys(rendered.visualUnitsByUnitId).length &&
      Object.values(view.units).every((unit) => {
        const position = rendered.visualUnitsByUnitId[unit.id]?.position;
        return position?.col === unit.position?.col && position?.row === unit.position?.row;
      });
    if (positionsEqual && visualHpSnapshotsEqual(rendered.visualHpByUnitId, authoritativeHp))
      return;

    // roomState normally arrives just before actionResult. A lost result or a
    // snapshot-only resync must eventually reconcile without replaying VFX.
    const timer = window.setTimeout(() => {
      const next = baseline(latestInputRef.current.view);
      setRendered(next);
      queuedTailRef.current = {
        hp: next.visualHpByUnitId,
        units: next.visualUnitsByUnitId,
        attachments: [],
      };
    }, SNAPSHOT_SYNC_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    plans.length,
    rendered.visualHpByUnitId,
    rendered.visualUnitsByUnitId,
    resolution.groupActive,
    view,
    sessionKey,
  ]);

  const currentRendered = renderedSessionKeyRef.current === sessionKey ? rendered : baseline(view);
  return {
    visualAttackByUnitId: currentRendered.visualAttackByUnitId,
    transportAttachments: currentRendered.transportAttachments,
    visualMotionByUnitId: currentRendered.visualMotionByUnitId,
    batch:
      playingBatch &&
      activePlan?.playbackSessionKey === sessionKey &&
      presentationBatchIsCurrent(playingBatch) &&
      !presentationBatchHasExpired(playingBatch)
        ? playingBatch
        : null,
    visualHpByUnitId: currentRendered.visualHpByUnitId,
    visualUnitsByUnitId: currentRendered.visualUnitsByUnitId,
    visualStateByUnitId: currentRendered.visualStateByUnitId,
    roll:
      playingBatch &&
      activePlan?.playbackSessionKey === sessionKey &&
      presentationBatchIsCurrent(playingBatch)
        ? currentRendered.roll
        : null,
  };
}
