import { useI18n } from "../i18n";
import { getRankPresentation } from "./rankAssets";
import { formatCompetitiveRating, type RankProgress as Progress } from "./rankProgress";

/** Progress supplied by the server, independent of leaderboard qualification. */
export function RankProgress({ rank, value }: { rank: string; value: Progress }) {
  const { t } = useI18n();
  const current = getRankPresentation(rank);
  const next = getRankPresentation(value.nextTier);
  if (!current) return null;
  if (value.isMaxRank)
    return (
      <p className="rank-progress-max section-kicker" data-testid="max-rank">
        {t("ranks.maxRank")}
      </p>
    );
  if (!next) return null;
  return (
    <div className="rank-progress" data-testid="rank-progress">
      {value.progress !== null && (
        <>
          <div className="rank-progress-labels">
            <span>{t(current.labelKey)}</span>
            <span>
              {t(next.labelKey)} · {formatCompetitiveRating(value.nextRating!)}
            </span>
          </div>
          <progress
            value={value.progress}
            max={1}
            className="rank-progress-track"
            aria-label={t("ranks.progressTo", { rank: t(next.labelKey) })}
          />
        </>
      )}
      <p>
        {t("ranks.ratingToNext", { count: Math.ceil(value.ratingToNext), rank: t(next.labelKey) })}
      </p>
    </div>
  );
}
