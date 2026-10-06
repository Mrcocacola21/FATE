import { presentationBatchKey } from "../../game/effects/batchIdentity";
import { useEffect, useRef } from "react";
import type { PlayerView } from "rules";
import type { BoardVfxEventBatch } from "../vfx/vfxTypes";
import { mapEventBatchToSfx } from "./sfxEventMapper";
import { sfxPlayer } from "./sfxPlayer";

const MAX_PROCESSED_SFX_IDS = 512;

function trimProcessedIds(ids: Set<string>): void {
  for (const id of ids) {
    if (ids.size <= MAX_PROCESSED_SFX_IDS) break;
    ids.delete(id);
  }
}

export function useBoardSfx(params: {
  batch: BoardVfxEventBatch | null | undefined;
  view: PlayerView;
  enabled: boolean;
  sessionKey: string | null | undefined;
}): void {
  const { batch, view, enabled, sessionKey } = params;
  const initializedRef = useRef(false);
  const lastProcessedBatchKeyRef = useRef<string | null>(null);
  const processedRequestIdsRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const clearTimers = () => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
  };

  useEffect(() => {
    clearTimers();
    initializedRef.current = false;
    lastProcessedBatchKeyRef.current = null;
    processedRequestIdsRef.current = new Set();
  }, [sessionKey]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastProcessedBatchKeyRef.current = batch ? presentationBatchKey(batch) : null;
      return;
    }

    if (!enabled) {
      clearTimers();
      lastProcessedBatchKeyRef.current = batch ? presentationBatchKey(batch) : null;
      return;
    }

    if (!batch || lastProcessedBatchKeyRef.current === presentationBatchKey(batch)) {
      return;
    }

    const incoming = mapEventBatchToSfx({
      events: batch.events,
      view,
      revision: batch.revision,
      presentationId: presentationBatchKey(batch),
      eventDelaysMs: batch.eventDelaysMs,
    }).filter((request) => !processedRequestIdsRef.current.has(request.id));

    for (const request of incoming) {
      processedRequestIdsRef.current.add(request.id);
      const delayMs = Math.max(0, request.delayMs ?? 0);
      if (delayMs === 0) {
        sfxPlayer.play(request.src);
        continue;
      }
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        sfxPlayer.play(request.src);
      }, delayMs);
      timersRef.current.add(timer);
    }
    trimProcessedIds(processedRequestIdsRef.current);
    lastProcessedBatchKeyRef.current = presentationBatchKey(batch);
  }, [batch, enabled, view]);

  useEffect(
    () => () => {
      clearTimers();
    },
    [],
  );
}
