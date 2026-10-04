import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { GameModeId } from "rules";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { GAME_MODE_IDS, getGameModeName } from "../modes/modeLabels";
import { MatchTypeBadge } from "../matches/MatchTypeBadge";
import { queue, useQueue } from "./store";
import { useGameStore } from "../store";
import { formatCompetitiveRating } from "../ranks/rankProgress";

export function MatchmakingPanel() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const { status, busy, error, rating, receivedAt } = useQueue((s) => s);
  const joinError = useGameStore((s) => s.joinError);
  const [mode, setMode] = useState<GameModeId>("standard");
  const [now, setNow] = useState(Date.now());
  const waiting = status.status === "QUEUED" || status.status === "MATCHING";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  const seconds = waiting ? Math.floor((status.waitMs + Math.max(0, now - receivedAt)) / 1000) : 0;
  const elapsed = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const activeMatch = error === "MATCHMAKING_ALREADY_IN_MATCH" || error === "MATCHMAKING_IN_QUEUE";
  return (
    <section
      className="matchmaking-panel panel-card min-w-0 space-y-4 rounded-xl border border-white/10 p-4 sm:p-5"
      data-testid="matchmaking-panel"
      aria-labelledby="matchmaking-title"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="matchmaking-title" className="font-display text-xl font-semibold">
          {t("matchmaking.title")}
        </h2>
        <MatchTypeBadge matchType="RATED" />
      </div>
      <p className="text-sm text-muted">{t("matchmaking.description")}</p>
      {!user ? (
        <Link className="btn btn-primary" to="/login">
          {t("matchmaking.signIn")}
        </Link>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-5">
            {waiting && <div>
              <p className="text-xs text-muted">{t("matchmaking.rating")}</p>
              <p className="text-lg font-semibold tabular-nums">
                {rating === null ? "—" : formatCompetitiveRating(rating)}
              </p>
            </div>}
            {!waiting && status.status !== "MATCH_FOUND" && (
              <label className="min-w-0 text-sm">
                {t("matchmaking.mode")}
                <select
                  className="field-control mt-1 block w-full"
                  aria-label={t("matchmaking.mode")}
                  value={mode}
                  disabled={busy}
                  onChange={(e) => setMode(e.target.value as GameModeId)}
                >
                  {GAME_MODE_IDS.map((value) => (
                    <option key={value} value={value}>
                      {getGameModeName(value, t)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {waiting && (
              <>
                <p className="text-sm">{getGameModeName(status.gameMode, t)}</p>
                <div>
                  <p className="text-xs text-muted">{t("matchmaking.time")}</p>
                  <p className="text-lg tabular-nums" data-testid="queue-time">
                    {elapsed}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">{t("matchmaking.range")}</p>
                  <p className="text-lg tabular-nums">
                    {Math.round(status.rating - status.currentRange)} –{" "}
                    {Math.round(status.rating + status.currentRange)}{" "}
                    <span className="text-sm text-muted">(±{status.currentRange})</span>
                  </p>
                </div>
              </>
            )}
          </div>
          {waiting ? (
            <>
              <p role="status" className="text-sm">
                {t(status.status === "MATCHING" ? "matchmaking.creating" : "matchmaking.searching")}
              </p>
              <p className="text-xs text-muted">{t("matchmaking.expands")}</p>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || status.status === "MATCHING"}
                onClick={() => void queue.cancel()}
              >
                {t("matchmaking.cancel")}
              </button>
            </>
          ) : status.status === "MATCH_FOUND" ? (
            <div>
              <p role="status" className="break-words">
                {t("matchmaking.found")}
              </p>
              <p className="mt-3 font-display text-xl">{t("competitive.you")} <span className="text-muted">{t("customLobby.vs")}</span> {status.opponent.displayName}</p>
              <p className="mt-2 text-sm text-muted">{t("matchTypes.RATED")} · {getGameModeName(status.gameMode, t)} · {t("matchmaking.entering")}</p>
              {joinError && (
                <>
                  <p role="alert" className="fate-notice mt-2 text-sm">
                    {t("matchmaking.error")}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary mt-2"
                    onClick={() => {
                      void useGameStore
                        .getState()
                        .joinRoom({ mode: "join", roomId: status.roomId, role: status.seat })
                        .catch(() => useGameStore.setState({ joinError: t("matchmaking.error") }));
                    }}
                  >
                    {t("matchmaking.retry")}
                  </button>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void queue.join(mode)}
            >
              {t("matchmaking.find")}
            </button>
          )}
          {error && (
            <p role="alert" className="fate-notice text-sm">
              {t(
                activeMatch
                  ? "matchmaking.activeMatch"
                  : error === "AUTH_REQUIRED" || error === "INVALID_ACCESS_TOKEN"
                    ? "matchmaking.signIn"
                    : "matchmaking.error",
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
