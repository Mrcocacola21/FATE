import { useEffect, useState } from "react";
import { Link } from "react-router";
import { languageName, useI18n } from "../i18n";
import { ProfileForm } from "../profile/ProfileForm";
import { profileStore, useProfileStore } from "../profile/profileStore";
import { profileErrorMessage } from "../profile/errorMessage";
import { useAuthStore } from "../auth/authStore";
import { PlayerStatisticsSection } from "../statistics/PlayerStatisticsSection";
import { ProfileOverview, ShareProfileButton, publicProfilePath } from "../profile/ProfileOverview";

export function ProfilePage() {
  const { t } = useI18n();
  const { profile, loading, saving, error, load, save } = useProfileStore((state) => state);
  const [editing, setEditing] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [revision, setRevision] = useState(0);
  const user = useAuthStore((state) => state.user);
  const statisticsUserId = profile?.id ?? user?.id;
  const startEditing = () => {
    setUpdated(false);
    setEditing(true);
  };
  useEffect(() => {
    if (!profileStore.getState().profile) void profileStore.getState().load();
  }, []);
  return (
    <section className="profile-page" aria-labelledby="profile-title" data-testid="profile-page">
      <div className="panel-card profile-identity">
        <h1 id="profile-title" className="sr-only">
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
            <ProfileOverview
              profile={profile}
              revision={revision}
              onAvatarClick={saving ? undefined : startEditing}
              actions={
                <>
                  <button
                    className="btn btn-primary"
                    disabled={saving || editing}
                    onClick={startEditing}
                  >
                    {t("profile.edit")}
                  </button>
                  <ShareProfileButton username={profile.username} />
                  <Link className="btn btn-secondary" to={publicProfilePath(profile.username)}>
                    {t("profile.viewAsOthers")}
                  </Link>
                </>
              }
            />
            <dl className="my-6 grid gap-4 break-words text-sm sm:grid-cols-3">
              <div>
                <dt>{t("auth.email")}</dt>
                <dd className="font-semibold">{profile.email}</dd>
              </div>
              <div>
                <dt>{t("language.switchLabel")}</dt>
                <dd className="font-semibold">{languageName(profile.preferredLanguage)}</dd>
              </div>
              <div>
                <dt>{t("profile.theme")}</dt>
                <dd className="font-semibold">{t(`theme.${profile.preferredTheme}`)}</dd>
              </div>
            </dl>
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
                  className="btn btn-secondary"
                  disabled={loading || saving}
                  onClick={() => {
                    setRevision((value) => value + 1);
                    void load();
                  }}
                >
                  {loading ? t("common.refreshing") : t("common.refresh")}
                </button>
                <Link className="btn btn-secondary" to="/figures">
                  {t("lobby.figureSet")}
                </Link>
                <Link className="btn btn-secondary" to="/matches">
                  {t("matches.history")}
                </Link>
              </div>
            )}
          </>
        )}
      </div>
      {statisticsUserId && (
        <PlayerStatisticsSection
          userId={statisticsUserId}
          username={profile?.username ?? user?.username ?? ""}
          own
          revision={revision}
        />
      )}
    </section>
  );
}
