import { validationFields } from "../api/client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { localeRegistry, useI18n, type Translate } from "../i18n";
import { Dialog } from "../ui/Dialog";
import { Avatar } from "./Avatar";
import { AvatarCropper } from "./AvatarCropper";
import { AVATAR_ACCEPT, AvatarFileError, cropAvatar, loadAvatarSource } from "./avatarFile";
import { profileErrorMessage } from "./errorMessage";
import type { OwnProfile, ProfilePatch } from "./types";

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

type AvatarStatus = { ok: boolean; text: string };

/** The arch preview with upload and removal; picking a file opens the cropper. */
function AvatarControls({
  profile,
  disabled,
  busy,
  status,
  onPick,
  onRemove,
}: {
  profile: OwnProfile;
  disabled: boolean;
  busy: boolean;
  status: AvatarStatus | null;
  onPick(): void;
  onRemove(): void;
}) {
  const { t } = useI18n();
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
            data-avatar-upload
            disabled={disabled || busy}
            onClick={onPick}
          >
            {busy ? t("profile.avatarUploading") : t("profile.uploadAvatar")}
          </button>
          {profile.avatarUrl && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled || busy}
              onClick={onRemove}
            >
              {t("profile.removeAvatar")}
            </button>
          )}
        </div>
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

/**
 * "Edit profile" as a modal over the page. Picking a picture swaps the form for the cropper in
 * the same window; the form stays mounted, so drafts survive the detour.
 */
export function ProfileEditDialog({
  profile,
  disabled = false,
  onSave,
  onClose,
  onUploadAvatar,
  onRemoveAvatar,
}: {
  profile: OwnProfile;
  disabled?: boolean;
  onSave(patch: ProfilePatch): Promise<OwnProfile>;
  onClose(): void;
  onUploadAvatar(image: Blob): Promise<OwnProfile>;
  onRemoveAvatar(): Promise<OwnProfile>;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<ImageBitmap | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AvatarStatus | null>(null);
  const [cropError, setCropError] = useState<string | null>(null);
  // Decoded pictures hold memory until closed.
  useEffect(() => () => source?.close(), [source]);
  const leaveCropper = useCallback(() => {
    setSource(null);
    setCropError(null);
    requestAnimationFrame(() =>
      body.current?.querySelector<HTMLElement>("[data-avatar-upload]")?.focus(),
    );
  }, []);
  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setStatus(null);
    setCropError(null);
    try {
      setSource(await loadAvatarSource(file));
    } catch (error) {
      const text = avatarErrorMessage(error, t);
      if (source) setCropError(text);
      else setStatus({ ok: false, text });
    }
  };
  const apply = async (crop: Parameters<typeof cropAvatar>[1]) => {
    if (!source) return;
    setBusy(true);
    setCropError(null);
    try {
      await onUploadAvatar(await cropAvatar(source, crop));
      setStatus({ ok: true, text: t("profile.avatarUpdated") });
      leaveCropper();
    } catch (error) {
      setCropError(avatarErrorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await onRemoveAvatar();
      setStatus({ ok: true, text: t("profile.avatarUpdated") });
    } catch (error) {
      setStatus({ ok: false, text: avatarErrorMessage(error, t) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      id="profile-edit-title"
      className="profile-dialog"
      title={source ? t("profile.cropTitle") : t("profile.edit")}
      busy={busy}
      onClose={source ? leaveCropper : onClose}
    >
      <div ref={body}>
        <input
          ref={input}
          type="file"
          accept={AVATAR_ACCEPT}
          hidden
          data-testid="profile-avatar-file"
          onChange={(event) => void pick(event)}
        />
        {source && (
          <AvatarCropper
            source={source}
            busy={busy}
            error={cropError}
            onApply={(crop) => void apply(crop)}
            onBack={leaveCropper}
            onPickAnother={() => input.current?.click()}
          />
        )}
        <div hidden={Boolean(source)}>
          <ProfileForm
            profile={profile}
            disabled={disabled || busy}
            onSave={onSave}
            onCancel={onClose}
            avatar={
              <AvatarControls
                profile={profile}
                disabled={disabled}
                busy={busy}
                status={status}
                onPick={() => input.current?.click()}
                onRemove={() => void remove()}
              />
            }
          />
        </div>
      </div>
    </Dialog>
  );
}

export function ProfileForm({
  profile,
  onSave,
  onCancel,
  avatar,
  disabled = false,
}: {
  profile: OwnProfile;
  onSave(patch: ProfilePatch): Promise<OwnProfile>;
  onCancel(): void;
  /** The picture controls; the picture itself is uploaded, never typed in as a link. */
  avatar?: ReactNode;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState({
    username: profile.username,
    displayName: profile.displayName ?? "",
    preferredLanguage: profile.preferredLanguage,
    preferredTheme: profile.preferredTheme,
    friendRequests: profile.friendRequests,
    presenceVisibility: profile.presenceVisibility,
    lobbyInvites: profile.lobbyInvites,
    directMessages: profile.directMessages,
  });
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
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
    setInvalidFields([]);
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(values.username.trim())) {
      setError(t("auth.usernameHelp"));
      return;
    }
    if (values.displayName.trim().length > 64) {
      setError(t("profile.invalidRequest"));
      return;
    }
    const normalized = {
      ...values,
      username: values.username.trim(),
      displayName: values.displayName.trim() || null,
    };
    const patch: ProfilePatch = {};
    for (const key of Object.keys(normalized) as Array<keyof typeof normalized>) {
      if (normalized[key] !== profile[key]) Object.assign(patch, { [key]: normalized[key] });
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
  ] as const;
  return (
    <form onSubmit={submit} className="profile-form" aria-label={t("profile.edit")}>
      {avatar}
      <fieldset disabled={saving || disabled} className="profile-form__fields">
        <h3 className="grimoire-kicker">{t("profile.sectionIdentity")}</h3>
        <div className="profile-form__grid">
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
        </div>
        <h3 className="grimoire-kicker">{t("profile.sectionAppearance")}</h3>
        <div className="profile-form__grid">
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
        <h3 className="grimoire-kicker">{t("profile.sectionPrivacy")}</h3>
        <div className="profile-form__grid">
          <div>
            <label htmlFor="profile-friend-requests" className="mb-1 block text-sm font-semibold">
              {t("friends.requestPolicy")}
            </label>
            <select
              id="profile-friend-requests"
              name="friendRequests"
              className="field-control w-full"
              value={values.friendRequests}
              onChange={(event) =>
                setValues({
                  ...values,
                  friendRequests: event.target.value as OwnProfile["friendRequests"],
                })
              }
            >
              <option value="EVERYONE">{t("friends.policyEveryone")}</option>
              <option value="NOBODY">{t("friends.policyNobody")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="profile-presence" className="mb-1 block text-sm font-semibold">
              {t("presence.visibility")}
            </label>
            <select
              id="profile-presence"
              name="presenceVisibility"
              className="field-control w-full"
              aria-describedby="profile-presence-help"
              value={values.presenceVisibility}
              onChange={(event) =>
                setValues({
                  ...values,
                  presenceVisibility: event.target.value as OwnProfile["presenceVisibility"],
                })
              }
            >
              <option value="EVERYONE">{t("presence.visEveryone")}</option>
              <option value="FRIENDS">{t("presence.visFriends")}</option>
              <option value="NOBODY">{t("presence.visNobody")}</option>
            </select>
            <p id="profile-presence-help" className="mt-1 text-xs text-muted">
              {t("presence.visibilityHelp")}
            </p>
          </div>
          <div>
            <label htmlFor="profile-lobby-invites" className="mb-1 block text-sm font-semibold">
              {t("invites.policy")}
            </label>
            <select
              id="profile-lobby-invites"
              name="lobbyInvites"
              className="field-control w-full"
              value={values.lobbyInvites}
              onChange={(event) =>
                setValues({
                  ...values,
                  lobbyInvites: event.target.value as OwnProfile["lobbyInvites"],
                })
              }
            >
              <option value="EVERYONE">{t("invites.policyEveryone")}</option>
              <option value="FRIENDS">{t("invites.policyFriends")}</option>
              <option value="NOBODY">{t("invites.policyNobody")}</option>
            </select>
          </div>
          <div>
            <label htmlFor="profile-direct-messages" className="mb-1 block text-sm font-semibold">
              {t("moderation.dmPolicy")}
            </label>
            <select
              id="profile-direct-messages"
              name="directMessages"
              className="field-control w-full"
              aria-describedby="profile-direct-messages-help"
              value={values.directMessages}
              onChange={(event) =>
                setValues({
                  ...values,
                  directMessages: event.target.value as OwnProfile["directMessages"],
                })
              }
            >
              <option value="FRIENDS">{t("moderation.dmPolicyFriends")}</option>
              <option value="NOBODY">{t("moderation.dmPolicyNobody")}</option>
            </select>
            <p id="profile-direct-messages-help" className="mt-1 text-xs text-muted">
              {t("moderation.dmPolicyHelp")}
            </p>
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
        <div className="profile-dialog__footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary">
            {saving ? t("profile.saving") : t("profile.save")}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
