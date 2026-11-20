import assert from "node:assert/strict";
import test from "node:test";
import { sfxPlayer } from "./sfxPlayer";
import { playUiSfx, prepareAudioFromGesture } from "./uiSfx";
import { SOUND_REGISTRY } from "../../assets/sfx/registry";
import type { SoundCue } from "./sfxTypes";

test("interface clicks are silent; only a rejected action has a restrained cue", (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const cues: SoundCue[] = [];
  t.mock.method(sfxPlayer, "play", (cue: SoundCue | string | undefined) => {
    cues.push(cue as SoundCue);
    return true;
  });
  t.mock.method(sfxPlayer, "ensureAudioReady", async () => true);
  t.mock.method(sfxPlayer, "preload", async () => undefined);
  prepareAudioFromGesture();
  assert.equal(cues.length, 0, "unlocking audio on a click plays nothing");
  playUiSfx("actionInvalid");
  playUiSfx("actionInvalid");
  assert.equal(cues.length, 1, "rapid repeated rejections are throttled");
  assert.equal(cues[0].key, "common.ui.actionInvalid");
  assert.equal(cues[0].category, "ui");
  assert(!("common.ui.buttonClick" in SOUND_REGISTRY), "the click sound is gone");
});

test("the book has its own cues, throttled per kind so a riffle is not swallowed", (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const cues: SoundCue[] = [];
  t.mock.method(sfxPlayer, "play", (cue: SoundCue | string | undefined) => {
    cues.push(cue as SoundCue);
    return true;
  });
  t.mock.method(sfxPlayer, "ensureAudioReady", async () => true);
  t.mock.method(sfxPlayer, "preload", async () => undefined);
  t.mock.timers.tick(1000);
  playUiSfx("bookClose");
  playUiSfx("pageTurn");
  playUiSfx("pageTurn");
  t.mock.timers.tick(125);
  playUiSfx("pageTurn");
  playUiSfx("bookOpen");
  playUiSfx("bookPlace");
  assert.deepEqual(
    cues.map((cue) => cue.key),
    [
      "common.ui.bookClose",
      "common.ui.pageTurn",
      "common.ui.pageTurn",
      "common.ui.bookOpen",
      "common.ui.bookPlace",
    ],
  );
  assert(cues.every((cue) => cue.category === "ui"), "the effects slider governs the book");
  assert.equal(SOUND_REGISTRY["common.ui.pageTurn"].sources.length, 1, "one crisp rustle");
});
