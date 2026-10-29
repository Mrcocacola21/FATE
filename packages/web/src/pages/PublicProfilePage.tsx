import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { profileApi } from "../api/profileApi";
import { ApiError } from "../api/client";
import { useI18n } from "../i18n";
import type { PublicProfile } from "../profile/types";
import { ProfileOverview, ShareProfileButton, publicProfilePath } from "../profile/ProfileOverview";
import { useAuthStore } from "../auth/authStore";
import { RelationshipActions } from "../friends/RelationshipActions";
import { InviteButton } from "../invites/InviteButton";

export function PublicProfilePage() {
  const { username = "" } = useParams();
  const { t } = useI18n();
  const viewerId = useAuthStore((state) =>
    state.status === "authenticated" ? state.user?.id : null,
  );
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    username: string;
    profile?: PublicProfile;
    error?: ApiError;
  } | null>(null);
  useEffect(() => {
    let active = true;
    setResult(null);
    profileApi.getPublic(username).then(
      (profile) => {
        if (active) setResult({ username, profile });
      },
      (error: unknown) => {
        if (active)
          setResult({
            username,
            error: error instanceof ApiError ? error : new ApiError("NETWORK_ERROR"),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [username, attempt]);
  const current = result?.username === username ? result : null;
  return (
    <section
      className="profile-page"
      aria-labelledby="public-profile-title"
      data-testid="public-profile-page"
    >
      <h1 id="public-profile-title" className="sr-only">
        {t("profile.publicProfile")}
      </h1>
      {!current && (
        <p role="status" className="profile-page__status">
          {t("profile.loading")}
        </p>
      )}
      {current?.error && (
        <div role="alert" className="profile-page__status">
          <p>
            {t(current.error.code === "USER_NOT_FOUND" ? "profile.notFound" : "profile.loadError")}
          </p>
          {current.error.code !== "USER_NOT_FOUND" && (
            <button className="btn btn-secondary mt-3" onClick={() => setAttempt(attempt + 1)}>
              {t("profile.retry")}
            </button>
          )}
        </div>
      )}
      {current?.profile && (
        <ProfileOverview
          key={current.profile.id}
          profile={current.profile}
          actions={
            <>
              <Link
                className="btn btn-secondary"
                to={`${publicProfilePath(current.profile.username)}/matches`}
              >
                {t("matches.history")}
              </Link>
              <ShareProfileButton username={current.profile.username} />
              {viewerId && viewerId !== current.profile.id && (
                <>
                  <InviteButton player={current.profile} className="" />
                  <RelationshipActions player={current.profile} />
                </>
              )}
            </>
          }
        />
      )}
    </section>
  );
}
