import type { PlayerView } from "rules";
import type { BoardEventBatch } from "../../game/effects/types";
import {
  MAX_PRESENTATION_AGE_MS,
  presentationBatchHasExpired,
  presentationBatchIsCurrent,
} from "../../game/effects/presentationSession";
import { mapEventBatchToSfx } from "./sfxEventMapper";
import { sfxPlayer, type SfxPlayer } from "./sfxPlayer";

const MAX_CUES = 512;

/** Defensive cue dedupe only. PresentationSession remains ingress authority. */
export class SfxPlaybackSession {
  private readonly consumed = new Set<string>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  constructor(
    private readonly player: Pick<
      SfxPlayer,
      "play" | "stopGameplay" | "isMuted" | "getVolume"
    > = sfxPlayer,
  ) {}

  schedule(batch: BoardEventBatch, view: PlayerView): void {
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
      if (this.player.isMuted() || this.player.getVolume() <= 0) continue;
      const delayMs = Math.max(0, cue.delayMs ?? 0);
      const scheduledAt = Date.now() + delayMs;
      const play = () => {
        if (
          !presentationBatchIsCurrent(batch) ||
          Date.now() > scheduledAt + MAX_PRESENTATION_AGE_MS
        )
          return;
        this.player.play(cue);
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
  reset(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.consumed.clear();
    this.player.stopGameplay();
  }
}
