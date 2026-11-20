import type { GameModeId } from "rules";
import { ActiveMatchNotice } from "../matches/ActiveMatchNotice";
import { CompetitiveModeSelector } from "../modes/CompetitiveModeSelector";
import { useEffect, useState } from "react";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { MatchmakingPanel } from "../matchmaking/MatchmakingPanel";
import { useQueue } from "../matchmaking/store";
import { RunePage } from "../features/runes/RunePage";
import { competitiveApi, type CompetitiveRating } from "../play/api";
import { RankEmblem, rankNameKey } from "../ranks/RankEmblem";
import { RankProgress } from "../ranks/RankProgressPanel";
import { formatCompetitiveRating } from "../ranks/rankProgress";
import { SegmentTabs } from "../ui/SegmentTabs";
import { BotChallenge } from "../play/botMatch";
import {
  BOT_DIFFICULTIES,
  BotSigil,
  CasualSigil,
  DifficultySeal,
  RatedSigil,
  type BotDifficulty,
} from "../play/PlaySigils";

export type PlayPath = "rated" | "casual" | "bot";

function CasualIdentity() {
  const { t } = useI18n();
  return (
    <section className="competitive-identity play-casual" aria-label={t("play.casualTitle")}>
      <span className="play-medallion" aria-hidden="true">
        <CasualSigil />
      </span>
      <p className="competitive-rank-name font-display">{t("play.casualTitle")}</p>
      <p className="play-lore">{t("play.casualLore")}</p>
      <p className="play-note">{t("play.casualNote")}</p>
    </section>
  );
}

function BotIdentity({
  level,
  onChange,
}: {
  level: BotDifficulty;
  onChange: (level: BotDifficulty) => void;
}) {
  const { t } = useI18n();
  return (
    <section className="competitive-identity play-bot" aria-label={t("play.bot")}>
      <span className="play-bot__hero">
        <DifficultySeal level={level} />
      </span>
      <p className="competitive-rank-name font-display" data-testid="bot-level-name">
        {t(`play.levels.${level}`)}
      </p>
      <p className="play-lore">{t(`play.levels.${level}Lore`)}</p>
      <div className="play-bot__levels" role="radiogroup" aria-label={t("play.difficulty")}>
        {BOT_DIFFICULTIES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={value === level}
            className="play-bot__level"
            data-testid={`bot-level-${value}`}
            onClick={() => onChange(value)}
          >
            <DifficultySeal level={value} />
            <span>{t(`play.levels.${value}`)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function CompetitiveIdentity({
  rating,
  minRatedGames,
  name,
}: {
  rating: CompetitiveRating;
  minRatedGames: number;
  name: string;
}) {
  const { t } = useI18n();
  const qualified = rating.ratedGames >= minRatedGames;
  const remaining = Math.max(0, minRatedGames - rating.ratedGames);
  return (
    <section className="competitive-identity" aria-label={t("competitive.identity")}>
      <RankEmblem rank={rating.rankTier} calibrating={!qualified} size="hero" decorative />
      <p className="competitive-rank-name font-display" data-testid="competitive-rank-name">
        {t(rankNameKey(rating.rankTier, !qualified))}
      </p>
      <p className="competitive-rating" data-testid="competitive-rating">
        {formatCompetitiveRating(rating.rating)}
      </p>
      <p className="section-kicker">{t("matchmaking.rating")}</p>
      <div className="competitive-secondary">
        <p className="competitive-player">{name}</p>
        <p className="competitive-uncertainty" title={t("leaderboard.uncertaintyHelp")}>
          {t("competitive.uncertainty", { value: Math.round(rating.ratingDeviation) })}
        </p>
      </div>
      {qualified && <RankProgress rank={rating.rankTier} value={rating.rankProgress} />}
      <div className="qualification-block">
        <div className="qualification-label">
          <span>{t(qualified ? "leaderboard.qualified" : "leaderboard.provisional")}</span>
          <span>{t("competitive.games", { count: rating.ratedGames })}</span>
        </div>
        {!qualified && (
          <>
            <progress
              className="qualification-progress"
              value={rating.ratedGames}
              max={minRatedGames}
              aria-label={t("competitive.qualification")}
            />
            <p className="text-sm text-muted">
              {rating.ratedGames} / {minRatedGames} ·{" "}
              {t("leaderboard.untilRanked", { count: remaining })}
            </p>
          </>
        )}
        {qualified && <p className="mt-3 text-sm text-muted">{t("competitive.qualified")}</p>}
      </div>
    </section>
  );
}

export function PlayPage() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const queueState = useQueue((s) => s.status);
  const queueBusy = useQueue((s) => s.busy);
  const queueStatus = queueState.status;
  const [selectedMode, setMode] = useState<GameModeId>("standard");
  const [chosenPath, setPath] = useState<PlayPath>("rated");
  const [botLevel, setBotLevel] = useState<BotDifficulty>("sorcerer");
  const mode = queueState.status === "NOT_QUEUED" ? selectedMode : queueState.gameMode;
  const searching =
    queueStatus === "QUEUED" ||
    queueStatus === "MATCH_PROPOSED" ||
    queueStatus === "MATCHING" ||
    queueStatus === "MATCH_FOUND";
  // A search in progress shows its own queue, whichever tab was open.
  const path: PlayPath =
    queueState.status === "NOT_QUEUED"
      ? chosenPath
      : queueState.matchType === "CASUAL"
        ? "casual"
        : "rated";
  const [data, setData] = useState<{
    owner: string;
    ratings: Record<GameModeId, CompetitiveRating>;
    min: number;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setFailed(false);
    const load = () =>
      Promise.all([competitiveApi.ratings(user.id), competitiveApi.config()]).then(
        ([ratings, min]) => {
          if (active) {
            setData({ owner: user.id, ratings, min });
            setFailed(false);
          }
        },
        () => {
          if (active) setFailed(true);
        },
      );
    void load();
    const refresh = () => {
      void load();
    };
    if (typeof window !== "undefined") window.addEventListener("focus", refresh);
    return () => {
      active = false;
      if (typeof window !== "undefined") window.removeEventListener("focus", refresh);
    };
  }, [user, attempt]);
  const current = data?.owner === user?.id ? data : null;
  // Searching turns the page in runes.
  return (
    <RunePage
      turn={searching}
      gather={false}
      // Entering a match, the sealed offer takes the window apart, not this page.
      leave={() => false}
      tone="gold"
      className="play-page competitive-page mx-auto max-w-5xl"
      data-testid="play-page"
    >
      <ActiveMatchNotice />
      <header className="play-header mb-5">
        <p className="section-kicker">
          {t(
            path === "rated"
              ? "competitive.kicker"
              : path === "casual"
                ? "play.casualKicker"
                : "play.botKicker",
          )}
        </p>
        <h1 className="font-display mt-1 text-3xl font-semibold sm:text-4xl">{t("shell.play")}</h1>
        <p className="mt-2 text-sm text-muted">
          {t(
            path === "rated"
              ? "competitive.description"
              : path === "casual"
                ? "play.casualDescription"
                : "play.botDescription",
          )}
        </p>
      </header>
      {!searching && (
        <SegmentTabs
          className="play-paths"
          value={path}
          onChange={setPath}
          ariaLabel={t("play.paths")}
          idPrefix="play-path"
          controls="play-path-panel"
          stretch
          items={[
            {
              value: "rated",
              label: t("play.rated"),
              caption: t("play.ratedCaption"),
              icon: <RatedSigil />,
            },
            {
              value: "casual",
              label: t("play.casual"),
              caption: t("play.casualCaption"),
              icon: <CasualSigil />,
            },
            {
              value: "bot",
              label: t("play.bot"),
              caption: t("play.botCaption"),
              icon: <BotSigil />,
            },
          ]}
        />
      )}
      <div
        className="competitive-hub mt-5"
        data-searching={searching}
        data-path={path}
        id="play-path-panel"
        role={searching ? undefined : "tabpanel"}
        aria-labelledby={searching ? undefined : `play-path-${path}`}
      >
        {!searching && (
          <div
            className="competitive-shrine"
            id="competitive-mode-panel"
            role="tabpanel"
            aria-labelledby={`competitive-mode-${mode}`}
          >
            {path === "casual" ? (
              <CasualIdentity />
            ) : path === "bot" ? (
              <BotIdentity level={botLevel} onChange={setBotLevel} />
            ) : current ? (
              <CompetitiveIdentity
                rating={current.ratings[mode]}
                minRatedGames={current.min}
                name={user?.displayName || user?.username || t("competitive.you")}
              />
            ) : (
              <section className="competitive-identity">
                <RankEmblem size="hero" />
                <p className="mt-5 text-sm text-muted" role="status">
                  {t(
                    !user
                      ? "competitive.signInIdentity"
                      : failed
                        ? "competitive.unavailable"
                        : "competitive.loading",
                  )}
                </p>
                {failed && (
                  <button
                    className="btn btn-ghost mt-3"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    {t("common.refresh")}
                  </button>
                )}
              </section>
            )}
          </div>
        )}
        <div className="competitive-controls">
          <CompetitiveModeSelector
            value={mode}
            onChange={setMode}
            disabled={searching || queueBusy}
            controls={searching ? undefined : "competitive-mode-panel"}
            stretch
          />
          {path === "bot" ? (
            <BotChallenge difficulty={botLevel} gameMode={mode} />
          ) : (
            <MatchmakingPanel
              selectedMode={mode}
              matchType={path === "casual" ? "CASUAL" : "RATED"}
            />
          )}
        </div>
      </div>
    </RunePage>
  );
}
