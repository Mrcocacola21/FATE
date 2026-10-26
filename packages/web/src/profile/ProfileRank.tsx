import type { GameModeId } from "rules";
import { GAME_MODE_IDS, getGameModeName } from "../modes/modeLabels";
import { RankProgress } from "../ranks/RankProgressPanel";
import { useI18n } from "../i18n";
import { competitiveApi, type CompetitiveRating } from "../play/api";
import { RankEmblem } from "../ranks/RankEmblem";
import { getRankPresentation } from "../ranks/rankAssets";
import { formatCompetitiveRating } from "../ranks/rankProgress";
import { useProfileResource } from "../statistics/useProfileResource";

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

/** The mode the player is strongest in, for the header kicker. */
export function bestRankedMode(ratings: Record<GameModeId, CompetitiveRating>): GameModeId {
  return GAME_MODE_IDS.reduce((best, mode) =>
    ratings[mode].rating > ratings[best].rating ? mode : best,
  );
}

function ProfileRankCard({
  mode,
  rating,
  minRatedGames,
}: {
  mode: GameModeId;
  rating: CompetitiveRating;
  minRatedGames: number;
}) {
  const { t } = useI18n();
  const rank = getRankPresentation(rating.rankTier);
  const qualified = rating.ratedGames >= minRatedGames;
  return (
    <article
      className="profile-rank-card"
      data-qualified={qualified}
      data-testid={`profile-rank-${mode}`}
    >
      <div className="profile-rank-card__head">
        <span className="grimoire-kicker">{getGameModeName(mode, t)}</span>
        <span className="profile-rank-card__calibration">
          {t(qualified ? "leaderboard.qualified" : "leaderboard.provisional")} ·{" "}
          {qualified ? (
            t("competitive.games", { count: rating.ratedGames })
          ) : (
            <bdi dir="ltr">{`${rating.ratedGames} / ${minRatedGames}`}</bdi>
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

export function ProfileRanks({ resource }: { resource: ProfileRanksResource }) {
  const { t } = useI18n();
  const data = resource.result?.data;
  return (
    <section className="grimoire-section profile-ranks" data-testid="profile-rank">
      <h2 className="grimoire-section__title">{t("profile.ranks")}</h2>
      {data ? (
        <div className="profile-rank-cards">
          {GAME_MODE_IDS.map((mode) => (
            <ProfileRankCard
              key={mode}
              mode={mode}
              rating={data.ratings[mode]}
              minRatedGames={data.minRatedGames}
            />
          ))}
        </div>
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
