export interface SfxAudio {
  volume: number;
  currentTime: number;
  play(): Promise<void> | void;
}

export type SfxAudioFactory = (src: string) => SfxAudio | undefined;

function browserAudioFactory(src: string): SfxAudio | undefined {
  if (typeof Audio === "undefined") return undefined;
  return new Audio(src);
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export class SfxPlayer {
  private muted = false;
  private volume = 1;

  constructor(private readonly createAudio: SfxAudioFactory = browserAudioFactory) {}

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
  }

  getVolume(): number {
    return this.volume;
  }

  play(src: string | undefined, options: { volume?: number } = {}): boolean {
    if (!src || this.muted || this.volume <= 0) return false;

    try {
      const audio = this.createAudio(src);
      if (!audio) return false;
      audio.volume = clampVolume(this.volume * (options.volume ?? 1));
      audio.currentTime = 0;
      const playback = audio.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch(() => undefined);
      }
      return true;
    } catch {
      return false;
    }
  }
}

/** Shared player for gameplay. Settings UIs can update this instance. */
export const sfxPlayer = new SfxPlayer();

export function playSfx(src: string | undefined, options?: { volume?: number }): boolean {
  return sfxPlayer.play(src, options);
}
