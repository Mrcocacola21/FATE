import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "../i18n";
import { profileErrorMessage } from "./errorMessage";
import type { OwnProfile, ProfilePatch } from "./types";

export function ProfileForm({
  profile,
  onSave,
  onCancel,
  disabled = false,
}: {
  profile: OwnProfile;
  onSave(patch: ProfilePatch): Promise<OwnProfile>;
  onCancel(): void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState({
    username: profile.username,
    displayName: profile.displayName ?? "",
    avatarUrl: profile.avatarUrl ?? "",
    preferredLanguage: profile.preferredLanguage,
    preferredTheme: profile.preferredTheme,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || disabled) return;
    setError(null);
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(values.username.trim())) {
      setError(t("auth.usernameHelp"));
      return;
    }
    if (values.displayName.trim().length > 64) {
      setError(t("profile.invalidRequest"));
      return;
    }
    const avatar = values.avatarUrl.trim();
    if (avatar) {
      try {
        if (avatar.length > 2048 || !["http:", "https:"].includes(new URL(avatar).protocol))
          throw new Error();
      } catch {
        setError(t("profile.invalidAvatar"));
        return;
      }
    }
    const normalized = {
      ...values,
      username: values.username.trim(),
      displayName: values.displayName.trim() || null,
      avatarUrl: avatar || null,
    };
    const patch: ProfilePatch = {};
    for (const key of Object.keys(normalized) as Array<keyof ProfilePatch>) {
      if (normalized[key] !== profile[key]) Object.assign(patch, { [key]: normalized[key] });
    }
    pending.current = true;
    setSaving(true);
    try {
      await onSave(patch);
    } catch (failure) {
      setError(profileErrorMessage(failure, t));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  const textFields = [
    { key: "username", label: t("auth.username"), max: 32 },
    { key: "displayName", label: t("auth.displayName"), max: 64 },
    { key: "avatarUrl", label: t("profile.avatarUrl"), max: 2048 },
  ] as const;
  return (
    <form onSubmit={submit} className="mt-6 space-y-4" aria-label={t("profile.edit")}>
      <fieldset disabled={saving || disabled} className="space-y-4">
        {textFields.map(({ key, label, max }) => (
          <div key={key}>
            <label htmlFor={`profile-${key}`} className="mb-1 block text-sm font-semibold">
              {label}
            </label>
            <input
              id={`profile-${key}`}
              name={key}
              className="field-control w-full"
              value={values[key]}
              maxLength={max}
              required={key === "username"}
              autoComplete={key === "username" ? "username" : "off"}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })}
            />
            {key === "username" && (
              <p className="mt-1 text-xs text-stone-600 dark:text-stone-300">
                {t("auth.usernameHelp")}
              </p>
            )}
          </div>
        ))}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-language" className="mb-1 block text-sm font-semibold">
              {t("language.switchLabel")}
            </label>
            <select
              id="profile-language"
              name="preferredLanguage"
              className="field-control w-full"
              value={values.preferredLanguage}
              onChange={(event) =>
                setValues({
                  ...values,
                  preferredLanguage: event.target.value as OwnProfile["preferredLanguage"],
                })
              }
            >
              <option value="en">{t("language.english")}</option>
              <option value="uk">{t("language.ukrainian")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="profile-theme" className="mb-1 block text-sm font-semibold">
              {t("profile.theme")}
            </label>
            <select
              id="profile-theme"
              name="preferredTheme"
              className="field-control w-full"
              value={values.preferredTheme}
              onChange={(event) =>
                setValues({
                  ...values,
                  preferredTheme: event.target.value as OwnProfile["preferredTheme"],
                })
              }
            >
              <option value="light">{t("theme.light")}</option>
              <option value="dark">{t("theme.dark")}</option>
            </select>
          </div>
        </div>
        {error && (
          <p
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary">
            {saving ? t("profile.saving") : t("profile.save")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
