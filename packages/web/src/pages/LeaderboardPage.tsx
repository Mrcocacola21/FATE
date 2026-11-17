import { CompetitiveModeSelector } from "../modes/CompetitiveModeSelector";
import { SegmentTabs } from "../ui/SegmentTabs";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { leaderboardApi } from "../api/leaderboardApi";
import { useI18n } from "../i18n";
import { HistoryPagination } from "../matches/HistoryPagination";
import { LeaderboardStandings } from "../leaderboard/LeaderboardStandings";
import { leaderboardParams, leaderboardSorts, readLeaderboardQuery } from "../leaderboard/query";
import type { LeaderboardQuery, LeaderboardResponse, LeaderboardSort } from "../leaderboard/types";
import { TacticalIcon } from "../ui/TacticalIcon";

export function LeaderboardPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const query = readLeaderboardQuery(params);
  const serialized = leaderboardParams(query).toString();
  const raw = params.toString();
  const [attempt, setAttempt] = useState(0);
  const key = `${serialized}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    data?: LeaderboardResponse;
    failed?: boolean;
  } | null>(null);
  useEffect(() => {
    if (raw !== serialized) setParams(new URLSearchParams(serialized), { replace: true });
  }, [raw, serialized, setParams]);
  useEffect(() => {
    let active = true;
    leaderboardApi.getLeaderboard(readLeaderboardQuery(new URLSearchParams(serialized))).then(
      (data) => {
        if (active) setResult({ key, data });
      },
      () => {
        if (active) setResult({ key, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [serialized, key]);
  const current = result?.key === key ? result : null;
  const data = current?.data;
  const totalPages = data?.pagination.totalPages;
  useEffect(() => {
    if (totalPages !== undefined && query.page > Math.max(1, totalPages)) {
      const next = new URLSearchParams(serialized);
      next.set("page", String(Math.max(1, totalPages)));
      setParams(next, { replace: true });
    }
  }, [totalPages, query.page, serialized, setParams]);
  const change = (patch: Partial<LeaderboardQuery>) =>
    setParams(leaderboardParams({ ...query, page: 1, ...patch }));
  const sort = (value: LeaderboardSort) =>
    change({ sort: value, order: value === query.sort && query.order === "desc" ? "asc" : "desc" });
  return (
    <section
      className="leaderboard-page"
      aria-labelledby="leaderboard-title"
      data-testid="leaderboard-page"
    >
      <header className="leaderboard-heading">
        <div>
          <p className="section-kicker">{t("leaderboard.kicker")}</p>
          <h1 id="leaderboard-title">{t("leaderboard.title")}</h1>
          <p className="leaderboard-muted">{t("leaderboard.subtitle")}</p>
        </div>
        <TacticalIcon name="leaderboard" />
      </header>
      <CompetitiveModeSelector
        className="leaderboard-modes"
        idPrefix="leaderboard-mode"
        value={query.gameMode}
        onChange={(gameMode) => change({ gameMode })}
      />
      <div className="panel-card leaderboard-panel">
        <div className="leaderboard-toolbar">
          <SegmentTabs
            className="leaderboard-tabs"
            value={query.status}
            items={(["qualified", "provisional"] as const).map((status) => ({
              value: status,
              label: t(`leaderboard.${status}`),
            }))}
            onChange={(status) => change({ status })}
            ariaLabel={t("leaderboard.status")}
            idPrefix="leaderboard-tab"
            controls="leaderboard-results"
          />
          <div className="leaderboard-sort-controls">
            <label htmlFor="leaderboard-sort">{t("leaderboard.sortBy")}</label>
            <select
              id="leaderboard-sort"
              value={query.sort}
              onChange={(event) =>
                change({ sort: event.target.value as LeaderboardSort, order: "desc" })
              }
            >
              {leaderboardSorts.map((value) => (
                <option value={value} key={value}>
                  {t(`leaderboard.${value}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={t(
                query.order === "desc" ? "leaderboard.ascending" : "leaderboard.descending",
              )}
              onClick={() => change({ order: query.order === "desc" ? "asc" : "desc" })}
            >
              {query.order === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>
        <div className="leaderboard-policy">
          <p>
            {data
              ? t("leaderboard.policy", { count: data.qualification.minRatedGames })
              : t("leaderboard.ratedOnly")}
          </p>
          <p>{t("leaderboard.uncertaintyHelp")}</p>
        </div>
        <div
          id="leaderboard-results"
          role="tabpanel"
          aria-labelledby={`leaderboard-tab-${query.status}`}
          aria-busy={!current}
        >
          {!current && (
            <p className="sr-only" role="status">
              {t("leaderboard.loading")}
            </p>
          )}
          {current?.failed ? (
            <div className="leaderboard-state" role="alert">
              <h2>{t("leaderboard.loadError")}</h2>
              <button className="btn btn-secondary" onClick={() => setAttempt(attempt + 1)}>
                {t("leaderboard.retry")}
              </button>
            </div>
          ) : data?.items.length === 0 ? (
            <div className="leaderboard-state">
              <TacticalIcon name="leaderboard" />
              <h2>
                {t(
                  `leaderboard.empty${query.status === "qualified" ? "Qualified" : "Provisional"}`,
                )}
              </h2>
              <p>{t("leaderboard.emptyHint", { count: data.qualification.minRatedGames })}</p>
            </div>
          ) : (
            <LeaderboardStandings
              items={data?.items ?? []}
              query={query}
              minRatedGames={data?.qualification.minRatedGames}
              loading={!current}
              onSort={sort}
            />
          )}
        </div>
        {data && (
          <footer className="leaderboard-footer">
            <p className="leaderboard-muted">
              {t("leaderboard.playerCount", { count: data.pagination.total })}
            </p>
            <HistoryPagination
              label={t("leaderboard.pagination")}
              pagination={data.pagination}
              onPage={(page) => change({ page })}
            />
          </footer>
        )}
      </div>
    </section>
  );
}
