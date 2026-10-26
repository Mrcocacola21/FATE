import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { GameModeId } from "rules";
import { useI18n } from "../i18n";
import { GAME_MODE_IDS, getGameModeName } from "../modes/modeLabels";
import type { CompetitiveRating, RatingHistoryEntry } from "../play/api";
import { getRankPresentation } from "../ranks/rankAssets";
import { formatCompetitiveRating } from "../ranks/rankProgress";
import { chartPoints, chartScale, type ChartPoint } from "./profileData";

const WIDTH = 560;
const HEIGHT = 180;
const LEFT = 40;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 12;

export function formatRatingDelta(delta: number) {
  const value = Math.round(delta);
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}

/** Format tabs shared by the chart (desktop) and the rank cards (mobile). */
export function ModeTabs({
  value,
  onChange,
  className,
}: {
  value: GameModeId;
  onChange: (mode: GameModeId) => void;
  className: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`profile-mode-tabs ${className}`}
      role="group"
      aria-label={t("matchmaking.mode")}
    >
      {GAME_MODE_IDS.map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
        >
          {getGameModeName(mode, t)}
        </button>
      ))}
    </div>
  );
}

function ChartTooltip({ point, index }: { point: ChartPoint; index: number }) {
  const { t, language } = useI18n();
  const entry = point.entry;
  return (
    <>
      <strong>{formatCompetitiveRating(point.rating)}</strong>
      {entry ? (
        <>
          <span data-sign={Math.sign(Math.round(entry.ratingDelta))}>
            {formatRatingDelta(entry.ratingDelta)}
          </span>
          <span>
            {t("profile.chartGame", { index })}
            {entry.result ? ` · ${t(`matches.${entry.result}`)}` : ""}
          </span>
          <span>{new Date(entry.createdAt).toLocaleDateString(language)}</span>
        </>
      ) : (
        <span>{t("profile.chartStart")}</span>
      )}
    </>
  );
}

function Chart({ history, rating }: { history: RatingHistoryEntry[]; rating?: CompetitiveRating }) {
  const { t } = useI18n();
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);
  const points = chartPoints(history);
  const ratings = points.map((point) => point.rating);
  const threshold = rating?.rankProgress.nextRating ?? null;
  const scale = chartScale(ratings, threshold);
  const x = (index: number) => LEFT + (index / (points.length - 1)) * (WIDTH - LEFT - RIGHT);
  const y = (value: number) =>
    TOP + ((scale.max - value) / (scale.max - scale.min)) * (HEIGHT - TOP - BOTTOM);
  const first = ratings[0];
  const last = ratings[ratings.length - 1];
  const peak = Math.max(...ratings);
  const nextRank = getRankPresentation(rating?.rankProgress.nextTier);
  const summary = t("profile.chartSummary", {
    games: points.length - 1,
    from: formatCompetitiveRating(first),
    to: formatCompetitiveRating(last),
    peak: formatCompetitiveRating(peak),
  });
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - box.left) / box.width) * WIDTH;
    const ratio = (position - LEFT) / (WIDTH - LEFT - RIGHT);
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  };
  const step = (event: KeyboardEvent<SVGSVGElement>) => {
    const move = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[event.key];
    if (move === undefined) return;
    event.preventDefault();
    setActive((current) =>
      Math.max(0, Math.min(points.length - 1, (current ?? points.length - 1) + move)),
    );
  };
  return (
    <>
      <div className="profile-chart__plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={pick}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(points.length - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={step}
        >
          <title id={titleId}>{summary}</title>
          {scale.ticks.map((tick) => (
            <g key={tick} className="profile-chart__grid">
              <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(tick)} y2={y(tick)} />
              <text x={LEFT - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                {tick}
              </text>
            </g>
          ))}
          {scale.showThreshold && threshold !== null && (
            <g className="profile-chart__threshold">
              <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(threshold)} y2={y(threshold)} />
              <text x={WIDTH - RIGHT} y={y(threshold) - 6} textAnchor="end">
                {nextRank ? `${t(nextRank.labelKey)} · ` : ""}
                {formatCompetitiveRating(threshold)}
              </text>
            </g>
          )}
          {active !== null && (
            <line
              className="profile-chart__crosshair"
              x1={x(active)}
              x2={x(active)}
              y1={TOP}
              y2={HEIGHT - BOTTOM}
            />
          )}
          <polyline
            className="profile-chart__line"
            points={points.map((point, index) => `${x(index)},${y(point.rating)}`).join(" ")}
          />
          {points.map((point, index) => (
            <circle
              key={index}
              className="profile-chart__point"
              data-sign={point.entry ? Math.sign(Math.round(point.entry.ratingDelta)) : 0}
              data-active={active === index || undefined}
              cx={x(index)}
              cy={y(point.rating)}
              r={active === index ? 5.5 : 4}
            />
          ))}
        </svg>
        {active !== null && (
          <div
            className="profile-chart__tooltip"
            aria-hidden="true"
            data-side={x(active) > WIDTH / 2 ? "left" : "right"}
            style={{ left: `${(x(active) / WIDTH) * 100}%` }}
          >
            <ChartTooltip point={points[active]} index={active} />
          </div>
        )}
      </div>
      <div className="profile-chart__legend">
        <span>
          {t("profile.chartStart")} · <strong>{formatCompetitiveRating(first)}</strong>
        </span>
        <span>
          {t("profile.chartPeak")} · <strong>{formatCompetitiveRating(peak)}</strong>
        </span>
        <span>
          {t("profile.chartNow")} · <strong>{formatCompetitiveRating(last)}</strong>
        </span>
      </div>
      {/* sr-only on the wrapper: a table ignores width: 1px and would widen the page. */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">{t("profile.chartGame", { index: "#" })}</th>
              <th scope="col">{t("matchmaking.rating")}</th>
              <th scope="col">{t("profile.ratingChange")}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={index}>
                <th scope="row">
                  {point.entry ? t("profile.chartGame", { index }) : t("profile.chartStart")}
                </th>
                <td>{formatCompetitiveRating(point.rating)}</td>
                <td>{point.entry ? formatRatingDelta(point.entry.ratingDelta) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function RatingChart({
  history,
  loading,
  failed,
  retry,
  mode,
  onModeChange,
  rating,
}: {
  history?: RatingHistoryEntry[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
  mode: GameModeId;
  onModeChange: (mode: GameModeId) => void;
  rating?: CompetitiveRating;
}) {
  const { t } = useI18n();
  return (
    <section
      className="profile-panel profile-chart"
      aria-labelledby="profile-chart-title"
      aria-busy={loading}
      data-testid="profile-rating-chart"
    >
      <div className="profile-panel__head">
        <h2 id="profile-chart-title" className="profile-panel__title">
          {t("profile.ratingHistory")}
        </h2>
        <ModeTabs value={mode} onChange={onModeChange} className="profile-mode-tabs--chart" />
      </div>
      {loading ? (
        <div className="profile-chart__placeholder" role="status">
          <span className="sr-only">{t("competitive.loading")}</span>
        </div>
      ) : failed ? (
        <div className="profile-chart__placeholder" role="alert">
          <p>{t("profile.chartError")}</p>
          <button className="btn btn-ghost btn-sm" onClick={retry}>
            {t("profile.retry")}
          </button>
        </div>
      ) : history && history.length > 0 ? (
        <Chart key={mode} history={history} rating={rating} />
      ) : (
        <div className="profile-chart__placeholder">
          <p>{t("profile.chartEmpty")}</p>
        </div>
      )}
    </section>
  );
}
