import type { SoundCategory } from "../../assets/sfx/registry";
import {
  assetLoadQueue,
  type AssetLoadQueue,
  type AssetPriority,
} from "../../assets/assetLoadQueue";

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
  private retainedUrls = new Set<string>();
  private readonly rosterOwnedUrls = new Set<string>();

  constructor(
    private readonly createContext = (): AudioContext | undefined =>
      typeof AudioContext === "undefined" ? undefined : new AudioContext(),
    private readonly fetchAsset: typeof fetch = (...args) => fetch(...args),
    private readonly diagnose = (key: string, url: string): void => {
      if (import.meta.env?.DEV) console.warn(`[SFX] Unable to load ${key}: ${url}`);
    },
    private readonly loads: AssetLoadQueue = assetLoadQueue,
    private readonly cacheBudgetBytes = 32 * 1024 * 1024,
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

  load(url: string, key = url, priority: AssetPriority = "low"): Promise<AudioBuffer | undefined> {
    const cached = this.decodedBufferCache.get(url);
    if (cached) return Promise.resolve(cached);
    const pending = this.inFlightLoadCache.get(url);
    if (pending) return pending;
    if (this.failedUrls.has(url)) return Promise.resolve(undefined);
    const context = this.getContext();
    if (!context) return Promise.resolve(undefined);
    const load = this.loads
      .enqueue(async () => {
        try {
          const response = await this.fetchAsset(url);
          if (!response.ok) throw new Error("asset unavailable");
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          if (!this.rosterOwnedUrls.has(url) || this.retainedUrls.has(url)) {
            this.decodedBufferCache.set(url, buffer);
            this.trimCache();
          }
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
        }
      }, priority)
      .finally(() => this.inFlightLoadCache.delete(url));
    this.inFlightLoadCache.set(url, load);
    return load;
  }

  isReady(url: string): boolean {
    return this.decodedBufferCache.has(url);
  }
  /** Active sources own their buffer independently, so dropping a cache reference is safe. */
  retainUrls(core: readonly string[], roster: readonly string[]): void {
    this.retainedUrls = new Set([...core, ...roster]);
    for (const url of roster) this.rosterOwnedUrls.add(url);
    for (const url of this.decodedBufferCache.keys()) {
      if (this.rosterOwnedUrls.has(url) && !this.retainedUrls.has(url))
        this.decodedBufferCache.delete(url);
    }
    this.trimCache();
  }
  private bufferBytes(buffer: AudioBuffer): number {
    return (buffer.length ?? 0) * (buffer.numberOfChannels ?? 0) * 4;
  }
  private trimCache(): void {
    let bytes = this.diagnostics.decodedBytes;
    for (const [url, buffer] of this.decodedBufferCache) {
      if (bytes <= this.cacheBudgetBytes) break;
      if (this.retainedUrls.has(url)) continue;
      this.decodedBufferCache.delete(url);
      bytes -= this.bufferBytes(buffer);
    }
  }
  get diagnostics() {
    return {
      decodedBuffers: this.decodedBufferCache.size,
      decodedBytes: [...this.decodedBufferCache.values()].reduce(
        (sum, buffer) => sum + this.bufferBytes(buffer),
        0,
      ),
      pendingLoads: this.inFlightLoadCache.size,
      failedLoads: this.failedUrls.size,
      activeVoices: this.voices.size,
      cacheBudgetBytes: this.cacheBudgetBytes,
    };
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
    this.decodedBufferCache.delete(url);
    this.decodedBufferCache.set(url, buffer);
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
      if (options.durationMs !== undefined && options.durationMs > 0) {
        const end =
          (context.currentTime ?? 0) +
          Math.min(options.durationMs / 1000, buffer.duration ?? Infinity);
        // Short fade keeps bounded legacy tails from ending with a hard discontinuity.
        gain.gain.setValueAtTime?.(gain.gain.value, Math.max(context.currentTime ?? 0, end - 0.06));
        gain.gain.linearRampToValueAtTime?.(0, end);
      }
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
