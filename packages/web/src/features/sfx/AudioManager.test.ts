import assert from "node:assert/strict";
import test from "node:test";
import { AudioManager } from "./AudioManager";
import { audioFixture } from "./audioTestUtils";

test("concurrent loads share one promise; decoded buffers survive playback cleanup", async () => {
  const f = audioFixture();
  const first = f.manager.load("/hit.wav");
  assert.equal(f.manager.load("/hit.wav"), first);
  const [a, b] = await Promise.all([first, f.manager.load("/hit.wav")]);
  assert.equal(a, b);
  assert.equal(await f.manager.load("/hit.wav"), a);
  f.manager.stopCategory("gameplay");
  assert.equal(await f.manager.load("/hit.wav"), a);
  assert.deepEqual(f.stats(), { fetches: 1, decodes: 1, resumes: 0, creations: 1 });
});

for (const failure of ["failFetch", "failDecode"] as const) {
  test(`${failure} skips playback and diagnoses a broken URL once`, async () => {
    const f = audioFixture({ [failure]: true });
    await Promise.all([f.manager.load("/broken.wav", "hit"), f.manager.load("/broken.wav", "hit")]);
    assert.equal(await f.manager.load("/broken.wav", "hit"), undefined);
    assert.equal(f.manager.play("/broken.wav"), undefined);
    assert.equal(f.stats().fetches, 1);
    assert.deepEqual(f.diagnostics, ["hit:/broken.wav"]);
  });
}

test("lazy context resumes from gesture without a dummy source; denial is silent", async () => {
  const f = audioFixture();
  assert.equal(f.stats().creations, 0);
  assert.equal(await f.manager.ensureAudioReady(), true);
  assert.equal(await f.manager.ensureAudioReady(), true);
  assert.equal(f.stats().resumes, 1);
  assert.equal(f.sources.length, 0);
  const denied = audioFixture({ failResume: true });
  await denied.manager.load("/hit.wav");
  assert.equal(await denied.manager.ensureAudioReady(), false);
  assert.equal(denied.manager.play("/hit.wav"), undefined);
  const absent = new AudioManager(() => undefined);
  assert.equal(await absent.ensureAudioReady(), false);
  assert.equal(await absent.load("/hit.wav"), undefined);
  const broken = new AudioManager(() => {
    throw new Error("API failure");
  });
  assert.equal(await broken.ensureAudioReady(), false);
});

test("UI/gameplay voices route separately through master; mute updates existing output", async () => {
  const f = audioFixture();
  await f.manager.ensureAudioReady();
  await f.manager.load("/sound.wav");
  f.manager.play("/sound.wav", { category: "ui", gain: 0.4 });
  f.manager.play("/sound.wav", { category: "gameplay", gain: 0.6 });
  const [master, ui, gameplay, uiVoice, gameplayVoice] = f.gains;
  assert.deepEqual(f.sources[0].connections, [uiVoice]);
  assert.deepEqual(f.sources[1].connections, [gameplayVoice]);
  assert.deepEqual(uiVoice.connections, [ui]);
  assert.deepEqual(gameplayVoice.connections, [gameplay]);
  assert.deepEqual(ui.connections, [master]);
  assert.deepEqual(gameplay.connections, [master]);
  assert.deepEqual(master.connections, [f.destination]);
  for (const volume of [1, 0.5, 0]) {
    f.manager.setMaster(false, volume);
    assert.equal(master.gain.value, volume);
  }
  f.manager.setMaster(true, 0.5);
  assert.equal(master.gain.value, 0);
  assert.equal(f.manager.play("/sound.wav"), undefined);
  f.manager.setMaster(false, 0.5);
  assert.equal(master.gain.value, 0.5);
  assert.equal(f.stats().decodes, 1);
});

test("overlapping voices are bounded; handles and category cleanup retain UI/cache", async () => {
  const f = audioFixture();
  await f.manager.ensureAudioReady();
  await f.manager.load("/hit.wav");
  f.manager.play("/hit.wav", { key: "hit", maxVoices: 2 });
  f.manager.play("/hit.wav", { key: "hit", maxVoices: 2 });
  f.manager.play("/hit.wav", { key: "hit", maxVoices: 2 });
  assert.equal(f.sources[0].stops, 1);
  const ui = f.manager.play("/hit.wav", { category: "ui", key: "click" });
  f.manager.stopCategory("gameplay");
  assert.equal(f.sources[1].stops, 1);
  assert.equal(f.sources[2].stops, 1);
  assert.equal(f.sources[3].stops, 0);
  ui!.stop();
  assert.equal(f.sources[3].stops, 1);
  for (let i = 0; i < 20; i++) f.manager.play("/hit.wav", { key: `hit-${i}` });
  assert.equal(f.sources.filter((source) => source.stops === 0).length, 16);
  f.sources[f.sources.length - 1].onended!();
  assert.equal(f.sources[f.sources.length - 1].disconnects, 1);
  assert(f.manager.isReady("/hit.wav"));
});
