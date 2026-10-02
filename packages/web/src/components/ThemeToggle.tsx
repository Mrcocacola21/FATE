import React, { useState } from "react";
import { useTheme } from "../theme";
import { changePreference, useProfileStore } from "../profile/profileStore";
import { useI18n } from "../i18n";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const theme = useTheme();
  const saving = useProfileStore((state) => state.saving);
  const [error, setError] = useState(false);

  const label = theme === "dark" ? t("theme.dark") : t("theme.light");
  const nextLabel = theme === "dark" ? t("theme.light") : t("theme.dark");

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={saving}
        className={`btn btn-secondary btn-sm rounded-full border-amber-500/20 ${className}`}
        onClick={() => {
          const next = theme === "dark" ? "light" : "dark";
          setError(false);
          void changePreference({ preferredTheme: next }).catch(() => setError(true));
        }}
        aria-pressed={theme === "dark"}
        aria-label={t("theme.switchTo", { theme: nextLabel })}
        title={t("theme.title", { current: label, next: nextLabel })}
      >
        {theme === "dark" ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <path
              fill="currentColor"
              d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path
              fill="currentColor"
              d="M11 1h2v3h-2V1Zm0 19h2v3h-2v-3ZM1 11h3v2H1v-2Zm19 0h3v2h-3v-2ZM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1Zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1ZM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4ZM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4Z"
            />
          </svg>
        )}
        <span>{label}</span>
      </button>
      {error && (
        <span role="alert" className="text-xs">
          {t("profile.preferenceError")}
        </span>
      )}
    </span>
  );
}
