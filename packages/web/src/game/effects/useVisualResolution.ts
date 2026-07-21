import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "rules";
import type { BoardEventBatch } from "./types";
import {
  advanceVisualResolution,
  createVisualResolutionState,
  snapshotVisualHp,
  visualHpSnapshotsEqual,
  type VisualHpByUnitId,
  type VisualResolutionState,
  type VisualUnitsByUnitId,
} from "./visualResolution";

const SNAPSHOT_SYNC_FALLBACK_MS = 1500;

export function useVisualResolution(params: {
  batch: BoardEventBatch | null | undefined;
  view: PlayerView;
  enabled: boolean;
  sessionKey: string | null | undefined;
}): {
  batch: BoardEventBatch | null;
  visualHpByUnitId: VisualHpByUnitId;
  visualUnitsByUnitId: VisualUnitsByUnitId;
} {
  const { batch, view, enabled, sessionKey } = params;
  const latestInputRef = useRef({ batch, view, enabled });
  latestInputRef.current = { batch, view, enabled };
  const [state, setState] = useState<VisualResolutionState>(() =>
    createVisualResolutionState({ batch, view, enabled }),
  );

  useEffect(() => {
    setState(createVisualResolutionState(latestInputRef.current));
  }, [sessionKey]);

  useEffect(() => {
    setState((current) =>
      advanceVisualResolution(current, { batch, view, enabled }),
    );
  }, [batch, enabled, view]);

  useEffect(() => {
    if (!enabled || state.groupActive) return;
    const authoritativeHp = snapshotVisualHp(view);
    if (visualHpSnapshotsEqual(state.visualHpByUnitId, authoritativeHp)) return;

    // roomState normally arrives just before its actionResult. If that result is
    // lost (or this is a snapshot-only resync), do not leave visual HP stale.
    const timer = window.setTimeout(() => {
      setState(createVisualResolutionState(latestInputRef.current));
    }, SNAPSHOT_SYNC_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, state.groupActive, state.visualHpByUnitId, view]);

  return {
    batch: state.visualBatch,
    visualHpByUnitId: state.visualHpByUnitId,
    visualUnitsByUnitId: state.visualUnitsByUnitId,
  };
}
