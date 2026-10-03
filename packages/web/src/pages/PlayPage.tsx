import { useEffect, useState } from "react";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { MatchmakingPanel } from "../matchmaking/MatchmakingPanel";
import { useQueue } from "../matchmaking/store";
import { competitiveApi, type CompetitiveRating } from "../play/api";
import { RankMedal } from "../play/RankMedal";

export function CompetitiveIdentity({
  rating,
  minRatedGames,
  name,
}: {
  rating: CompetitiveRating;
  minRatedGames: number;
  name: string;
}) {
  const { t } = useI18n();
  const qualified = rating.ratedGames >= minRatedGames;
  const remaining = Math.max(0, minRatedGames - rating.ratedGames);
  return (
    <section className="competitive-identity" aria-label={t("competitive.identity")}>
      <RankMedal />
      <p className="competitive-player">{name}</p>
      <p className="competitive-rating" data-testid="competitive-rating">
        {Math.round(rating.rating)}
      </p>
      <p className="section-kicker">{t("matchmaking.rating")}</p>
      <p className="competitive-uncertainty" title={t("leaderboard.uncertaintyHelp")}>
        {t("competitive.uncertainty", { value: Math.round(rating.ratingDeviation) })}
      </p>
      <div className="qualification-block">
        <div className="qualification-label">
          <span>{t(qualified ? "leaderboard.qualified" : "leaderboard.provisional")}</span>
          <span>{t("competitive.games", { count: rating.ratedGames })}</span>
        </div>
        {!qualified && (
          <>
            <progress
              className="qualification-progress"
              value={rating.ratedGames}
              max={minRatedGames}
              aria-label={t("competitive.qualification")}
            />
            <p className="text-sm text-muted">
              {rating.ratedGames} / {minRatedGames} ·{" "}
              {t("leaderboard.untilRanked", { count: remaining })}
            </p>
          </>
        )}
        {qualified && <p className="mt-3 text-sm text-muted">{t("competitive.qualified")}</p>}
      </div>
    </section>
  );
}

export function PlayPage() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const queueStatus = useQueue((s) => s.status.status);
  const searching =
    queueStatus === "QUEUED" || queueStatus === "MATCHING" || queueStatus === "MATCH_FOUND";
  const [data, setData] = useState<{
    owner: string;
    rating: CompetitiveRating;
    min: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setFailed(false);
    const load = () =>
      Promise.all([competitiveApi.rating(user.id), competitiveApi.config()]).then(
        ([rating, min]) => {
          if (active) {
            setData({ owner: user.id, rating, min });
            setFailed(false);
          }
        },
        () => {
          if (active) setFailed(true);
        },
      );
    void load();
    const refresh = () => {
      void load();
    };
    if (typeof window !== "undefined") window.addEventListener("focus", refresh);
    return () => {
      active = false;
      if (typeof window !== "undefined") window.removeEventListener("focus", refresh);
    };
  }, [user, attempt]);
  const current = data?.owner === user?.id ? data : null;
  return (
    <div className="play-page competitive-page mx-auto max-w-5xl" data-testid="play-page">
      <header className="play-header mb-7">
        <p className="section-kicker">{t("competitive.kicker")}</p>
        <h1 className="font-display mt-1 text-3xl font-semibold sm:text-4xl">{t("shell.play")}</h1>
        <p className="mt-2 text-sm text-muted">{t("competitive.description")}</p>
      </header>
      <div className="competitive-hub" data-searching={searching}>
        {!searching &&
          (current ? (
            <CompetitiveIdentity
              rating={current.rating}
              minRatedGames={current.min}
              name={user?.displayName || user?.username || t("competitive.you")}
            />
          ) : (
            <section className="competitive-identity">
              <RankMedal />
              <p className="mt-5 text-sm text-muted" role="status">
                {t(
                  !user
                    ? "competitive.signInIdentity"
                    : failed
                      ? "competitive.unavailable"
                      : "competitive.loading",
                )}
              </p>
              {failed && (
                <button
                  className="btn btn-ghost mt-3"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  {t("common.refresh")}
                </button>
              )}
            </section>
          ))}
        <MatchmakingPanel />
      </div>
    </div>
  );
}
