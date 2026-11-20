import { resolveSound } from "../../assets/sfx/resolver";
import { preloadCoreSounds } from "./audioPreload";
import { ensureAudioReady, sfxPlayer } from "./sfxPlayer";

let prepared = false;
let sequence = 0;
const lastPlayedAt = new Map<UiSfxKind, number>();

export type UiSfxKind = "actionInvalid" | "pageTurn" | "bookOpen" | "bookPlace" | "bookCloseCreak" | "bookClose";

/** Reusable gesture entry point for shell, board and selected action controls. */
export function prepareAudioFromGesture(): void {
  void ensureAudioReady();
  if (!prepared) {
    prepared = true;
    void preloadCoreSounds("ui");
  }
}

/**
 * Interface clicks are silent by design. The cues are a rejected action and the book itself:
 * a page turning between sections and the cover opening and closing.
 */
export function playUiSfx(kind: UiSfxKind): void {
  prepareAudioFromGesture();
  const now = Date.now();
  if (now - (lastPlayedAt.get(kind) ?? -Infinity) < 90) return;
  lastPlayedAt.set(kind, now);
  const id = `ui:${++sequence}`;
  const sound = resolveSound(`common.ui.${kind}`, id);
  if (sound) sfxPlayer.play({ ...sound, id });
}

/** Plays a cue in step with an animation; the returned function cancels it if not yet heard. */
export function scheduleUiSfx(kind: UiSfxKind, delayMs: number): () => void {
  if (typeof window === "undefined") return () => undefined;
  const timer = window.setTimeout(() => playUiSfx(kind), Math.max(0, delayMs));
  return () => window.clearTimeout(timer);
}
