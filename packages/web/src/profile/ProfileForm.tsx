import { validationFields } from "../api/client";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { localeRegistry, useI18n, type Translate } from "../i18n";
import { Avatar, isUploadedAvatar } from "./Avatar";
import { AVATAR_ACCEPT, AvatarFileError, prepareAvatarUpload } from "./avatarFile";
import { profileErrorMessage } from "./errorMessage";
import type { OwnProfile, ProfilePatch } from "./types";

/** An uploaded picture is not a link the player typed, so the link field starts empty. */
const linkValue = (avatarUrl: string | null) =>
  isUploadedAvatar(avatarUrl) ? "" : (avatarUrl ?? "");

function avatarErrorMessage(error: unknown, t: Translate) {
  if (error instanceof AvatarFileError)
    return t(
      {
        type: "profile.avatarFileType",
        size: "profile.avatarFileSize",
        small: "profile.avatarFileSmall",
        unreadable: "profile.avatarUnreadable",
      }[error.reason],
    );
  return t("profile.avatarUploadError");
}

/** Picks, shrinks and uploads a picture right away; removal clears it the same way. */
function AvatarEditor({
  profile,
  disabled,
  onUpload,
  onRemove,
}: {
  profile: OwnProfile;
  disabled: boolean;
  onUpload(image: Blob): Promise<OwnProfile>;
  onRemove(): Promise<OwnProfile>;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus({ ok: true, text: t("profile.avatarUpdated") });
    } catch (error) {
      setStatus({ ok: false, text: avatarErrorMessage(error, t) });
    } finally {
      setBusy(false);
    }
  };
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void run(async () => onUpload(await prepareAvatarUpload(file)));
  };
  return (
    <div className="profile-avatar-editor" data-testid="profile-avatar-editor">
      <span className="grimoire-portrait profile-avatar-editor__preview" aria-hidden="true">
        <Avatar {...profile} arch />
      </span>
      <div className="profile-avatar-editor__body">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={disabled || busy}
            onClick={() => input.current?.click()}
          >
            {busy ? t("profile.avatarUploading") : t("profile.uploadAvatar")}
          </button>
          {profile.avatarUrl && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled || busy}
              onClick={() => void run(onRemove)}
            >
              {t("profile.removeAvatar")}
            </button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept={AVATAR_ACCEPT}
          hidden
          data-testid="profile-avatar-file"
          onChange={pick}
        />
        <p className="text-xs text-muted">{t("profile.avatarHint")}</p>
        {status && (
          <p
            role={status.ok ? "status" : "alert"}
            className={
              status.ok
                ? "text-sm text-green-700 dark:text-green-300"
                : "text-sm text-red-700 dark:text-red-300"
            }
          >
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}

export function ProfileForm({
  profile,
  onSave,
  onCancel,
  onUploadAvatar,
  onRemoveAvatar,
  disabled = false,
}: {
  profile: OwnProfile;
  onSave(patch: ProfilePatch): Promise<OwnProfile>;
  onCancel(): void;
  onUploadAvatar?(image: Blob): Promise<OwnProfile>;
  onRemoveAvatar?(): Promise<OwnProfile>;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState({
    username: profile.username,
    displayName: profile.displayName ?? "",
    avatarUrl: linkValue(profile.avatarUrl),
    preferredLanguage: profile.preferredLanguage,
    preferredTheme: profile.preferredTheme,
  });
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  // An upload or removal changes the picture outside this form; mirror it in the link field.
  useEffect(() => {
    setValues((current) => ({ ...current, avatarUrl: linkValue(profile.avatarUrl) }));
  }, [profile.avatarUrl]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || disabled) return;
    setError(null);
    setInvalidFields([]);
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
    // An uploaded picture stays unless a link is typed over it.
    const saved = { ...profile, avatarUrl: linkValue(profile.avatarUrl) || null };
    const patch: ProfilePatch = {};
    for (const key of Object.keys(normalized) as Array<keyof ProfilePatch>) {
      if (normalized[key] !== saved[key]) Object.assign(patch, { [key]: normalized[key] });
    }
    pending.current = true;
    setSaving(true);
    try {
      await onSave(patch);
    } catch (failure) {
      setInvalidFields([...new Set(validationFields(failure).map((field) => field.path))]);
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
      {onUploadAvatar && onRemoveAvatar && (
        <AvatarEditor
          profile={profile}
          disabled={saving || disabled}
          onUpload={onUploadAvatar}
          onRemove={onRemoveAvatar}
        />
      )}
      <fieldset disabled={saving || disabled} className="space-y-4">
        {textFields.map(({ key, label, max }) => (
          <div key={key}>
            <label htmlFor={`profile-${key}`} className="mb-1 block text-sm font-semibold">
              {label}
            </label>
            <input
              id={`profile-${key}`}
              name={key}
              aria-invalid={invalidFields.includes(key)}
              aria-describedby={invalidFields.includes(key) ? `profile-${key}-error` : undefined}
              className="field-control w-full"
              value={values[key]}
              maxLength={max}
              required={key === "username"}
              autoComplete={key === "username" ? "username" : "off"}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })}
            />
            {invalidFields.includes(key) && (
              <p id={`profile-${key}-error`} className="text-sm text-red-700 dark:text-red-300">
                {t("profile.invalidRequest")}
              </p>
            )}
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
              {localeRegistry.map((locale) => (
                <option
                  key={locale.code}
                  value={locale.code}
                  lang={locale.code}
                  dir={locale.direction}
                >
                  {locale.label}
                </option>
              ))}
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
