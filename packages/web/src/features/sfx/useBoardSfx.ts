import { useEffect, useRef } from "react";
import type { PlayerView } from "rules";
import type { BoardEventBatch } from "../../game/effects/types";
import { preloadCoreSounds } from "./audioPreload";
import { SfxPlaybackSession } from "./sfxPlaybackSession";

export function useBoardSfx(params: {
  batch: BoardEventBatch | null | undefined;
  view: PlayerView;
  enabled: boolean;
  sessionKey: string | null | undefined;
}): void {
  const { batch, view, enabled, sessionKey } = params;
  const sessionRef = useRef<SfxPlaybackSession>();
  if (!sessionRef.current) sessionRef.current = new SfxPlaybackSession();
  const baselineRef = useRef<BoardEventBatch | null | undefined>(batch);

  useEffect(() => {
    void preloadCoreSounds("gameplay");
  }, []);
  useEffect(() => {
    const session = sessionRef.current!;
    session.reset();
    // A batch already present on mounting/reset is hydration, not a new cue.
    baselineRef.current = batch;
    return () => session.reset();
    // The incoming batch is intentionally not a reset dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);
  useEffect(() => {
    if (!enabled) {
      sessionRef.current!.reset();
      baselineRef.current = batch;
      return;
    }
    if (batch && batch !== baselineRef.current) sessionRef.current!.schedule(batch, view);
  }, [batch, enabled, view]);
}
