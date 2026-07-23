import { useEffect, useRef } from "react";
import type { PlayerView } from "rules";
import type { BoardVfxEventBatch } from "../vfx/vfxTypes";
import { getInitialVfxLogIndex, shouldProcessVfxBatch } from "../vfx/vfxQueue";
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
  const lastProcessedLogIndexRef = useRef(-1);
  const processedRequestIdsRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const clearTimers = () => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
  };

  useEffect(() => {
    clearTimers();
    initializedRef.current = false;
    lastProcessedLogIndexRef.current = -1;
    processedRequestIdsRef.current = new Set();
  }, [sessionKey]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastProcessedLogIndexRef.current = getInitialVfxLogIndex(batch);
      return;
    }

    if (!enabled) {
      clearTimers();
      lastProcessedLogIndexRef.current = Math.max(
        lastProcessedLogIndexRef.current,
        batch?.logIndex ?? -1,
      );
      return;
    }

    if (!batch || !shouldProcessVfxBatch(lastProcessedLogIndexRef.current, batch.logIndex)) {
      return;
    }

    const incoming = mapEventBatchToSfx({
      events: batch.events,
      view,
      logIndex: batch.logIndex,
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
    lastProcessedLogIndexRef.current = batch.logIndex;
  }, [batch, enabled, view]);

  useEffect(
    () => () => {
      clearTimers();
    },
    [],
  );
}
