import { useId } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { formatDate, formatDuration, modeLabel, outcomeLabel } from "../matches/presentation";
import type { MatchHistoryItem, MatchHistoryResponse } from "../matches/types";
import { formatWinRate, recentResults, recentWinTrend } from "./presentation";

function RecentTrend({ items }: { items: MatchHistoryItem[] }) {
  const { t, language } = useI18n();
  const titleId = useId();
  const descriptionId = useId();
  const trend = recentWinTrend(items);
  const x = (index: number) => 10 + (index / (items.length - 1)) * 472;
  const y = (rate: number) => 138 - rate * 126;
  return (
    <figure className="stats-trend">
      <figcaption className="stats-heading text-xs">
        <span className="font-semibold">{t("statistics.sampleWinRate")}</span>
        <span className="stats-muted">{formatWinRate(trend[trend.length - 1], language)}</span>
      </figcaption>
      <div className="stats-chart">
        <div className="stats-chart-y" aria-hidden="true">
          {[1, 0.5, 0].map((rate) => (
            <span key={rate}>{formatWinRate(rate, language)}</span>
          ))}
        </div>
        <svg viewBox="0 0 492 150" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
          <title id={titleId}>{t("statistics.sampleWinRate")}</title>
          <desc id={descriptionId}>{t("statistics.trendDescription")}</desc>
          {[0, 0.5, 1].map((rate) => (
            <g key={rate}>
              <line className="stats-grid-line" x1="10" x2="482" y1={y(rate)} y2={y(rate)} />
            </g>
          ))}
          <polyline
            className="stats-trend-line"
            points={trend.map((rate, i) => `${x(i)},${y(rate)}`).join(" ")}
          />
          {trend.map((rate, index) => (
            <circle
              key={items[index].id}
              className="stats-trend-point"
              cx={x(index)}
              cy={y(rate)}
              r="3.5"
            />
          ))}
        </svg>
      </div>
      <div className="stats-chart-x stats-muted text-xs" aria-hidden="true">
        <span>1</span>
        <span>{t("statistics.matchNumber")}</span>
        <span>{items.length}</span>
      </div>
      <p className="stats-muted text-xs leading-5">{t("statistics.trendDescription")}</p>
    </figure>
  );
}

export function RecentPerformance({
  data,
  loading,
  failed,
  retry,
  historyPath,
}: {
  data?: MatchHistoryResponse;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  historyPath: string;
}) {
  const { t, language } = useI18n();
  const items = recentResults(data?.items ?? []);
  const trend = recentWinTrend(items);
  return (
    <section
      className="panel-card stats-panel"
      aria-labelledby="stats-recent-title"
      aria-busy={loading}
    >
      <div className="stats-heading">
        <h3 id="stats-recent-title" className="section-title">
          {t("statistics.recentPerformance")}
        </h3>
        <Link className="stats-text-link text-xs" to={historyPath}>
          {t("statistics.viewAllMatches")}
        </Link>
      </div>
      {loading ? (
        <div className="stats-recent-skeleton" role="status">
          {t("matches.loading")}
        </div>
      ) : failed ? (
        <div role="alert" className="stats-message">
          <p>{t("statistics.recentError")}</p>
          <button className="btn btn-secondary mt-3" onClick={retry}>
            {t("profile.retry")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="section-copy mt-5">{t("statistics.recentEmpty")}</p>
      ) : (
        <>
          <p className="stats-muted mt-1 text-xs">
            {t("statistics.lastMatches", { count: items.length })}
          </p>
          <ol className="stats-results" aria-label={t("statistics.resultsChronological")}>
            {items.map((item) => {
              const context = [
                outcomeLabel(item.result, t),
                t("matches.versus", {
                  opponent: item.opponent?.displayName ?? t("matches.unknownOpponent"),
                }),
                modeLabel(item.gameMode, t),
                formatDuration(item.durationMs, t),
                formatDate(item.finishedAt, language, t),
              ].join(" · ");
              return (
                <li key={item.id}>
                  <Link
                    className="stats-result"
                    data-outcome={item.result}
                    aria-label={context}
                    to={`/matches/${encodeURIComponent(item.id)}`}
                  >
                    <span aria-hidden="true">{t(`statistics.short.${item.result}`)}</span>
                    <span className="stats-result-tooltip" aria-hidden="true">
                      {context}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="stats-heading stats-muted text-xs">
            <span>{t("statistics.oldest")}</span>
            <span>{t("statistics.newest")}</span>
          </div>
          {items.length >= 3 ? (
            <RecentTrend items={items} />
          ) : (
            <p className="stats-muted mt-6 text-xs">{t("statistics.smallSample")}</p>
          )}
          <details className="stats-recent-details">
            <summary>{t("statistics.matchContext")}</summary>
            <ol className="stats-recent-list">
              {items.map((item, index) => (
                <li key={item.id}>
                  <Link to={`/matches/${encodeURIComponent(item.id)}`}>
                    <span className="stats-detail-result" data-outcome={item.result}>
                      {outcomeLabel(item.result, t)}
                    </span>
                    <span className="min-w-0 break-words text-sm font-semibold">
                      {t("matches.versus", {
                        opponent: item.opponent?.displayName ?? t("matches.unknownOpponent"),
                      })}
                    </span>
                    <span className="stats-muted text-xs">
                      {modeLabel(item.gameMode, t)} · {formatDuration(item.durationMs, t)}
                    </span>
                    <span className="stats-muted text-xs">
                      {formatDate(item.finishedAt, language, t)}
                    </span>
                    <span className="stats-muted text-xs">
                      {t("statistics.sampleRateAtMatch", {
                        index: index + 1,
                        rate: formatWinRate(trend[index], language),
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
  );
}
