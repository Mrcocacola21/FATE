import { useEffect, useState } from "react";
import { Link } from "react-router";
import { languageName, useI18n } from "../i18n";
import { ProfileForm } from "../profile/ProfileForm";
import { profileStore, useProfileStore } from "../profile/profileStore";
import { profileErrorMessage } from "../profile/errorMessage";
import { ProfileOverview, ShareProfileButton, publicProfilePath } from "../profile/ProfileOverview";
import type { OwnProfile } from "../profile/types";

/** Account details nobody else sees; settings open the same editor as "Edit profile". */
function PrivateDetails({
  profile,
  onSettings,
  disabled,
}: {
  profile: OwnProfile;
  onSettings: () => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <section
      className="profile-private"
      aria-labelledby="profile-private-title"
      data-testid="profile-private"
    >
      <h2 id="profile-private-title" className="grimoire-kicker">
        {t("profile.onlyYou")}
      </h2>
      <dl>
        <div>
          <dt>{t("auth.email")}</dt>
          <dd>{profile.email}</dd>
        </div>
        <div>
          <dt>{t("language.switchLabel")}</dt>
          <dd>{languageName(profile.preferredLanguage)}</dd>
        </div>
        <div>
          <dt>{t("profile.theme")}</dt>
          <dd>{t(`theme.${profile.preferredTheme}`)}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={disabled}
        onClick={onSettings}
      >
        {t("profile.accountSettings")}
      </button>
    </section>
  );
}

export function ProfilePage() {
  const { t } = useI18n();
  const { profile, loading, saving, error, load, save } = useProfileStore((state) => state);
  const [editing, setEditing] = useState(false);
  const [updated, setUpdated] = useState(false);
  const startEditing = () => {
    setUpdated(false);
    setEditing(true);
  };
  useEffect(() => {
    if (!profileStore.getState().profile) void profileStore.getState().load();
  }, []);
  return (
    <section className="profile-page" aria-labelledby="profile-title" data-testid="profile-page">
      <h1 id="profile-title" className="sr-only">
        {t("profile.title")}
      </h1>
      {loading && !profile && (
        <p role="status" className="profile-page__status">
          {t("profile.loading")}
        </p>
      )}
      {error && (
        <div role="alert" className="profile-page__status">
          <p>{profileErrorMessage(error, t)}</p>
          <button className="btn btn-secondary mt-3" onClick={() => void load()}>
            {t("profile.retry")}
          </button>
        </div>
      )}
      {profile && (
        <ProfileOverview
          profile={profile}
          own
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
          afterHeader={
            <>
              {updated && (
                <p role="status" className="profile-page__updated">
                  {t("profile.updated")}
                </p>
              )}
              {editing && (
                <div className="profile-editor">
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
                </div>
              )}
            </>
          }
        >
          <PrivateDetails
            profile={profile}
            onSettings={startEditing}
            disabled={saving || editing}
          />
        </ProfileOverview>
      )}
    </section>
  );
}
