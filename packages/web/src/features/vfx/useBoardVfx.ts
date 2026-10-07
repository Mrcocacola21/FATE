import { presentationBatchKey } from "../../game/effects/batchIdentity";
import {
  presentationBatchHasExpired,
  presentationBatchIsCurrent,
} from "../../game/effects/presentationSession";
import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "rules";
import { mapEventBatchToVfx } from "./vfxEventMapper";
import { visibleUnitPositions } from "./vfxGeometry";
import { usePrefersReducedMotion } from "./vfxPreferences";
import {
  enqueueBoardVfx,
  pruneExpiredBoardVfx,
  rememberProcessedVfxRequests,
  simplifyVfxForReducedMotion,
} from "./vfxQueue";
import type { BoardVfxEventBatch, QueuedBoardVfxRequest, VisibleUnitPositions } from "./vfxTypes";

export function useBoardVfx(params: {
  batch: BoardVfxEventBatch | null | undefined;
  view: PlayerView;
  enabled: boolean;
  sessionKey: string | null | undefined;
}): { effects: QueuedBoardVfxRequest[]; reducedMotion: boolean } {
  const { batch, view, enabled, sessionKey } = params;
  const reducedMotion = usePrefersReducedMotion();
  const [effects, setEffects] = useState<QueuedBoardVfxRequest[]>([]);
  const lastProcessedBatchKeyRef = useRef<string | null>(null);
  const positionSnapshotRef = useRef<VisibleUnitPositions | null>(null);
  const initializedRef = useRef(false);
  const processedRequestIdsRef = useRef<Set<string>>(new Set());
  const tokenRef = useRef<BoardVfxEventBatch["presentationToken"]>();

  useEffect(() => {
    initializedRef.current = false;
    lastProcessedBatchKeyRef.current = null;
    positionSnapshotRef.current = null;
    processedRequestIdsRef.current = new Set();
    setEffects([]);
  }, [sessionKey]);

  useEffect(() => {
    const nextPositions = visibleUnitPositions(view);

    if (!initializedRef.current) {
      initializedRef.current = true;
      positionSnapshotRef.current = nextPositions;
      lastProcessedBatchKeyRef.current = batch ? presentationBatchKey(batch) : null;
      return;
    }

    if (!enabled) {
      positionSnapshotRef.current = nextPositions;
      lastProcessedBatchKeyRef.current = batch ? presentationBatchKey(batch) : null;
      setEffects([]);
      return;
    }

    if (
      !batch ||
      !presentationBatchIsCurrent(batch) ||
      presentationBatchHasExpired(batch) ||
      lastProcessedBatchKeyRef.current === presentationBatchKey(batch)
    ) {
      return;
    }

    const previousPositions = positionSnapshotRef.current ?? nextPositions;
    let incoming = mapEventBatchToVfx({
      events: batch.events,
      view: batch.view ?? view,
      previousPositions,
      revision: batch.revision,
      presentationId: presentationBatchKey(batch),
      eventDelaysMs: batch.eventDelaysMs,
      combatCues: batch.combatCues,
    });
    tokenRef.current = batch.presentationToken;
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
        now: batch.playbackStartedAt ?? now,
      }),
    );
    lastProcessedBatchKeyRef.current = presentationBatchKey(batch);
    positionSnapshotRef.current = nextPositions;
  }, [batch, enabled, reducedMotion, view]);

  useEffect(() => {
    if (effects.length === 0) return;
    const timer = window.setTimeout(() => {
      setEffects((current) => pruneExpiredBoardVfx(current, Date.now()));
    }, 100);
    return () => window.clearTimeout(timer);
  }, [effects]);

  return { effects: tokenRef.current?.cancelled ? [] : effects, reducedMotion };
}
