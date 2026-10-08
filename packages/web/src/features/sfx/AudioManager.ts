import type { SoundCategory } from "../../assets/sfx/registry";

export function clampVolume(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
}

export interface PlaybackHandle {
  stop(): void;
}
type Voice = PlaybackHandle & { key: string; category: SoundCategory };

/** Application-lifetime assets, independent of match playback lifetime. */
export class AudioManager {
  private context?: AudioContext;
  private master?: GainNode;
  private categories?: Record<SoundCategory, GainNode>;
  private readonly decodedBufferCache = new Map<string, AudioBuffer>();
  private readonly inFlightLoadCache = new Map<string, Promise<AudioBuffer | undefined>>();
  private readonly failedUrls = new Set<string>();
  private readonly voices = new Set<Voice>();
  private muted = false;
  private volume = 1;
  private resumePromise?: Promise<boolean>;

  constructor(
    private readonly createContext = (): AudioContext | undefined =>
      typeof AudioContext === "undefined" ? undefined : new AudioContext(),
    private readonly fetchAsset: typeof fetch = (...args) => fetch(...args),
    private readonly diagnose = (key: string, url: string): void => {
      if (import.meta.env?.DEV) console.warn(`[SFX] Unable to load ${key}: ${url}`);
    },
  ) {}

  private getContext(): AudioContext | undefined {
    if (this.context) return this.context;
    try {
      const context = this.createContext();
      if (!context) return undefined;
      const master = context.createGain();
      const ui = context.createGain();
      const gameplay = context.createGain();
      ui.connect(master);
      gameplay.connect(master);
      master.connect(context.destination);
      master.gain.value = this.muted ? 0 : this.volume;
      this.context = context;
      this.master = master;
      this.categories = { ui, gameplay };
      return context;
    } catch {
      return undefined;
    }
  }

  /** Call synchronously in a user gesture; no fake source and no retry loop. */
  ensureAudioReady(): Promise<boolean> {
    const context = this.getContext();
    if (!context || context.state === "closed") return Promise.resolve(false);
    if (context.state === "running") return Promise.resolve(true);
    if (this.resumePromise) return this.resumePromise;
    try {
      this.resumePromise = context
        .resume()
        .then(
          () => context.state === "running",
          () => false,
        )
        .finally(() => {
          this.resumePromise = undefined;
        });
      return this.resumePromise;
    } catch {
      return Promise.resolve(false);
    }
  }

  load(url: string, key = url): Promise<AudioBuffer | undefined> {
    const cached = this.decodedBufferCache.get(url);
    if (cached) return Promise.resolve(cached);
    const pending = this.inFlightLoadCache.get(url);
    if (pending) return pending;
    if (this.failedUrls.has(url)) return Promise.resolve(undefined);
    const context = this.getContext();
    if (!context) return Promise.resolve(undefined);
    const load = (async () => {
      try {
        const response = await this.fetchAsset(url);
        if (!response.ok) throw new Error("asset unavailable");
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        this.decodedBufferCache.set(url, buffer);
        return buffer;
      } catch {
        // The registry is finite. Bound diagnostics even for unregistered URL callers.
        if (this.failedUrls.size < 256 && !this.failedUrls.has(url)) {
          this.failedUrls.add(url);
          try {
            this.diagnose(key, url);
          } catch {
            /* diagnostics are optional */
          }
        }
        return undefined;
      } finally {
        this.inFlightLoadCache.delete(url);
      }
    })();
    this.inFlightLoadCache.set(url, load);
    return load;
  }

  isReady(url: string): boolean {
    return this.decodedBufferCache.has(url);
  }
  setMaster(muted: boolean, volume: number): void {
    this.muted = muted;
    this.volume = clampVolume(volume);
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
  }

  /** Never await a load here: a missed cue must never start late. */
  play(
    url: string,
    options: {
      key?: string;
      category?: SoundCategory;
      gain?: number;
      maxVoices?: number;
      durationMs?: number;
    } = {},
  ): PlaybackHandle | undefined {
    const context = this.context;
    const buffer = this.decodedBufferCache.get(url);
    if (!buffer || !context || context.state !== "running" || this.muted || this.volume <= 0)
      return undefined;
    const category = options.category ?? "gameplay";
    const key = options.key ?? url;
    const sameKey = [...this.voices].filter((voice) => voice.key === key);
    if (sameKey.length >= (options.maxVoices ?? 4)) sameKey[0].stop();
    if (this.voices.size >= 16) this.voices.values().next().value?.stop();
    let source: AudioBufferSourceNode | undefined;
    let gain: GainNode | undefined;
    let voice: Voice | undefined;
    const release = () => {
      if (voice) this.voices.delete(voice);
      source?.disconnect();
      gain?.disconnect();
    };
    try {
      source = context.createBufferSource();
      source.buffer = buffer;
      gain = context.createGain();
      gain.gain.value = clampVolume(options.gain ?? 1);
      source.connect(gain);
      gain.connect(this.categories![category]);
      voice = {
        key,
        category,
        stop: () => {
          try {
            source?.stop();
          } catch {
            /* already stopped */
          }
          release();
        },
      };
      source.onended = release;
      this.voices.add(voice);
      if (options.durationMs !== undefined) source.start(0, 0, options.durationMs / 1000);
      else source.start();
      return voice;
    } catch {
      release();
      return undefined;
    }
  }

  stopCategory(category: SoundCategory): void {
    for (const voice of [...this.voices]) if (voice.category === category) voice.stop();
  }
}
