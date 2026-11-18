import { useSyncExternalStore } from "react";

/** How a sidebar section opens: the page turn, or a short fade for those who want it plain. */
export type PageTransition = "turn" | "simple";

export const PAGE_TRANSITIONS: readonly PageTransition[] = ["turn", "simple"];
const STORAGE_KEY = "fate-page-transition";

export function parsePageTransition(value: unknown): PageTransition {
  return value === "simple" ? "simple" : "turn";
}

function read(): PageTransition {
  try {
    return typeof localStorage === "undefined"
      ? "turn"
      : parsePageTransition(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "turn";
  }
}

let current: PageTransition | null = null;
const listeners = new Set<() => void>();

export function getPageTransition(): PageTransition {
  current ??= read();
  return current;
}

/** A device preference, like sound: kept in this browser only. */
export function setPageTransition(next: PageTransition) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* Private mode: the choice lasts until reload. */
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function usePageTransition() {
  return useSyncExternalStore(subscribe, getPageTransition, () => "turn" as const);
}
