import assert from "node:assert/strict";
import test from "node:test";
import { SfxPlayer, type SfxAudio } from "./sfxPlayer";

test("SFX player applies master and per-sound volume", () => {
  let played = 0;
  const audio: SfxAudio = {
    volume: 0,
    currentTime: 9,
    play: () => {
      played += 1;
    },
  };
  const player = new SfxPlayer(() => audio);
  player.setVolume(0.5);

  assert.equal(player.play("/sound.mp3", { volume: 0.4 }), true);
  assert.equal(audio.volume, 0.2);
  assert.equal(audio.currentTime, 0);
  assert.equal(played, 1);
});

test("mute and missing SFX skip playback without creating audio", () => {
  let created = 0;
  const player = new SfxPlayer(() => {
    created += 1;
    return {
      volume: 1,
      currentTime: 0,
      play: () => undefined,
    };
  });

  assert.equal(player.play(undefined), false);
  player.setMuted(true);
  assert.equal(player.play("/sound.mp3"), false);
  assert.equal(created, 0);
});

test("audio creation or playback failures are optional and silent", () => {
  const createFailure = new SfxPlayer(() => {
    throw new Error("audio unavailable");
  });
  assert.doesNotThrow(() => createFailure.play("/sound.mp3"));
  assert.equal(createFailure.play("/sound.mp3"), false);

  const playFailure = new SfxPlayer(() => ({
    volume: 1,
    currentTime: 0,
    play: () => {
      throw new Error("autoplay denied");
    },
  }));
  assert.equal(playFailure.play("/sound.mp3"), false);
});
