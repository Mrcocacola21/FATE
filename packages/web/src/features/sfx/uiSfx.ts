import { resolveSound } from "../../assets/sfx/resolver";
import { preloadCoreSounds } from "./audioPreload";
import { ensureAudioReady, sfxPlayer } from "./sfxPlayer";

let prepared = false;
let sequence = 0;
let lastPlayedAt = -Infinity;

/** Reusable gesture entry point for shell, board and selected action controls. */
export function prepareAudioFromGesture(): void {
  void ensureAudioReady();
  if (!prepared) {
    prepared = true;
    void preloadCoreSounds("ui");
  }
}

export function playUiSfx(kind: "buttonClick" | "actionInvalid" = "buttonClick"): void {
  prepareAudioFromGesture();
  const now = Date.now();
  if (now - lastPlayedAt < 90) return;
  lastPlayedAt = now;
  const id = `ui:${++sequence}`;
  const sound = resolveSound(`common.ui.${kind}`, id);
  if (sound) sfxPlayer.play({ ...sound, id });
}
