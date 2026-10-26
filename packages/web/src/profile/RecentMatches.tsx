import { Link } from "react-router";
import { useI18n } from "../i18n";
import { formatDuration, modeLabel, outcomeLabel } from "../matches/presentation";
import type { MatchHistoryItem } from "../matches/types";
import { SquadStrip } from "./ProfileHeroes";
import { formatRatingDelta } from "./RatingChart";

function MatchRow({ item, delta }: { item: MatchHistoryItem; delta?: number }) {
  const { t, language } = useI18n();
  const opponent = item.opponent?.displayName ?? t("matches.unknownOpponent");
  const path = `/matches/${encodeURIComponent(item.id)}`;
  return (
    <li className="profile-match" data-outcome={item.result ?? undefined}>
      <Link className="profile-match__main" to={path}>
        <span className="profile-match__result" aria-label={outcomeLabel(item.result, t)}>
          <span aria-hidden="true">{item.result ? t(`statistics.short.${item.result}`) : "—"}</span>
        </span>
        <span className="profile-match__body">
          <strong dir="auto">{t("matches.versus", { opponent })}</strong>
          <span>
            {modeLabel(item.gameMode, t)} · {formatDuration(item.durationMs, t)}
            {item.finishedAt && (
              <span className="profile-match__date">
                {" · "}
                {new Date(item.finishedAt).toLocaleDateString(language)}
              </span>
            )}
          </span>
        </span>
      </Link>
      <SquadStrip squad={item.squad} />
      <span
        className="profile-match__delta"
        data-sign={delta === undefined ? undefined : Math.sign(Math.round(delta))}
        aria-label={
          delta === undefined
            ? undefined
            : `${t("profile.ratingChange")} ${formatRatingDelta(delta)}`
        }
      >
        {delta === undefined ? "" : formatRatingDelta(delta)}
      </span>
      <Link className="profile-match__replay" to={`${path}/replay`}>
        {t("profile.replay")}
      </Link>
    </li>
  );
}

export function RecentMatches({
  items,
  deltas,
  loading,
  failed,
  retry,
  historyPath,
}: {
  items?: MatchHistoryItem[];
  deltas?: Map<string, number>;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  historyPath: string;
}) {
  const { t } = useI18n();
  return (
    <section
      className="profile-panel profile-matches"
      aria-labelledby="profile-matches-title"
      aria-busy={loading}
      data-testid="profile-recent-matches"
    >
      <div className="profile-panel__head">
        <h2 id="profile-matches-title" className="profile-panel__title">
          {t("profile.recentMatches")}
        </h2>
        <Link className="profile-panel__link" to={historyPath}>
          {t("statistics.viewAllMatches")}
        </Link>
      </div>
      {loading ? (
        <p className="profile-panel__message" role="status">
          {t("matches.loading")}
        </p>
      ) : failed ? (
        <div className="profile-panel__message" role="alert">
          <p>{t("statistics.recentError")}</p>
          <button className="btn btn-secondary btn-sm" onClick={retry}>
            {t("profile.retry")}
          </button>
        </div>
      ) : !items || items.length === 0 ? (
        <p className="profile-panel__message">{t("statistics.recentEmpty")}</p>
      ) : (
        <ol className="profile-match-list">
          {items.map((item) => (
            <MatchRow key={item.id} item={item} delta={deltas?.get(item.id)} />
          ))}
        </ol>
      )}
    </section>
  );
}
