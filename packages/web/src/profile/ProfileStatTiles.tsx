import type { ReactNode } from "react";
import type { GameModeId } from "rules";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { formatDuration, modeLabel } from "../matches/presentation";
import { GAME_MODE_IDS } from "../modes/modeLabels";
import type { CompetitiveRating } from "../play/api";
import { formatCompetitiveRating } from "../ranks/rankProgress";
import { formatNumber, formatWinRate } from "../statistics/presentation";
import type { PlayerStatistics } from "../statistics/types";
import { favoriteMode, peakRating, type RatingHistories } from "./profileData";

function Tile({
  label,
  value,
  context,
  secondary = false,
  tone,
}: {
  label: string;
  value: ReactNode;
  context: ReactNode;
  /** Secondary tiles fold away on phones, leaving the four headline numbers. */
  secondary?: boolean;
  tone?: "warm" | "WIN" | "LOSS" | "DRAW" | null;
}) {
  return (
    <div className="profile-tile" data-secondary={secondary || undefined}>
      <dt>{label}</dt>
      <dd className="profile-tile__value" data-tone={tone ?? undefined}>
        {value}
      </dd>
      <dd className="profile-tile__context">{context}</dd>
    </div>
  );
}

export function ProfileStatTiles({
  stats,
  loading,
  failed,
  retry,
  ratings,
  histories,
  own,
}: {
  stats?: PlayerStatistics;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  ratings?: Record<GameModeId, CompetitiveRating>;
  histories?: RatingHistories;
  own: boolean;
}) {
  const { t, language } = useI18n();
  const n = (value: number | null, digits = 0) => formatNumber(value, language, digits);
  const overall = stats?.overall;
  const ratedGames = ratings
    ? GAME_MODE_IDS.reduce((sum, mode) => sum + ratings[mode].ratedGames, 0)
    : null;
  const peak = histories ? peakRating(histories) : null;
  const favorite = stats ? favoriteMode(stats.byGameMode) : null;
  const streak = overall?.currentStreak;
  return (
    <section
      className="profile-panel profile-stats"
      aria-labelledby="profile-stats-title"
      aria-busy={loading}
      data-testid="player-statistics"
    >
      <div className="profile-panel__head">
        <h2 id="profile-stats-title" className="profile-panel__title">
          {t("statistics.title")}
        </h2>
      </div>
      {loading ? (
        <div className="profile-tiles" role="status">
          <span className="sr-only">{t("statistics.loading")}</span>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="profile-tile profile-tile--skeleton" aria-hidden="true" />
          ))}
        </div>
      ) : failed ? (
        <div className="profile-panel__message" role="alert">
          <h3>{t("statistics.unavailable")}</h3>
          <p>{t("statistics.loadError")}</p>
          <button className="btn btn-secondary btn-sm" onClick={retry}>
            {t("profile.retry")}
          </button>
        </div>
      ) : !overall || overall.gamesPlayed === 0 ? (
        <div className="profile-panel__message">
          <h3>{t("statistics.emptyTitle")}</h3>
          <p>{t(own ? "statistics.emptyOwn" : "statistics.emptyPublic")}</p>
          {own && (
            <Link className="btn btn-primary btn-sm" to="/">
              {t("shell.play")}
            </Link>
          )}
        </div>
      ) : (
        <dl className="profile-tiles">
          <Tile
            label={t("statistics.gamesPlayed")}
            value={n(overall.gamesPlayed)}
            context={
              ratedGames === null
                ? t("statistics.careerRecord")
                : t("competitive.games", { count: ratedGames })
            }
          />
          <Tile
            label={t("statistics.winRate")}
            value={formatWinRate(overall.winRate, language)}
            context={[
              t("statistics.winCount", { count: overall.wins }),
              t("statistics.lossCount", { count: overall.losses }),
              ...(overall.draws ? [t("statistics.drawCount", { count: overall.draws })] : []),
            ].join(" · ")}
          />
          <Tile
            label={t("statistics.currentStreak")}
            tone={streak?.type}
            value={
              streak?.type ? `${n(streak.count)} ${t(`statistics.short.${streak.type}`)}` : "—"
            }
            context={`${t("statistics.bestWinStreak")} · ${n(overall.longestWinStreak)}`}
          />
          <Tile
            secondary
            label={t("statistics.averageMatch")}
            value={
              overall.averageDurationMs === null
                ? "—"
                : formatDuration(overall.averageDurationMs, t)
            }
            context={`${t("statistics.averageTurns")} · ${n(overall.averageTurns, 1)}`}
          />
          <Tile
            secondary
            label={t("profile.bestRating")}
            tone="warm"
            value={peak ? formatCompetitiveRating(peak.rating) : "—"}
            context={peak ? modeLabel(peak.mode, t) : t("statistics.noReliableData")}
          />
          <Tile
            label={t("profile.favoriteMode")}
            value={favorite ? modeLabel(favorite.gameMode, t) : "—"}
            context={
              favorite
                ? t("statistics.gameCount", { count: favorite.gamesPlayed })
                : t("statistics.modesUnavailable")
            }
          />
        </dl>
      )}
    </section>
  );
}
