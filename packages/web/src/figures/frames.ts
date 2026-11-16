import { useSyncExternalStore } from "react";
import {
  FIGURE_FRAME_IDS,
  isFigureFrameId,
  type FigureFrameId,
} from "../../../rules/src/cosmetics/figureFrames";

/**
 * Frames a player's figures wear on the board, chosen in the Figure Set. A signed-in player's
 * choice lives in their profile and reaches every seat through the room; this browser keeps a
 * copy so the tab and offline boards show it at once.
 */
export const FRAME_IDS = FIGURE_FRAME_IDS;
export type FrameId = FigureFrameId;

export const FRAME_ART: Record<FrameId, string> = {
  "moon-gold": new URL("../assets/frames/moon-gold.webp", import.meta.url).href,
  "bone-thorns": new URL("../assets/frames/bone-thorns.webp", import.meta.url).href,
  "blood-iron": new URL("../assets/frames/blood-iron.webp", import.meta.url).href,
  arcane: new URL("../assets/frames/arcane.webp", import.meta.url).href,
};

export const FRAME_LABEL_KEYS: Record<FrameId, string> = {
  "moon-gold": "figureSet.frameMoonGold",
  "bone-thorns": "figureSet.frameBoneThorns",
  "blood-iron": "figureSet.frameBloodIron",
  arcane: "figureSet.frameArcane",
};

const STORAGE_KEY = "FATE_FIGURE_FRAME_V1";
const CHANGE_EVENT = "fate-figure-frame-change";

export const isFrameId = isFigureFrameId;

export function loadFrameChoice(): FrameId | null {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isFrameId(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveFrameChoice(frame: FrameId | null) {
  try {
    if (frame) globalThis.localStorage?.setItem(STORAGE_KEY, frame);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* The choice still applies for this page; it is only not remembered. */
  }
  current = frame;
  globalThis.dispatchEvent?.(new Event(CHANGE_EVENT));
}

let current: FrameId | null = loadFrameChoice();

function subscribe(onChange: () => void) {
  const reload = () => {
    current = loadFrameChoice();
    onChange();
  };
  globalThis.addEventListener?.("storage", reload);
  globalThis.addEventListener?.(CHANGE_EVENT, onChange);
  return () => {
    globalThis.removeEventListener?.("storage", reload);
    globalThis.removeEventListener?.(CHANGE_EVENT, onChange);
  };
}

export function useFrameChoice(): FrameId | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
