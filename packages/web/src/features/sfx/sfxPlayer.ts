import { resolveSound } from "../../assets/sfx/resolver";
import type { SoundKey } from "../../assets/sfx/registry";
import { AudioManager, clampVolume } from "./AudioManager";
import type { SoundCue } from "./sfxTypes";
import type { AssetPriority } from "../../assets/assetLoadQueue";

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
  preload(
    key: SoundKey,
    options: { priority?: AssetPriority; firstVariantOnly?: boolean } = {},
  ): Promise<void> {
    const sound = resolveSound(key, "preload");
    const sources = options.firstVariantOnly ? sound?.sources.slice(0, 1) : sound?.sources;
    return Promise.all(
      sources?.map((url) => this.audio.load(url, key, options.priority)) ?? [],
    ).then(() => undefined);
  }
  get diagnostics() {
    return this.audio.diagnostics;
  }
  retainUrls(core: readonly string[], roster: readonly string[]): void {
    this.audio.retainUrls(core, roster);
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
      void this.audio.load(cue.src, cue.key, "high");
      return false;
    }
    if (src !== cue.src) void this.audio.load(cue.src, cue.key, "low");
    const durationMs = Math.min(cue.durationMs ?? Infinity, cue.maxDurationMs ?? Infinity);
    return Boolean(
      this.audio.play(src, {
        key: cue.key,
        category: cue.category,
        gain: cue.gain,
        maxVoices: cue.maxVoices,
        durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
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
