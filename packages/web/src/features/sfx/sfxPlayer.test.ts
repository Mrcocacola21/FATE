import assert from "node:assert/strict";
import test from "node:test";
import { SfxPlayer } from "./sfxPlayer";
import { audioFixture } from "./audioTestUtils";
import { AudioManager } from "./AudioManager";
import { resolveSound } from "../../assets/sfx/resolver";
import { preloadCoreSounds } from "./audioPreload";
import { SOUND_REGISTRY } from "../../assets/sfx/registry";

test("SFX player applies master and per-sound volume", async () => {
  const f = audioFixture();
  const player = new SfxPlayer(f.manager);
  player.setVolume(0.5);
  await player.ensureAudioReady();
  await f.manager.load("/sound.mp3");
  assert.equal(player.play("/sound.mp3", { volume: 0.4 }), true);
  assert.equal(f.gains[0].gain.value * f.gains[3].gain.value, 0.2);
  assert.equal(f.sources[0].starts, 1);
  assert.equal(player.getVolume(), 0.5);
  for (const [input, expected] of [
    [-1, 0],
    [2, 1],
    [NaN, 1],
    [Infinity, 1],
  ]) {
    player.setVolume(input);
    assert.equal(player.getVolume(), expected);
  }
});

test("mute and missing SFX skip playback without creating audio", () => {
  const f = audioFixture();
  const player = new SfxPlayer(f.manager);
  assert.equal(player.play(undefined), false);
  player.setMuted(true);
  assert.equal(player.play("/sound.mp3"), false);
  assert.equal(f.stats().creations, 0);
});

test("audio creation or playback failures are optional and silent", async () => {
  const createFailure = new SfxPlayer(
    new AudioManager(() => {
      throw new Error("unavailable");
    }),
  );
  assert.doesNotThrow(() => createFailure.play("/sound.mp3"));
  assert.equal(createFailure.play("/sound.mp3"), false);
  const f = audioFixture();
  const player = new SfxPlayer(f.manager);
  await player.ensureAudioReady();
  await f.manager.load("/sound.mp3");
  f.context.createBufferSource = () => {
    throw new Error("source denied");
  };
  assert.equal(player.play("/sound.mp3"), false);
});

test("a cold cue is skipped forever; its loaded buffer serves only future cues", async () => {
  const f = audioFixture();
  const player = new SfxPlayer(f.manager);
  await player.ensureAudioReady();
  const cue = { ...resolveSound("common.combat.hit", "E42")!, id: "E42" };
  assert.equal(player.play(cue), false);
  await player.preload("common.combat.hit");
  assert.equal(f.sources.length, 0, "loading never starts the old cue");
  assert.equal(player.play({ ...cue, id: "E43" }), true);
});

test("ready alternate variant is safe fallback; no ready asset remains silent", async () => {
  const f = audioFixture();
  const player = new SfxPlayer(f.manager);
  await player.ensureAudioReady();
  const cue = { ...resolveSound("common.combat.hit", "E42")!, id: "E42" };
  const alternate = cue.sources.find((url) => url !== cue.src)!;
  await f.manager.load(alternate);
  assert.equal(player.play(cue), true);
  await f.manager.load(cue.src);
  assert.equal(f.stats().fetches, 2, "chosen variant warms lazily alongside the ready fallback");
  assert.equal(player.play(cue), true);
  assert.equal(f.stats().fetches, 2, "subsequent plays reuse both variants");
  f.suspend();
  assert.equal(player.play(cue), false);
});

test("UI and match warm only the first variant of every core semantic key, deduplicated", async () => {
  const f = audioFixture();
  const player = new SfxPlayer(f.manager);
  await Promise.all([preloadCoreSounds("ui", player), preloadCoreSounds("ui", player)]);
  assert.deepEqual(
    f.urls,
    Object.values(SOUND_REGISTRY)
      .filter((sound) => sound.category === "ui" && sound.preload === "core")
      .map((sound) => sound.sources[0]),
  );
  assert(f.urls.every((url) => url.includes("/common/ui/")));
  await Promise.all([preloadCoreSounds("gameplay", player), preloadCoreSounds("gameplay", player)]);
  const expected = Object.values(SOUND_REGISTRY)
    .filter((sound) => sound.preload === "core")
    .map((sound) => sound.sources[0]);
  assert.equal(f.urls.length, expected.length);
  assert.deepEqual([...f.urls].sort(), expected.sort());
  assert(f.urls.every((url) => url.endsWith(".wav") && !url.includes("/heroes/")));
  assert.equal(f.stats().decodes, expected.length);
});

test("measured long signatures have finite tails; segment duration can shorten them further", async () => {
  const f = audioFixture();
  const player = new SfxPlayer(f.manager);
  await player.ensureAudioReady();
  await player.preload("hero.grand-kaiser.abilities.kaiserDora");
  const cue = { ...resolveSound("hero.grand-kaiser.abilities.kaiserDora", "dora")!, id: "dora" };
  assert.equal(player.play(cue), true);
  assert.deepEqual(f.sources[0].startArgs, [[0, 0, 1.5]]);
  player.play({ ...cue, id: "shorter-dora", durationMs: 700 });
  assert.deepEqual(f.sources[1].startArgs, [[0, 0, 0.7]]);
  assert.equal(f.sources[0].stops, 1, "per-signature cap cancels the prior voice safely");
});
