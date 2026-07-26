import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "rules";
import { usePrefersReducedMotion } from "../../features/vfx/vfxPreferences";
import {
  buildCombatVisualPlaybackPlan,
  combatVisualPlaybackFrame,
  type CombatVisualPlaybackPlan,
  type UnitVisualStateByUnitId,
} from "./combatPlayback";
import type { BoardEventBatch } from "./types";
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

interface RenderedVisualState {
  visualHpByUnitId: VisualHpByUnitId;
  visualUnitsByUnitId: VisualUnitsByUnitId;
  visualStateByUnitId: UnitVisualStateByUnitId;
}

function baseline(view: PlayerView): RenderedVisualState {
  return {
    visualHpByUnitId: snapshotVisualHp(view),
    visualUnitsByUnitId: snapshotVisualUnits(view),
    visualStateByUnitId: {},
  };
}

export function useVisualResolution(params: {
  batch: BoardEventBatch | null | undefined;
  view: PlayerView;
  enabled: boolean;
  sessionKey: string | null | undefined;
}): {
  batch: BoardEventBatch | null;
  visualHpByUnitId: VisualHpByUnitId;
  visualUnitsByUnitId: VisualUnitsByUnitId;
  visualStateByUnitId: UnitVisualStateByUnitId;
} {
  const { batch, view, enabled, sessionKey } = params;
  const reducedMotion = usePrefersReducedMotion();
  const latestInputRef = useRef({ batch, view, enabled });
  latestInputRef.current = { batch, view, enabled };
  const [resolution, setResolution] = useState<VisualResolutionState>(() =>
    createVisualResolutionState({ batch, view, enabled }),
  );
  const [rendered, setRendered] = useState<RenderedVisualState>(() => baseline(view));
  const [plans, setPlans] = useState<CombatVisualPlaybackPlan[]>([]);
  const activePlan = plans[0] ?? null;
  const processedBatchIndexesRef = useRef<Set<number>>(new Set());
  const queuedTailRef = useRef<{
    hp: VisualHpByUnitId;
    units: VisualUnitsByUnitId;
  }>({
    hp: rendered.visualHpByUnitId,
    units: rendered.visualUnitsByUnitId,
  });

  useEffect(() => {
    const nextResolution = createVisualResolutionState(latestInputRef.current);
    const nextRendered = baseline(latestInputRef.current.view);
    setResolution(nextResolution);
    setRendered(nextRendered);
    setPlans([]);
    processedBatchIndexesRef.current = new Set();
    queuedTailRef.current = {
      hp: nextRendered.visualHpByUnitId,
      units: nextRendered.visualUnitsByUnitId,
    };
  }, [sessionKey]);

  useEffect(() => {
    setResolution((current) =>
      advanceVisualResolution(current, { batch, view, enabled }),
    );
  }, [batch, enabled, view]);

  useEffect(() => {
    const releasedBatch = resolution.visualBatch;
    if (
      !enabled ||
      !releasedBatch ||
      processedBatchIndexesRef.current.has(releasedBatch.logIndex)
    ) {
      return;
    }
    processedBatchIndexesRef.current.add(releasedBatch.logIndex);
    const starting = queuedTailRef.current;
    const plan = buildCombatVisualPlaybackPlan({
      batch: releasedBatch,
      startingHpByUnitId: starting.hp,
      startingUnitsByUnitId: starting.units,
      finalView: view,
      reducedMotion,
    });
    queuedTailRef.current = {
      hp: plan.finalHpByUnitId,
      units: plan.finalUnitsByUnitId,
    };
    setPlans((current) => [...current, plan]);
  }, [enabled, reducedMotion, resolution.visualBatch, view]);

  useEffect(() => {
    const plan = activePlan;
    if (!plan) return;
    let animationFrame = 0;
    const startedAt = performance.now();
    const initialFrame = combatVisualPlaybackFrame(plan, 0);
    setRendered({
      visualHpByUnitId: initialFrame.visualHpByUnitId,
      visualUnitsByUnitId: initialFrame.visualUnitsByUnitId,
      visualStateByUnitId: initialFrame.visualStateByUnitId,
    });

    const tick = (now: number) => {
      const frame = combatVisualPlaybackFrame(plan, now - startedAt);
      setRendered({
        visualHpByUnitId: frame.visualHpByUnitId,
        visualUnitsByUnitId: frame.visualUnitsByUnitId,
        visualStateByUnitId: frame.visualStateByUnitId,
      });
      if (frame.complete) {
        setPlans((current) => current.slice(1));
        return;
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activePlan]);

  useEffect(() => {
    if (enabled) return;
    const next = baseline(view);
    setPlans([]);
    setRendered(next);
    queuedTailRef.current = {
      hp: next.visualHpByUnitId,
      units: next.visualUnitsByUnitId,
    };
  }, [enabled, view]);

  useEffect(() => {
    if (!enabled || plans.length > 0 || resolution.groupActive) return;
    const authoritativeHp = snapshotVisualHp(view);
    if (visualHpSnapshotsEqual(rendered.visualHpByUnitId, authoritativeHp)) return;

    // roomState normally arrives just before actionResult. A lost result or a
    // snapshot-only resync must eventually reconcile without replaying VFX.
    const timer = window.setTimeout(() => {
      const next = baseline(latestInputRef.current.view);
      setRendered(next);
      queuedTailRef.current = {
        hp: next.visualHpByUnitId,
        units: next.visualUnitsByUnitId,
      };
    }, SNAPSHOT_SYNC_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [
    enabled,
    plans.length,
    rendered.visualHpByUnitId,
    resolution.groupActive,
    view,
  ]);

  return {
    batch: activePlan?.batch ?? null,
    visualHpByUnitId: rendered.visualHpByUnitId,
    visualUnitsByUnitId: rendered.visualUnitsByUnitId,
    visualStateByUnitId: rendered.visualStateByUnitId,
  };
}
