import assert from "node:assert/strict";
import test from "node:test";
import { SfxPlayer } from "./sfxPlayer";
import { audioFixture } from "./audioTestUtils";
import { AudioManager } from "./AudioManager";
import { resolveSound } from "../../assets/sfx/resolver";
import { preloadCoreSounds } from "./audioPreload";

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
  assert.equal(f.stats().fetches, 1);
  f.suspend();
  assert.equal(player.play(cue), false);
});

test("UI and match preloads are bounded to 4 and 16 real core WAVs", async () => {
  const f = audioFixture();
  const player = new SfxPlayer(f.manager);
  await Promise.all([preloadCoreSounds("ui", player), preloadCoreSounds("ui", player)]);
  assert.equal(f.urls.length, 4);
  assert(f.urls.every((url) => url.includes("/common/ui/")));
  await Promise.all([preloadCoreSounds("gameplay", player), preloadCoreSounds("gameplay", player)]);
  assert.equal(f.urls.length, 20);
  assert(f.urls.every((url) => url.endsWith(".wav") && !url.includes("/heroes/")));
  assert.equal(f.stats().decodes, 20);
});
