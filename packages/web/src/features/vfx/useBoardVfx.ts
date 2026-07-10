import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "rules";
import { mapEventBatchToVfx } from "./vfxEventMapper";
import { visibleUnitPositions } from "./vfxGeometry";
import { usePrefersReducedMotion } from "./vfxPreferences";
import {
  enqueueBoardVfx,
  getInitialVfxLogIndex,
  pruneExpiredBoardVfx,
  rememberProcessedVfxRequests,
  shouldProcessVfxBatch,
  simplifyVfxForReducedMotion,
} from "./vfxQueue";
import type {
  BoardVfxEventBatch,
  QueuedBoardVfxRequest,
  VisibleUnitPositions,
} from "./vfxTypes";

export function useBoardVfx(params: {
  batch: BoardVfxEventBatch | null | undefined;
  view: PlayerView;
  enabled: boolean;
  sessionKey: string | null | undefined;
}): { effects: QueuedBoardVfxRequest[]; reducedMotion: boolean } {
  const { batch, view, enabled, sessionKey } = params;
  const reducedMotion = usePrefersReducedMotion();
  const [effects, setEffects] = useState<QueuedBoardVfxRequest[]>([]);
  const lastProcessedLogIndexRef = useRef(-1);
  const positionSnapshotRef = useRef<VisibleUnitPositions | null>(null);
  const initializedRef = useRef(false);
  const processedRequestIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    initializedRef.current = false;
    lastProcessedLogIndexRef.current = -1;
    positionSnapshotRef.current = null;
    processedRequestIdsRef.current = new Set();
    setEffects([]);
  }, [sessionKey]);

  useEffect(() => {
    const nextPositions = visibleUnitPositions(view);

    if (!initializedRef.current) {
      initializedRef.current = true;
      positionSnapshotRef.current = nextPositions;
      lastProcessedLogIndexRef.current = getInitialVfxLogIndex(batch);
      return;
    }

    if (!enabled) {
      positionSnapshotRef.current = nextPositions;
      lastProcessedLogIndexRef.current = Math.max(
        lastProcessedLogIndexRef.current,
        batch?.logIndex ?? -1,
      );
      setEffects([]);
      return;
    }

    if (!batch || !shouldProcessVfxBatch(lastProcessedLogIndexRef.current, batch.logIndex)) {
      return;
    }

    const previousPositions = positionSnapshotRef.current ?? nextPositions;
    let incoming = mapEventBatchToVfx({
      events: batch.events,
      view,
      previousPositions,
      logIndex: batch.logIndex,
    });
    if (reducedMotion) {
      incoming = simplifyVfxForReducedMotion(incoming);
    }
    incoming = incoming.filter((request) => !processedRequestIdsRef.current.has(request.id));
    rememberProcessedVfxRequests(processedRequestIdsRef.current, incoming);

    const now = Date.now();
    setEffects((current) =>
      enqueueBoardVfx({
        current: pruneExpiredBoardVfx(current, now),
        incoming,
        now,
      }),
    );
    lastProcessedLogIndexRef.current = batch.logIndex;
    positionSnapshotRef.current = nextPositions;
  }, [batch, enabled, reducedMotion, view]);

  useEffect(() => {
    if (effects.length === 0) return;
    const timer = window.setTimeout(() => {
      setEffects((current) => pruneExpiredBoardVfx(current, Date.now()));
    }, 100);
    return () => window.clearTimeout(timer);
  }, [effects]);

  return { effects, reducedMotion };
}
