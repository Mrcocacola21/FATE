import { useI18n } from "../i18n";
import { competitiveApi } from "../play/api";
import { RankEmblem } from "../ranks/RankEmblem";
import { getRankPresentation } from "../ranks/rankAssets";
import { formatCompetitiveRating } from "../ranks/rankProgress";
import { useProfileResource } from "../statistics/useProfileResource";

const loadRank = async (userId: string) => {
  const [rating, minRatedGames] = await Promise.all([
    competitiveApi.rating(userId),
    competitiveApi.config(),
  ]);
  return { rating, minRatedGames };
};

export function ProfileRank({ userId, revision = 0 }: { userId: string; revision?: number }) {
  const { t } = useI18n();
  const resource = useProfileResource(userId, revision, loadRank);
  const data = resource.result?.data;
  if (!data)
    return (
      <div className="profile-rank" data-testid="profile-rank">
        <p className="text-sm text-muted" role="status">
          {t(resource.result?.error ? "competitive.unavailable" : "competitive.loading")}
        </p>
        {Boolean(resource.result?.error) && (
          <button className="btn btn-ghost btn-sm" onClick={resource.retry}>
            {t("profile.retry")}
          </button>
        )}
      </div>
    );
  const rank = getRankPresentation(data.rating.rankTier);
  const qualified = data.rating.ratedGames >= data.minRatedGames;
  return (
    <div className="profile-rank" data-testid="profile-rank">
      <RankEmblem rank={data.rating.rankTier} size="medium" decorative />
      <div className="min-w-0">
        <p className="font-display rank-summary-name">
          {rank ? t(rank.labelKey) : t("ranks.unassigned")}
        </p>
        <p className="rank-summary-rating">
          <strong>{formatCompetitiveRating(data.rating.rating)}</strong>{" "}
          <span>{t("matchmaking.rating")}</span>
        </p>
        <p className="text-sm text-muted">
          {t(qualified ? "leaderboard.qualified" : "leaderboard.provisional")} ·{" "}
          {qualified
            ? t("competitive.games", { count: data.rating.ratedGames })
            : `${data.rating.ratedGames} / ${data.minRatedGames}`}
        </p>
      </div>
    </div>
  );
}
