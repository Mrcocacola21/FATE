import { resolveSound } from "../../assets/sfx/resolver";
import type { SoundKey } from "../../assets/sfx/registry";
import { AudioManager, clampVolume } from "./AudioManager";
import type { SoundCue } from "./sfxTypes";

/** Existing facade; Web Audio nodes and decoded buffers stay behind this API. */
export class SfxPlayer {
  private muted = false;
  private volume = 1;
  constructor(private readonly audio = new AudioManager()) {}

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.audio.setMaster(muted, this.volume);
  }
  isMuted(): boolean {
    return this.muted;
  }
  setVolume(volume: number): void {
    this.volume = clampVolume(volume);
    this.audio.setMaster(this.muted, this.volume);
  }
  getVolume(): number {
    return this.volume;
  }
  ensureAudioReady(): Promise<boolean> {
    return this.audio.ensureAudioReady();
  }
  preload(key: SoundKey): Promise<void> {
    const sound = resolveSound(key, "preload");
    return Promise.all(sound?.sources.map((url) => this.audio.load(url, key)) ?? []).then(
      () => undefined,
    );
  }
  stopGameplay(): void {
    this.audio.stopCategory("gameplay");
  }

  play(cue: SoundCue | string | undefined, options: { volume?: number } = {}): boolean {
    if (!cue || this.muted || this.volume <= 0) return false;
    if (typeof cue === "string") {
      if (!this.audio.isReady(cue)) {
        void this.audio.load(cue);
        return false;
      }
      return Boolean(this.audio.play(cue, { gain: options.volume }));
    }
    // Another decoded variant of the same semantic sound is a safe fallback.
    const src = this.audio.isReady(cue.src)
      ? cue.src
      : cue.sources.find((url) => this.audio.isReady(url));
    if (!src) {
      void this.preload(cue.key);
      return false;
    }
    return Boolean(
      this.audio.play(src, {
        key: cue.key,
        category: cue.category,
        gain: cue.gain,
        maxVoices: cue.maxVoices,
      }),
    );
  }
}

export const sfxPlayer = new SfxPlayer();
export function ensureAudioReady(): Promise<boolean> {
  return sfxPlayer.ensureAudioReady();
}
export function playSfx(
  cue: SoundCue | string | undefined,
  options?: { volume?: number },
): boolean {
  return sfxPlayer.play(cue, options);
}
