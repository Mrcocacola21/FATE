import type { GameModeId } from "rules";
import { GAME_MODE_IDS, getGameModeName } from "../modes/modeLabels";
import { RankProgress } from "../ranks/RankProgressPanel";
import { useI18n } from "../i18n";
import { competitiveApi, type CompetitiveRating } from "../play/api";
import { RankEmblem } from "../ranks/RankEmblem";
import { getRankPresentation } from "../ranks/rankAssets";
import { formatCompetitiveRating } from "../ranks/rankProgress";
import { useProfileResource } from "../statistics/useProfileResource";
import { ModeTabs } from "./RatingChart";

const loadRanks = async (userId: string) => {
  const [ratings, minRatedGames] = await Promise.all([
    competitiveApi.ratings(userId),
    competitiveApi.config(),
  ]);
  return { ratings, minRatedGames };
};

export type ProfileRanksResource = ReturnType<typeof useProfileRanks>;

/** One fetch feeds both the header kicker and the three rank cards. */
export function useProfileRanks(userId: string, revision = 0) {
  return useProfileResource(userId, revision, loadRanks);
}

/** The played mode the player is strongest in, for the header kicker; null before any rated game. */
export function bestRankedMode(ratings: Record<GameModeId, CompetitiveRating>): GameModeId | null {
  return GAME_MODE_IDS.filter((mode) => ratings[mode].ratedGames > 0).reduce<GameModeId | null>(
    (best, mode) => (best === null || ratings[mode].rating > ratings[best].rating ? mode : best),
    null,
  );
}

function ProfileRankCard({
  mode,
  rating,
  minRatedGames,
  selected,
}: {
  mode: GameModeId;
  rating: CompetitiveRating;
  minRatedGames: number;
  selected: boolean;
}) {
  const { t } = useI18n();
  const rank = getRankPresentation(rating.rankTier);
  const qualified = rating.ratedGames >= minRatedGames;
  return (
    <article
      data-testid={`profile-rank-${mode}`}
      className="profile-rank-card"
      data-qualified={qualified}
      data-selected={selected}
    >
      <div className="profile-rank-card__head">
        <span className="grimoire-kicker">{getGameModeName(mode, t)}</span>
        <span className="profile-rank-card__calibration">
          {qualified ? (
            t("competitive.games", { count: rating.ratedGames })
          ) : (
            <>
              {t("leaderboard.provisional")} ·{" "}
              <bdi dir="ltr">{`${rating.ratedGames} / ${minRatedGames}`}</bdi>
            </>
          )}
        </span>
      </div>
      <div className="profile-rank-card__body">
        <RankEmblem rank={rating.rankTier} size="small" decorative />
        <div className="min-w-0">
          <p className="profile-rank-card__name">
            {rank ? t(rank.labelKey) : t("ranks.unassigned")}
          </p>
          <p className="profile-rank-card__rating">
            <strong>{formatCompetitiveRating(rating.rating)}</strong>{" "}
            <span>{t("matchmaking.rating")}</span>
          </p>
        </div>
      </div>
      <RankProgress rank={rating.rankTier} value={rating.rankProgress} />
    </article>
  );
}

/**
 * Three cards side by side; the selected format (shared with the chart) is outlined in gold.
 * Phones show only the selected card, switched by the tabs above it.
 */
export function ProfileRanks({
  resource,
  mode,
  onModeChange,
}: {
  resource: ProfileRanksResource;
  mode: GameModeId;
  onModeChange: (mode: GameModeId) => void;
}) {
  const { t } = useI18n();
  const data = resource.result?.data;
  return (
    <section className="grimoire-section profile-ranks" data-testid="profile-rank">
      <h2 className="grimoire-section__title">{t("profile.ranks")}</h2>
      {data ? (
        <>
          <ModeTabs value={mode} onChange={onModeChange} className="profile-mode-tabs--ranks" />
          <div className="profile-rank-cards">
            {GAME_MODE_IDS.map((cardMode) => (
              <ProfileRankCard
                key={cardMode}
                mode={cardMode}
                rating={data.ratings[cardMode]}
                minRatedGames={data.minRatedGames}
                selected={cardMode === mode}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="profile-ranks__status">
          <p className="text-sm text-muted" role="status">
            {t(resource.result?.error ? "competitive.unavailable" : "competitive.loading")}
          </p>
          {Boolean(resource.result?.error) && (
            <button className="btn btn-ghost btn-sm" onClick={resource.retry}>
              {t("profile.retry")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
