import { Link } from "react-router";
import { statisticsApi } from "../api/statisticsApi";
import { matchApi } from "../api/matchApi";
import { useI18n } from "../i18n";
import { TacticalIcon } from "../ui/TacticalIcon";
import { StatisticsSummary } from "./StatisticsSummary";
import { RecentPerformance } from "./RecentPerformance";
import { GameModeBreakdown } from "./GameModeBreakdown";
import { useProfileResource } from "./useProfileResource";

export const RECENT_MATCH_LIMIT = 10;
const getRecentMatches = (userId: string) =>
  matchApi.getUserMatches(userId, {
    page: 1,
    limit: RECENT_MATCH_LIMIT,
  });

export function PlayerStatisticsSection({
  userId,
  username,
  own = false,
  revision = 0,
}: {
  userId: string;
  username: string;
  own?: boolean;
  revision?: number;
}) {
  const { t } = useI18n();
  // Independent requests start together; either failure stays inside its own section.
  const stats = useProfileResource(userId, revision, statisticsApi.getPlayerStatistics);
  const recent = useProfileResource(userId, revision, getRecentMatches);
  const data = stats.result?.data;
  return (
    <section
      className="player-statistics"
      aria-labelledby="player-statistics-title"
      data-testid="player-statistics"
    >
      <div className="stats-heading">
        <h2 id="player-statistics-title" className="section-title">
          {t("statistics.title")}
        </h2>
        <span className="section-kicker">{t("statistics.battleRecord")}</span>
      </div>
      {!stats.result ? (
        <div className="panel-card stats-loading" role="status" aria-busy="true">
          <span className="sr-only">{t("statistics.loading")}</span>
          <div className="stats-skeleton-metrics" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} />
            ))}
          </div>
          <div className="stats-skeleton-chart" aria-hidden="true" />
        </div>
      ) : stats.result.error ? (
        <div className="panel-card stats-message" role="alert">
          <h3 className="font-semibold">{t("statistics.unavailable")}</h3>
          <p className="section-copy mt-1">{t("statistics.loadError")}</p>
          <button className="btn btn-secondary mt-4" onClick={stats.retry}>
            {t("profile.retry")}
          </button>
        </div>
      ) : data?.overall.gamesPlayed === 0 ? (
        <div className="panel-card stats-empty">
          <div className="stats-empty-icon">
            <TacticalIcon name="log" />
          </div>
          <h3 className="section-title mt-4">{t("statistics.emptyTitle")}</h3>
          <p className="section-copy mt-2">
            {t(own ? "statistics.emptyOwn" : "statistics.emptyPublic")}
          </p>
          {own && (
            <Link className="btn btn-primary mt-5" to="/">
              {t("shell.play")}
            </Link>
          )}
        </div>
      ) : data ? (
        <>
          <StatisticsSummary overall={data.overall} />
          <div className="stats-analysis-grid">
            <RecentPerformance
              data={recent.result?.data}
              loading={!recent.result}
              failed={Boolean(recent.result?.error)}
              retry={recent.retry}
              historyPath={own ? "/matches" : `/users/${encodeURIComponent(username)}/matches`}
            />
            <GameModeBreakdown modes={data.byGameMode} />
          </div>
        </>
      ) : null}
    </section>
  );
}
