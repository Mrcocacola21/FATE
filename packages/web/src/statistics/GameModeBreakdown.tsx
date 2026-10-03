import { useI18n } from "../i18n";
import { formatDuration, modeLabel } from "../matches/presentation";
import { formatNumber, formatWinRate, sampleLabel } from "./presentation";
import type { GameModeStatistics } from "./types";

export function GameModeBreakdown({ modes }: { modes: GameModeStatistics[] }) {
  const { t, language } = useI18n();
  return (
    <section className="panel-card stats-panel" aria-labelledby="stats-modes-title">
      <h3 id="stats-modes-title" className="section-title">
        {t("statistics.gameModes")}
      </h3>
      <p className="stats-muted mt-1 text-xs">{t("statistics.modeDescription")}</p>
      {modes.length === 0 ? (
        <p className="section-copy mt-5">{t("statistics.modesUnavailable")}</p>
      ) : (
        <ul className="stats-mode-list">
          {modes.map((mode) => (
            <li key={mode.gameMode}>
              <div className="stats-heading items-start">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-semibold">
                    {modeLabel(mode.gameMode, t)}
                  </h4>
                  <p className="stats-muted mt-1 text-xs">
                    {t("statistics.gameCount", { count: mode.gamesPlayed })}
                  </p>
                </div>
                <span className="text-lg font-semibold tabular-nums">
                  {formatWinRate(mode.winRate, language)}
                </span>
              </div>
              <div className="stats-mode-bar" aria-hidden="true">
                <span style={{ width: `${mode.winRate * 100}%` }} />
              </div>
              <p className="stats-mode-record text-xs">
                <span data-outcome="WIN">{t("statistics.winCount", { count: mode.wins })}</span>
                <span data-outcome="LOSS">{t("statistics.lossCount", { count: mode.losses })}</span>
                {mode.draws > 0 && <span>{t("statistics.drawCount", { count: mode.draws })}</span>}
              </p>
              <dl className="stats-mode-averages">
                <div>
                  <dt>{t("statistics.averageMatch")}</dt>
                  <dd>
                    {mode.averageDurationMs === null
                      ? "—"
                      : formatDuration(mode.averageDurationMs, t)}
                  </dd>
                  <dd className="stats-muted">
                    {sampleLabel(mode.durationSampleSize, mode.gamesPlayed, t)}
                  </dd>
                </div>
                <div>
                  <dt>{t("statistics.averageTurns")}</dt>
                  <dd>{formatNumber(mode.averageTurns, language, 2)}</dd>
                  <dd className="stats-muted">
                    {sampleLabel(mode.turnCountSampleSize, mode.gamesPlayed, t)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
