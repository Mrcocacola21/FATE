import {
  assetLoadQueue,
  type AssetLoadQueue,
  type AssetPriority,
} from "../../assets/assetLoadQueue";
import { vfxRegistry, type VfxArtwork, type VfxDefinition } from "./vfxRegistry";
import type { VfxEffectId } from "./vfxTypes";

export function vfxAssets(definition: VfxDefinition): VfxArtwork[] {
  return (definition.layers ?? [definition]).filter((art) => Boolean(art.asset));
}

/** Owns warm image references only; DOM/CSS rendering keeps its existing lifetime. */
export class ImagePreloader {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly pending = new Map<string, Promise<HTMLImageElement | undefined>>();
  private readonly failed = new Set<string>();
  private retained = new Set<string>();
  private core = new Set<string>();
  private readonly rosterOwned = new Set<string>();
  private readonly liveRequested = new Set<string>();
  constructor(
    private readonly createImage = () => new Image(),
    private readonly loads: AssetLoadQueue = assetLoadQueue,
    private readonly diagnose = (key: string, url: string) => {
      if (import.meta.env?.DEV)
        console.warn(`[VFX] Unable to decode ${key}: ${url}; optional artwork skipped`);
    },
    private readonly budgetBytes = 32 * 1024 * 1024,
  ) {}
  load(
    url: string,
    key = url,
    priority: AssetPriority = "low",
    rosterOnly = false,
  ): Promise<HTMLImageElement | undefined> {
    const image = this.images.get(url);
    if (image) {
      this.images.delete(url);
      this.images.set(url, image);
      return Promise.resolve(image);
    }
    const pending = this.pending.get(url);
    if (pending) {
      if (!rosterOnly) this.liveRequested.add(url);
      return pending;
    }
    if (this.failed.has(url) || typeof Image === "undefined") return Promise.resolve(undefined);
    if (!rosterOnly) this.liveRequested.add(url);
    const job = this.loads
      .enqueue(async () => {
        if (rosterOnly && !this.liveRequested.has(url) && this.rosterOwned.has(url) && !this.retained.has(url)) return undefined;
        try {
          const image = this.createImage();
          image.src = url;
          await image.decode();
          if (!image.naturalWidth || !image.naturalHeight) throw new Error("Empty raster");
          if (!this.rosterOwned.has(url) || this.retained.has(url)) {
            this.images.set(url, image);
            this.trim();
          }
          return image;
        } catch {
          this.failed.add(url);
          try {
            this.diagnose(key, url);
          } catch {
            /* Optional diagnostics. */
          }
          return undefined;
        }
      }, priority)
      .finally(() => {
        this.pending.delete(url);
        this.liveRequested.delete(url);
      });
    this.pending.set(url, job);
    return job;
  }
  retainUrls(core: readonly string[], roster: readonly string[]): void {
    this.core = new Set(core);
    this.retained = new Set([...core, ...roster]);
    for (const url of roster) this.rosterOwned.add(url);
    for (const url of this.images.keys()) {
      if (this.rosterOwned.has(url) && !this.retained.has(url)) this.images.delete(url);
    }
    this.trim();
  }
  private trim(): void {
    let bytes = this.diagnostics.estimatedPixelBytes;
    // Prefer old/lazy references, then LRU roster art. A large authorized roster
    // is permission to warm assets, not permission to exceed the decoded budget.
    const candidates = [...this.images].sort(([a], [b]) => Number(this.retained.has(a)) - Number(this.retained.has(b)));
    for (const [url, image] of candidates) {
      if (bytes <= this.budgetBytes) break;
      if (this.core.has(url)) continue;
      this.images.delete(url);
      bytes -= image.naturalWidth * image.naturalHeight * 4;
    }
  }
  status(url: string): "ready" | "pending" | "failed" | "cold" {
    return this.images.has(url)
      ? "ready"
      : this.pending.has(url)
        ? "pending"
        : this.failed.has(url)
          ? "failed"
          : "cold";
  }
  get diagnostics() {
    return {
      ready: this.images.size,
      pending: this.pending.size,
      failed: this.failed.size,
      estimatedPixelBytes: [...this.images.values()].reduce(
        (sum, image) => sum + image.naturalWidth * image.naturalHeight * 4,
        0,
      ),
      budgetBytes: this.budgetBytes,
    };
  }
}
export const imagePreloader = new ImagePreloader();
export function preloadVfx(
  ids: readonly VfxEffectId[],
  priority: AssetPriority = "medium",
): Promise<void> {
  return Promise.all(
    ids.flatMap((id) =>
      vfxAssets(vfxRegistry[id]).map((art) => imagePreloader.load(art.asset!, id, priority, true)),
    ),
  ).then(() => undefined);
}
