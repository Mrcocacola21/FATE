import { useEffect, useRef } from "react";
import type { PlayerView } from "rules";
import { HERO_SANS_ID } from "../../rulesHints";
import type { BoardEventBatch } from "../../game/effects/types";
import {
  preloadCoreSounds,
  preloadSansSounds,
  preloadAsgoreSounds,
  preloadRiverSounds,
  preloadRosterSounds,
} from "./audioPreload";
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
  const needsSansSounds = Object.values(view.units).some(
    (unit) => unit.heroId === HERO_SANS_ID || Boolean(unit.sansLastAttackCurseSourceId),
  );
  const needsAsgoreSounds = Object.values(view.units).some((unit) => unit.heroId === "asgore");
  const needsRiverSounds = Object.values(view.units).some((unit) => unit.heroId === "riverPerson");
  const remainingRoster = [
    ...new Set(
      Object.values(view.units)
        .map((unit) => unit.heroId)
        .filter(
          (id): id is string => Boolean(id) && !["sans", "asgore", "riverPerson"].includes(id!),
        ),
    ),
  ]
    .sort()
    .join(",");
  useEffect(() => {
    if (enabled && remainingRoster) void preloadRosterSounds(remainingRoster.split(","));
  }, [enabled, remainingRoster]);

  useEffect(() => {
    void preloadCoreSounds("gameplay");
  }, []);
  useEffect(() => {
    if (enabled && needsSansSounds) void preloadSansSounds();
  }, [enabled, needsSansSounds]);
  useEffect(() => {
    if (enabled && needsAsgoreSounds) void preloadAsgoreSounds();
  }, [enabled, needsAsgoreSounds]);
  useEffect(() => {
    if (enabled && needsRiverSounds) void preloadRiverSounds();
  }, [enabled, needsRiverSounds]);
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
    sessionRef.current!.updateView(view);
    if (!enabled) {
      sessionRef.current!.reset();
      baselineRef.current = batch;
      return;
    }
    if (batch && batch !== baselineRef.current) sessionRef.current!.schedule(batch, view);
  }, [batch, enabled, view]);
}
