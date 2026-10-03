import type { ReactNode } from "react";
import { useI18n } from "../i18n";
import { formatDuration, outcomeLabel } from "../matches/presentation";
import { formatNumber, formatWinRate, sampleLabel } from "./presentation";
import type { OverallStatistics } from "./types";

function MetricCard({
  label,
  value,
  context,
  prominent = false,
  outcome,
}: {
  label: string;
  value: ReactNode;
  context: string;
  prominent?: boolean;
  outcome?: string | null;
}) {
  return (
    <div className={`stats-metric${prominent ? " stats-metric-primary" : ""}`}>
      <dt className="field-label">{label}</dt>
      <dd className="stats-metric-value" data-outcome={outcome}>
        {value}
      </dd>
      <dd className="stats-muted text-xs leading-5">{context}</dd>
    </div>
  );
}

export function StatisticsSummary({ overall }: { overall: OverallStatistics }) {
  const { t, language } = useI18n();
  const n = (value: number | null, digits = 0) => formatNumber(value, language, digits);
  const streak = overall.currentStreak;
  return (
    <section className="panel-card stats-overview" aria-labelledby="stats-overview-title">
      <div className="stats-heading">
        <h3 id="stats-overview-title" className="section-kicker">
          {t("statistics.overview")}
        </h3>
        <span className="stats-muted text-xs">{t("statistics.completedOnly")}</span>
      </div>
      <dl className="stats-metrics">
        <MetricCard
          label={t("statistics.winRate")}
          value={formatWinRate(overall.winRate, language)}
          context={t("statistics.winRateContext")}
          prominent
        />
        <MetricCard
          label={t("statistics.gamesPlayed")}
          value={n(overall.gamesPlayed)}
          context={t("statistics.careerRecord")}
        />
        <MetricCard
          label={t("statistics.record")}
          value={`${n(overall.wins)} / ${n(overall.losses)}`}
          context={
            overall.draws
              ? t("statistics.drawCount", { count: overall.draws })
              : t("statistics.recordContext")
          }
        />
        <MetricCard
          label={t("statistics.currentStreak")}
          outcome={streak.type}
          value={streak.type ? `${outcomeLabel(streak.type, t)} × ${n(streak.count)}` : "—"}
          context={t("statistics.consecutiveResults")}
        />
      </dl>
      <dl className="stats-secondary">
        <div>
          <dt className="field-label">{t("statistics.averageMatch")}</dt>
          <dd className="text-lg font-semibold">
            {overall.averageDurationMs === null
              ? "—"
              : formatDuration(overall.averageDurationMs, t)}
          </dd>
          <dd className="stats-muted text-xs">
            {sampleLabel(overall.durationSampleSize, overall.gamesPlayed, t)}
          </dd>
        </div>
        <div>
          <dt className="field-label">{t("statistics.averageTurns")}</dt>
          <dd className="text-lg font-semibold">{n(overall.averageTurns, 2)}</dd>
          <dd className="stats-muted text-xs">
            {sampleLabel(overall.turnCountSampleSize, overall.gamesPlayed, t)}
          </dd>
        </div>
        <div>
          <dt className="field-label">{t("statistics.bestWinStreak")}</dt>
          <dd className="text-lg font-semibold">{n(overall.longestWinStreak)}</dd>
          <dd className="stats-muted text-xs">{t("statistics.consecutiveWins")}</dd>
        </div>
      </dl>
    </section>
  );
}
