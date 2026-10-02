import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const listeners = new Set<() => void>();
const stored = typeof window === "undefined" ? null : window.localStorage.getItem("theme");
let theme: Theme = stored === "light" || stored === "dark" ? stored : systemTheme();
let explicit = stored === "light" || stored === "dark";

function systemTheme(): Theme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
function apply() {
  if (typeof document !== "undefined")
    document.documentElement.classList.toggle("dark", theme === "dark");
}
export function getTheme(): Theme {
  return theme;
}
export function setTheme(next: Theme) {
  explicit = true;
  theme = next;
  if (typeof window !== "undefined") window.localStorage.setItem("theme", next);
  apply();
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, getTheme);
}
apply();
if (typeof window !== "undefined" && window.matchMedia) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const changed = () => {
    if (explicit) return;
    theme = systemTheme();
    apply();
    listeners.forEach((listener) => listener());
  };
  if (media.addEventListener) media.addEventListener("change", changed);
  else media.addListener?.(changed);
}
