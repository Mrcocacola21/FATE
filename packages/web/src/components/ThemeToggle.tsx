import { useEffect, useState } from "react";

const STORAGE_KEY = "theme";
type ThemeMode = "light" | "dark";

function getStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return getStoredTheme() ?? getSystemTheme();
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = getStoredTheme();
    if (stored) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event: MediaQueryListEvent) => {
      if (getStoredTheme()) return;
      setTheme(event.matches ? "dark" : "light");
    };

    if (media.addEventListener) {
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }

    media.addListener?.(handler);
    return () => media.removeListener?.(handler);
  }, []);

  const label = theme === "dark" ? "Dark" : "Light";
  const nextLabel = theme === "dark" ? "Light" : "Dark";

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 rounded-full border-ui bg-surface px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:shadow dark:text-slate-200 ${className}`}
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        window.localStorage.setItem(STORAGE_KEY, next);
      }}
      aria-pressed={theme === "dark"}
      aria-label={`Switch to ${nextLabel} mode`}
      title={`Theme: ${label} (switch to ${nextLabel})`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          theme === "dark" ? "bg-slate-200" : "bg-amber-400"
        }`}
      />
      {label} Mode
    </button>
  );
}
