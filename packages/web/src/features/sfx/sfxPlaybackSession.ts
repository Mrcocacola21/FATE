import type { PlayerView } from "rules";
import type { BoardEventBatch } from "../../game/effects/types";
import {
  presentationBatchHasExpired,
  presentationBatchIsCurrent,
} from "../../game/effects/presentationSession";
import { mapEventBatchToSfx } from "./sfxEventMapper";
import { sfxPlayer, type SfxPlayer } from "./sfxPlayer";
import { presentationIsVisible } from "../../game/effects/presentationVisibility";

const MAX_CUES = 512;
/** Scheduling jitter allowance, independent of the longer ordered-batch queue lifetime. */
export const MAX_AUDIO_CUE_LATENESS_MS = 500;

/** Defensive cue dedupe only. PresentationSession remains ingress authority. */
export class SfxPlaybackSession {
  private readonly consumed = new Set<string>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private currentView?: PlayerView;
  get diagnostics() {
    return { scheduledCues: this.timers.size, consumedCueIds: this.consumed.size };
  }
  constructor(
    private readonly player: Pick<
      SfxPlayer,
      "play" | "stopGameplay" | "isMuted" | "getVolume"
    > = sfxPlayer,
  ) {}

  schedule(batch: BoardEventBatch, view: PlayerView): void {
    this.updateView(view);
    if (
      batch.previewId ||
      !batch.streamId ||
      !presentationBatchIsCurrent(batch) ||
      presentationBatchHasExpired(batch)
    )
      return;
    const cues = mapEventBatchToSfx({ ...batch, view });
    for (const cue of cues) {
      if (this.consumed.has(cue.id)) continue;
      this.consumed.add(cue.id);
      if (!presentationIsVisible() || this.player.isMuted() || this.player.getVolume() <= 0)
        continue;
      const scheduledAt = (batch.playbackStartedAt ?? Date.now()) + (cue.delayMs ?? 0);
      const delayMs = Math.max(0, scheduledAt - Date.now());
      const play = () => {
        if (
          !presentationBatchIsCurrent(batch) ||
          !presentationIsVisible() ||
          Date.now() > scheduledAt + MAX_AUDIO_CUE_LATENESS_MS
        )
          return;
        if (cue.authorizedUnitId && !this.currentView?.units[cue.authorizedUnitId]?.position)
          return;
        if (cue.durationMs !== undefined) {
          const remainingMs = scheduledAt + cue.durationMs - Date.now();
          if (remainingMs <= 0) return;
          this.player.play({ ...cue, durationMs: remainingMs });
        } else this.player.play(cue);
      };
      if (delayMs === 0) play();
      else {
        if (this.timers.size >= MAX_CUES) {
          const oldest = this.timers.values().next().value!;
          clearTimeout(oldest);
          this.timers.delete(oldest);
        }
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          play();
        }, delayMs);
        this.timers.add(timer);
      }
    }
    for (const id of this.consumed) {
      if (this.consumed.size <= MAX_CUES) break;
      this.consumed.delete(id);
    }
  }
  updateView(view: PlayerView): void {
    this.currentView = view;
  }
  reset(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.consumed.clear();
    this.currentView = undefined;
    this.player.stopGameplay();
  }
}
