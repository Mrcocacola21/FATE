import { useSyncExternalStore } from "react";

/** Opt-in switch for the minimal battle layout while it replaces the classic one in stages. */
export type BattleUiMode = "classic" | "minimal";

const STORAGE_KEY = "fate.battleUi";
const listeners = new Set<() => void>();
let current: BattleUiMode | null = null;

function read(): BattleUiMode {
  if (current) return current;
  try {
    current =
      typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "minimal"
        ? "minimal"
        : "classic";
  } catch {
    current = "classic";
  }
  return current;
}

export function setBattleUiMode(mode: BattleUiMode): void {
  current = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* The choice still applies for this session without storage. */
  }
  for (const notify of listeners) notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBattleUiMode(): BattleUiMode {
  return useSyncExternalStore(subscribe, read, () => "classic");
}
