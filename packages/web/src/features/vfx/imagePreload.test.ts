import assert from "node:assert/strict";
import test from "node:test";
import { AssetLoadQueue } from "../../assets/assetLoadQueue";
import { ImagePreloader } from "./imagePreload";

test("a retained expansion roster cannot exceed the decoded-image budget", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Image");
  class ImageStub { src = ""; naturalWidth = 128; naturalHeight = 128; async decode() {} }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ImageStub });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "Image", previous); else Reflect.deleteProperty(globalThis, "Image"); });
  const cache = new ImagePreloader(() => new ImageStub() as unknown as HTMLImageElement, new AssetLoadQueue(1), () => undefined, 65536);
  const roster = ["/expansion-a.png", "/expansion-b.png", "/expansion-c.png"];
  cache.retainUrls([], roster);
  await Promise.all(roster.map(url => cache.load(url)));
  assert(cache.diagnostics.estimatedPixelBytes <= cache.diagnostics.budgetBytes);
  assert.equal(cache.status(roster[0]), "cold");
  assert.equal(cache.status(roster[2]), "ready");
});

test("form changes cancel obsolete roster warmup while an active Rebirth cue can promote the same queued image", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const decoded: string[] = [];
  class ImageStub { src = ""; naturalWidth = 128; naturalHeight = 128; async decode() { decoded.push(this.src); } }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ImageStub });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "Image", previous); else Reflect.deleteProperty(globalThis, "Image"); });
  const queue = new AssetLoadQueue(1);
  let unblock!: () => void;
  const blocked = queue.enqueue(() => new Promise<void>(resolve => { unblock = resolve; }));
  const cache = new ImagePreloader(() => new ImageStub() as unknown as HTMLImageElement, queue, () => undefined);
  cache.retainUrls([], ["/griffith/rebirth.png", "/griffith/unused.png"]);
  const rebirthWarm = cache.load("/griffith/rebirth.png", "rebirth", "medium", true);
  const unusedWarm = cache.load("/griffith/unused.png", "unused", "medium", true);
  cache.retainUrls([], ["/femto/attack.png"]);
  const live = cache.load("/griffith/rebirth.png", "rebirth", "high");
  assert.equal(live, rebirthWarm);
  unblock(); await blocked;
  assert(await live, "the authorized in-flight scene may finish after its old roster retires");
  assert.equal(await unusedWarm, undefined);
  assert.deepEqual(decoded, ["/griffith/rebirth.png"]);
  assert.equal(cache.status("/griffith/rebirth.png"), "cold", "completed retired art does not repin old roster memory");
});

test("image aliases share in-flight decode; memory counts full strip, failures diagnose once, old roster releases safely", async (t) => {
  let decodes = 0;
  let release!: () => void;
  class ImageStub {
    src = "";
    naturalWidth = 4096;
    naturalHeight = 128;
    decode() {
      decodes++;
      if (this.src === "/missing.png") return Promise.reject(new Error("missing"));
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ImageStub });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "Image", previous);
    else Reflect.deleteProperty(globalThis, "Image");
  });
  const warnings: string[] = [];
  const cache = new ImagePreloader(
    () => new ImageStub() as unknown as HTMLImageElement,
    new AssetLoadQueue(1),
    (key, url) => warnings.push(`${key}:${url}`),
  );
  cache.retainUrls([], ["/strip.png"]);
  const first = cache.load("/strip.png", "primary");
  assert.equal(cache.load("/strip.png", "alias"), first);
  assert.equal(cache.status("/strip.png"), "pending");
  release();
  const image = await first;
  assert.equal(await cache.load("/strip.png"), image);
  assert.equal(decodes, 1);
  assert.equal(cache.diagnostics.estimatedPixelBytes, 4096 * 128 * 4);
  cache.retainUrls([], []);
  assert.equal(cache.status("/strip.png"), "cold");
  assert.equal(image?.naturalWidth, 4096, "live DOM-owned image remains valid");
  await Promise.all([cache.load("/missing.png", "effect"), cache.load("/missing.png", "alias")]);
  await cache.load("/missing.png");
  assert.equal(cache.status("/missing.png"), "failed");
  assert.deepEqual(warnings, ["effect:/missing.png"]);
});

test("image budget bounds lazy references; obsolete in-flight roster completion cannot repin a prior match", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const releases = new Map<string, () => void>();
  class ImageStub {
    src = "";
    naturalWidth = 128;
    naturalHeight = 128;
    decode() { return new Promise<void>(resolve => releases.set(this.src, resolve)); }
  }
  Object.defineProperty(globalThis, "Image", { configurable: true, value: ImageStub });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "Image", previous); else Reflect.deleteProperty(globalThis, "Image"); });
  const cache = new ImagePreloader(() => new ImageStub() as unknown as HTMLImageElement, new AssetLoadQueue(2), () => undefined, 65536);
  cache.retainUrls([], ["/old-roster.png"]);
  const old = cache.load("/old-roster.png");
  cache.retainUrls([], []);
  releases.get("/old-roster.png")!();
  await old;
  assert.equal(cache.status("/old-roster.png"), "cold");
  const first = cache.load("/first.png"); releases.get("/first.png")!(); await first;
  const second = cache.load("/second.png"); releases.get("/second.png")!(); await second;
  assert.equal(cache.status("/first.png"), "cold");
  assert.equal(cache.status("/second.png"), "ready");
  assert.equal(cache.diagnostics.estimatedPixelBytes, 65536);
});
