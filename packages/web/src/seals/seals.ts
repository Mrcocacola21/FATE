import { useSyncExternalStore } from "react";
import { DEFAULT_SEAL, SEAL_IDS, isSealId, type SealId } from "../../../rules/src/cosmetics/seals";

/**
 * Wax seals a player stamps to accept a rated match, chosen in the Figure Set. A signed-in
 * player's choice lives in their profile and reaches the opponent with the found match; this
 * browser keeps a copy so the offer shows it at once.
 */
export { DEFAULT_SEAL, SEAL_IDS, isSealId, type SealId };

export const SEAL_ART: Record<SealId, string> = {
  "crimson-star": new URL("../assets/seals/crimson-star.webp", import.meta.url).href,
  "crimson-eagle": new URL("../assets/seals/crimson-eagle.webp", import.meta.url).href,
  "night-pact": new URL("../assets/seals/night-pact.webp", import.meta.url).href,
  serpent: new URL("../assets/seals/serpent.webp", import.meta.url).href,
  "sovereign-sun": new URL("../assets/seals/sovereign-sun.webp", import.meta.url).href,
  "arcane-eye": new URL("../assets/seals/arcane-eye.webp", import.meta.url).href,
};

export const SEAL_LABEL_KEYS: Record<SealId, string> = {
  "crimson-star": "figureSet.sealCrimsonStar",
  "crimson-eagle": "figureSet.sealCrimsonEagle",
  "night-pact": "figureSet.sealNightPact",
  serpent: "figureSet.sealSerpent",
  "sovereign-sun": "figureSet.sealSovereignSun",
  "arcane-eye": "figureSet.sealArcaneEye",
};

/** A stored seal, or the default for none or one that is no longer offered. */
export const sealOrDefault = (seal: unknown): SealId => (isSealId(seal) ? seal : DEFAULT_SEAL);

const STORAGE_KEY = "FATE_SEAL_V1";
const CHANGE_EVENT = "fate-seal-change";

export function loadSealChoice(): SealId {
  try {
    return sealOrDefault(globalThis.localStorage?.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_SEAL;
  }
}

export function saveSealChoice(seal: SealId | null) {
  try {
    if (seal && seal !== DEFAULT_SEAL) globalThis.localStorage?.setItem(STORAGE_KEY, seal);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* The choice still applies for this page; it is only not remembered. */
  }
  current = sealOrDefault(seal);
  globalThis.dispatchEvent?.(new Event(CHANGE_EVENT));
}

let current: SealId = loadSealChoice();

function subscribe(onChange: () => void) {
  const reload = () => {
    current = loadSealChoice();
    onChange();
  };
  globalThis.addEventListener?.(CHANGE_EVENT, onChange);
  globalThis.addEventListener?.("storage", reload);
  return () => {
    globalThis.removeEventListener?.(CHANGE_EVENT, onChange);
    globalThis.removeEventListener?.("storage", reload);
  };
}

export function useSealChoice(): SealId {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_SEAL,
  );
}
