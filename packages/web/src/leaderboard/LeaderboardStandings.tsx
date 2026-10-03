import { Link } from "react-router";
import { useI18n } from "../i18n";
import { Avatar } from "../profile/Avatar";
import { formatDate } from "../matches/presentation";
import type { LeaderboardPlayer, LeaderboardQuery, LeaderboardSort } from "./types";

function PlayerIdentity({
  player,
  mobile = false,
}: {
  player: LeaderboardPlayer;
  mobile?: boolean;
}) {
  return (
    <Link className="leaderboard-player" to={`/users/${encodeURIComponent(player.user.username)}`}>
      {mobile && player.ratingRank !== null && (
        <span className="leaderboard-rank" data-top={player.ratingRank <= 3 || undefined}>
          #{player.ratingRank}
        </span>
      )}
      <Avatar {...player.user} small />
      <span className="leaderboard-name">
        <strong>{player.user.displayName || player.user.username}</strong>
        <span>@{player.user.username}</span>
      </span>
    </Link>
  );
}

export function LeaderboardStandings({
  items,
  query,
  minRatedGames,
  loading,
  onSort,
}: {
  items: LeaderboardPlayer[];
  query: LeaderboardQuery;
  minRatedGames?: number;
  loading: boolean;
  onSort: (sort: LeaderboardSort) => void;
}) {
  const { t, language } = useI18n();
  const qualified = query.status === "qualified";
  const columns: { key: string; sort?: LeaderboardSort }[] = [
    ...(qualified ? [{ key: "rank" }] : []),
    { key: "player" },
    { key: "rating", sort: "rating" },
    { key: "uncertainty" },
    { key: "gamesPlayed", sort: "gamesPlayed" },
    ...(!qualified ? [{ key: "remaining" }] : []),
    { key: "winRate", sort: "winRate" },
    { key: "lastActivity", sort: "lastActivity" },
  ];
  const winRate = (player: LeaderboardPlayer) =>
    player.winRate === null
      ? t("matches.unavailable")
      : new Intl.NumberFormat(language, { style: "percent", maximumFractionDigits: 1 }).format(
          player.winRate,
        );
  const games = (player: LeaderboardPlayer) =>
    qualified ? player.ratedGames : `${player.ratedGames} / ${minRatedGames}`;
  return (
    <>
      <div className="leaderboard-desktop">
        <table className="leaderboard-table">
          <caption className="sr-only">{t(`leaderboard.${query.status}`)}</caption>
          <thead>
            <tr>
              {columns.map(({ key, sort }) => (
                <th
                  key={key}
                  scope="col"
                  aria-sort={
                    sort === query.sort
                      ? query.order === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {sort ? (
                    <button type="button" onClick={() => onSort(sort)}>
                      {t(`leaderboard.${key}`)}
                      {sort === query.sort && (
                        <span aria-hidden="true"> {query.order === "asc" ? "↑" : "↓"}</span>
                      )}
                    </button>
                  ) : (
                    <span
                      title={key === "uncertainty" ? t("leaderboard.uncertaintyHelp") : undefined}
                    >
                      {t(`leaderboard.${key}`)}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} aria-hidden="true">
                    {columns.map(({ key }) => (
                      <td key={key}>
                        <span className="leaderboard-skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              : items.map((player) => (
                  <tr
                    key={player.user.id}
                    data-top={(qualified && player.ratingRank! <= 3) || undefined}
                  >
                    {qualified && <td className="leaderboard-rank">#{player.ratingRank}</td>}
                    <td>
                      <PlayerIdentity player={player} />
                    </td>
                    <td className="leaderboard-rating" title={String(player.rating)}>
                      {Math.round(player.rating)}
                    </td>
                    <td
                      title={t("leaderboard.uncertaintyHelp")}
                    >{`±${Math.round(player.ratingDeviation)}`}</td>
                    <td>{games(player)}</td>
                    {!qualified && (
                      <td className="leaderboard-progress">
                        {t("leaderboard.untilRanked", { count: player.gamesUntilQualified })}
                      </td>
                    )}
                    <td
                      title={
                        player.performanceAvailable
                          ? t("leaderboard.record", {
                              wins: player.wins,
                              losses: player.losses,
                              draws: player.draws,
                            })
                          : t("leaderboard.performanceUnavailable")
                      }
                    >
                      {winRate(player)}
                      {player.performanceAvailable && (
                        <span className="leaderboard-record">
                          {t("leaderboard.recordCompact", {
                            wins: player.wins,
                            losses: player.losses,
                            draws: player.draws,
                          })}
                        </span>
                      )}
                    </td>
                    <td className="leaderboard-activity">
                      {formatDate(player.lastActivity, language, t)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <div className="leaderboard-mobile">
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="leaderboard-mobile-card" aria-hidden="true">
                <span className="leaderboard-skeleton" />
                <span className="leaderboard-skeleton" />
              </div>
            ))
          : items.map((player) => (
              <article
                key={player.user.id}
                className="leaderboard-mobile-card"
                data-top={(qualified && player.ratingRank! <= 3) || undefined}
              >
                <PlayerIdentity player={player} mobile />
                <dl className="leaderboard-mobile-metrics">
                  <div>
                    <dt>{t("leaderboard.rating")}</dt>
                    <dd className="leaderboard-rating">{Math.round(player.rating)}</dd>
                  </div>
                  <div>
                    <dt>{t("leaderboard.winRate")}</dt>
                    <dd
                      title={
                        player.performanceAvailable
                          ? t("leaderboard.record", {
                              wins: player.wins,
                              losses: player.losses,
                              draws: player.draws,
                            })
                          : t("leaderboard.performanceUnavailable")
                      }
                    >
                      {winRate(player)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("leaderboard.gamesPlayed")}</dt>
                    <dd>{games(player)}</dd>
                  </div>
                  <div>
                    <dt>{t("leaderboard.uncertainty")}</dt>
                    <dd
                      title={t("leaderboard.uncertaintyHelp")}
                    >{`±${Math.round(player.ratingDeviation)}`}</dd>
                  </div>
                </dl>
                {!qualified && (
                  <p className="leaderboard-progress">
                    {t("leaderboard.untilRanked", { count: player.gamesUntilQualified })}
                  </p>
                )}
                <p className="leaderboard-activity">
                  {t("leaderboard.lastActivity")}: {formatDate(player.lastActivity, language, t)}
                </p>
                {player.performanceAvailable && (
                  <p className="leaderboard-record">
                    {t("leaderboard.record", {
                      wins: player.wins,
                      losses: player.losses,
                      draws: player.draws,
                    })}
                  </p>
                )}
                {!player.performanceAvailable && (
                  <p className="leaderboard-muted">{t("leaderboard.performanceUnavailable")}</p>
                )}
              </article>
            ))}
      </div>
    </>
  );
}
