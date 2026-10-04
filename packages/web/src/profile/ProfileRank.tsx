import { useState } from "react";
import type { GameModeId } from "rules";
import { CompetitiveModeSelector } from "../modes/CompetitiveModeSelector";
import { RankProgress } from "../ranks/RankProgressPanel";
import { useI18n } from "../i18n";
import { competitiveApi } from "../play/api";
import { RankEmblem } from "../ranks/RankEmblem";
import { getRankPresentation } from "../ranks/rankAssets";
import { formatCompetitiveRating } from "../ranks/rankProgress";
import { useProfileResource } from "../statistics/useProfileResource";

const loadRank = async (userId: string) => {
  const [ratings, minRatedGames] = await Promise.all([
    competitiveApi.ratings(userId),
    competitiveApi.config(),
  ]);
  return { ratings, minRatedGames };
};

export function ProfileRank({ userId, revision = 0 }: { userId: string; revision?: number }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<GameModeId>("standard");
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
  const rating = data.ratings[mode];
  const rank = getRankPresentation(rating.rankTier);
  const qualified = rating.ratedGames >= data.minRatedGames;
  return (
    <div className="profile-rank" data-testid="profile-rank">
      <CompetitiveModeSelector value={mode} onChange={setMode} />
      <RankEmblem rank={rating.rankTier} size="medium" decorative />
      <div className="min-w-0">
        <p className="font-display rank-summary-name">
          {rank ? t(rank.labelKey) : t("ranks.unassigned")}
        </p>
        <p className="rank-summary-rating">
          <strong>{formatCompetitiveRating(rating.rating)}</strong>{" "}
          <span>{t("matchmaking.rating")}</span>
        </p>
        <p className="text-sm text-muted">
          {t("competitive.uncertainty", { value: Math.round(rating.ratingDeviation) })}
        </p>
        <RankProgress rank={rating.rankTier} value={rating.rankProgress} />
        <p className="text-sm text-muted">
          {t(qualified ? "leaderboard.qualified" : "leaderboard.provisional")} ·{" "}
          {qualified
            ? t("competitive.games", { count: rating.ratedGames })
            : `${rating.ratedGames} / ${data.minRatedGames}`}
        </p>
      </div>
    </div>
  );
}
