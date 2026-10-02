import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { Avatar } from "../profile/Avatar";
import { ProfileForm } from "../profile/ProfileForm";
import { profileStore, useProfileStore } from "../profile/profileStore";
import { profileErrorMessage } from "../profile/errorMessage";

export function ProfilePage() {
  const { t, language } = useI18n();
  const { profile, loading, saving, error, load, save } = useProfileStore((state) => state);
  const [editing, setEditing] = useState(false);
  const [updated, setUpdated] = useState(false);
  useEffect(() => {
    if (!profileStore.getState().profile) void profileStore.getState().load();
  }, []);
  return (
    <section aria-labelledby="profile-title" data-testid="profile-page">
      <p className="section-kicker">{t("auth.brand")}</p>
      <h1 id="profile-title" className="mt-2 text-2xl font-bold">
        {t("profile.title")}
      </h1>
      {loading && !profile && (
        <p role="status" className="mt-4">
          {t("profile.loading")}
        </p>
      )}
      {error && (
        <div role="alert" className="my-4 text-sm">
          <p>{profileErrorMessage(error, t)}</p>
          <button className="btn btn-secondary mt-3" onClick={() => void load()}>
            {t("profile.retry")}
          </button>
        </div>
      )}
      {profile && (
        <>
          <div className="mt-6 flex min-w-0 items-center gap-4">
            <Avatar {...profile} />
            <div className="min-w-0 break-words">
              <h2 className="text-xl font-bold">{profile.displayName || profile.username}</h2>
              <p className="text-sm text-stone-600 dark:text-stone-300">@{profile.username}</p>
            </div>
          </div>
          <dl className="my-6 grid gap-4 break-words text-sm">
            <div>
              <dt>{t("auth.email")}</dt>
              <dd className="font-semibold">{profile.email}</dd>
            </div>
            <div>
              <dt>{t("profile.memberSince")}</dt>
              <dd className="font-semibold">
                {new Date(profile.createdAt).toLocaleDateString(language)}
              </dd>
            </div>
            <div>
              <dt>{t("language.switchLabel")}</dt>
              <dd className="font-semibold">
                {t(profile.preferredLanguage === "uk" ? "language.ukrainian" : "language.english")}
              </dd>
            </div>
            <div>
              <dt>{t("profile.theme")}</dt>
              <dd className="font-semibold">{t(`theme.${profile.preferredTheme}`)}</dd>
            </div>
          </dl>
          <Link
            className="text-sm font-semibold underline"
            to={`/users/${encodeURIComponent(profile.username)}`}
          >
            {t("profile.publicProfile")}
          </Link>
          {updated && (
            <p role="status" className="mt-3 text-sm text-green-700 dark:text-green-300">
              {t("profile.updated")}
            </p>
          )}
          {editing ? (
            <ProfileForm
              profile={profile}
              disabled={saving}
              onCancel={() => setEditing(false)}
              onSave={async (patch) => {
                const result = await save(patch);
                setEditing(false);
                setUpdated(true);
                return result;
              }}
            />
          ) : (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() => {
                  setUpdated(false);
                  setEditing(true);
                }}
              >
                {t("profile.edit")}
              </button>
              <button
                className="btn btn-secondary"
                disabled={loading || saving}
                onClick={() => void load()}
              >
                {loading ? t("common.refreshing") : t("common.refresh")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
