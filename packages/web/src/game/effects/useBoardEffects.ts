import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "rules";
import {
  simplifyEffectsForReducedMotion,
  visibleUnitPositions,
} from "./boardEffects";
import {
  enqueueBoardEffects,
  pruneExpiredBoardEffects,
  shouldProcessEffectBatch,
} from "./effectQueue";
import { effectsFromEventBatch } from "./eventToEffects";
import type {
  BoardEventBatch,
  QueuedBoardEffect,
  VisibleUnitPositions,
} from "./types";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

export function useBoardEffects(params: {
  batch: BoardEventBatch | null | undefined;
  view: PlayerView;
  enabled: boolean;
  sessionKey: string | null | undefined;
}): { effects: QueuedBoardEffect[]; reducedMotion: boolean } {
  const { batch, view, enabled, sessionKey } = params;
  const reducedMotion = usePrefersReducedMotion();
  const [effects, setEffects] = useState<QueuedBoardEffect[]>([]);
  const lastProcessedLogIndexRef = useRef(-1);
  const positionSnapshotRef = useRef<VisibleUnitPositions | null>(null);
  const sequenceRef = useRef(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    initializedRef.current = false;
    lastProcessedLogIndexRef.current = -1;
    positionSnapshotRef.current = null;
    sequenceRef.current = 0;
    setEffects([]);
  }, [sessionKey]);

  useEffect(() => {
    const nextPositions = visibleUnitPositions(view);

    if (!initializedRef.current) {
      initializedRef.current = true;
      positionSnapshotRef.current = nextPositions;
      lastProcessedLogIndexRef.current = batch?.logIndex ?? -1;
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

    if (
      !batch ||
      !shouldProcessEffectBatch(lastProcessedLogIndexRef.current, batch.logIndex)
    ) {
      return;
    }

    const previousPositions = positionSnapshotRef.current ?? nextPositions;
    let incoming = effectsFromEventBatch(batch.events, {
      view,
      previousPositions,
    });
    if (reducedMotion) {
      incoming = simplifyEffectsForReducedMotion(incoming);
    }

    const now = Date.now();
    setEffects((current) => {
      const queued = enqueueBoardEffects({
        current: pruneExpiredBoardEffects(current, now),
        incoming,
        now,
        sequenceStart: sequenceRef.current,
      });
      sequenceRef.current = queued.nextSequence;
      return queued.effects;
    });
    lastProcessedLogIndexRef.current = batch.logIndex;
    positionSnapshotRef.current = nextPositions;
  }, [batch, enabled, reducedMotion, view]);

  useEffect(() => {
    if (effects.length === 0) return;
    const timer = window.setTimeout(() => {
      setEffects((current) => pruneExpiredBoardEffects(current, Date.now()));
    }, 100);
    return () => window.clearTimeout(timer);
  }, [effects]);

  return { effects, reducedMotion };
}
