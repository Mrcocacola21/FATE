import { MatchTypeBadge } from "./MatchTypeBadge";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { Avatar } from "../profile/Avatar";
import type { MatchHistoryItem } from "./types";
import {
  formatDate,
  formatDuration,
  matchDate,
  modeLabel,
  opponentName,
  outcomeLabel,
} from "./presentation";

export function MatchHistoryList({ items }: { items: MatchHistoryItem[] }) {
  const { t, language } = useI18n();
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item.id} className="history-card p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              username={item.opponent?.username ?? opponentName(item, t)}
              displayName={item.bot ? opponentName(item, t) : item.opponent?.displayName}
              avatarUrl={item.opponent?.avatarUrl ?? null}
              small
            />
            <div className="min-w-0 flex-1">
              <Link
                className="block break-words font-semibold underline"
                to={`/matches/${encodeURIComponent(item.id)}`}
              >
                <span
                  className={
                    item.result === "WIN"
                      ? "text-green-700 dark:text-green-300"
                      : item.result === "LOSS"
                        ? "text-red-700 dark:text-red-300"
                        : ""
                  }
                >
                  {outcomeLabel(item.result, t)}
                </span>
                {" · "}
                {t("matches.versus", { opponent: opponentName(item, t) })}
              </Link>
              {item.opponent?.username && (
                <Link
                  className="text-sm underline"
                  to={`/users/${encodeURIComponent(item.opponent.username)}`}
                >
                  @{item.opponent.username}
                </Link>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <MatchTypeBadge matchType={item.matchType} />
            {item.bot && <span className="text-sm text-muted">{t("play.bot")}</span>}
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt>{t("matches.gameMode")}</dt>
              <dd className="font-semibold">{modeLabel(item.gameMode, t)}</dd>
            </div>
            <div>
              <dt>{t("matches.date")}</dt>
              <dd>{formatDate(matchDate(item), language, t)}</dd>
            </div>
            <div>
              <dt>{t("matches.duration")}</dt>
              <dd>{formatDuration(item.durationMs, t)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
