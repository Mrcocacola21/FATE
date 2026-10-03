import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { profileApi } from "../api/profileApi";
import { ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { Avatar } from "../profile/Avatar";
import type { PublicProfile } from "../profile/types";
import { PlayerStatisticsSection } from "../statistics/PlayerStatisticsSection";

export function PublicProfilePage() {
  const { username = "" } = useParams();
  const { t, language } = useI18n();
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
      <div className="panel-card profile-identity">
        <p className="section-kicker">{t("auth.brand")}</p>
        <h1 id="public-profile-title" className="mt-2 text-2xl font-bold">
          {t("profile.publicProfile")}
        </h1>
        {!current && (
          <p role="status" className="mt-4">
            {t("profile.loading")}
          </p>
        )}
        {current?.error && (
          <div role="alert" className="mt-4">
            <p>
              {t(
                current.error.code === "USER_NOT_FOUND" ? "profile.notFound" : "profile.loadError",
              )}
            </p>
            {current.error.code !== "USER_NOT_FOUND" && (
              <button className="btn btn-secondary mt-3" onClick={() => setAttempt(attempt + 1)}>
                {t("profile.retry")}
              </button>
            )}
          </div>
        )}
        {current?.profile && (
          <div className="profile-public-row">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar {...current.profile} />
              <div className="min-w-0 break-words">
                <h2 className="text-xl font-bold">
                  {current.profile.displayName || current.profile.username}
                </h2>
                <p className="text-sm text-stone-600 dark:text-stone-300">
                  @{current.profile.username}
                </p>
              </div>
            </div>
            <div className="profile-public-meta">
              <p className="text-sm">
                {t("profile.memberSince")}:{" "}
                {new Date(current.profile.createdAt).toLocaleDateString(language)}
              </p>
              <Link
                className="btn btn-secondary"
                to={`/users/${encodeURIComponent(current.profile.username)}/matches`}
              >
                {t("matches.history")}
              </Link>
            </div>
          </div>
        )}
      </div>
      {current?.profile && (
        <PlayerStatisticsSection
          key={current.profile.id}
          userId={current.profile.id}
          username={current.profile.username}
        />
      )}
    </section>
  );
}
