import assert from "node:assert/strict";
import test from "node:test";
import { sfxPlayer } from "./sfxPlayer";
import { playUiSfx } from "./uiSfx";
import type { SoundCue } from "./sfxTypes";

test("local Roll feedback is only a restrained UI cue, never an optimistic dice/combat cue", (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const cues: SoundCue[] = [];
  t.mock.method(sfxPlayer, "play", (cue: SoundCue | string | undefined) => {
    cues.push(cue as SoundCue);
    return true;
  });
  t.mock.method(sfxPlayer, "ensureAudioReady", async () => true);
  t.mock.method(sfxPlayer, "preload", async () => undefined);
  playUiSfx();
  playUiSfx();
  assert.equal(cues.length, 1, "rapid repeated clicks are throttled");
  assert.equal(cues[0].key, "common.ui.buttonClick");
  assert.equal(cues[0].category, "ui");
  t.mock.timers.tick(100);
  playUiSfx("actionInvalid");
  assert.equal(cues[1].key, "common.ui.actionInvalid");
  assert(cues.every((cue) => !cue.key.startsWith("common.combat.")));
});
