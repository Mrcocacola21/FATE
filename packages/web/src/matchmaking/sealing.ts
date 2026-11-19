import { useSyncExternalStore } from "react";

// While an accepted offer is being sealed on screen, the match it made waits behind it: the
// draft or the battle appears only once the sealed offer has come apart into runes.
let sealing = false;
const listeners = new Set<() => void>();

export function setSealing(active: boolean): void {
  if (active === sealing) return;
  sealing = active;
  listeners.forEach((listener) => listener());
}

export function useSealing(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => sealing,
    () => false,
  );
}
