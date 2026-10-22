import { useState } from "react";
import { changePreference, useProfileStore } from "../profile/profileStore";
import { localeRegistry, useI18n, type Language } from "../i18n";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, t } = useI18n();
  const saving = useProfileStore((state) => state.saving);
  const [error, setError] = useState(false);

  return (
    <div className={`inline-flex max-w-full min-w-0 flex-col gap-1 ${className}`}>
      <select
        aria-label={t("language.switchLabel")}
        className="field-control min-h-9 max-w-full rounded-full px-3 py-1 text-xs"
        value={language}
        disabled={saving}
        onChange={(event) => {
          setError(false);
          void changePreference({ preferredLanguage: event.target.value as Language }).catch(() =>
            setError(true),
          );
        }}
      >
        {localeRegistry.map((locale) => (
          <option key={locale.code} value={locale.code} lang={locale.code} dir={locale.direction}>
            {locale.label}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-xs">
          {t("profile.preferenceError")}
        </span>
      )}
    </div>
  );
}
