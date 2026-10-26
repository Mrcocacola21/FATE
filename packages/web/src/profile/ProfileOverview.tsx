import { useState, type ReactNode } from "react";
import type { GameModeId } from "rules";
import { statisticsApi } from "../api/statisticsApi";
import { GrimoireHead } from "../components/grimoire";
import { useI18n } from "../i18n";
import { getGameModeName } from "../modes/modeLabels";
import { getRankPresentation } from "../ranks/rankAssets";
import { useProfileResource } from "../statistics/useProfileResource";
import { Avatar } from "./Avatar";
import { ProfileHeroes } from "./ProfileHeroes";
import { ProfileRanks, bestRankedMode, useProfileRanks } from "./ProfileRank";
import { ProfileStatTiles } from "./ProfileStatTiles";
import { RatingChart } from "./RatingChart";
import { RecentMatches } from "./RecentMatches";
import {
  loadRatingHistories,
  loadRecentMatches,
  mostPlayedMode,
  ratingDeltaByMatch,
} from "./profileData";
import type { PublicProfile } from "./types";

export function publicProfilePath(username: string) {
  return `/users/${encodeURIComponent(username)}`;
}

/** Copies the public profile link; the button reports success inline. */
export function ShareProfileButton({ username }: { username: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          const url = new URL(publicProfilePath(username), window.location.origin).href;
          void navigator.clipboard?.writeText(url).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        {t("profile.share")}
      </button>
      {copied && (
        <span role="status" className="profile-hero__note">
          {t("profile.linkCopied")}
        </span>
      )}
    </>
  );
}

/**
 * The whole profile body, shared by the own and the public page: grimoire header, rank cards,
 * rating chart, statistics tiles and recent matches. Each block loads on its own, so one failed
 * request never hides the others. `onAvatarClick` makes the arch a button (own profile).
 */
export function ProfileOverview({
  profile,
  own = false,
  revision = 0,
  onAvatarClick,
  actions,
  afterHeader,
  children,
}: {
  profile: PublicProfile;
  own?: boolean;
  revision?: number;
  onAvatarClick?: () => void;
  actions?: ReactNode;
  /** Shown right under the header, e.g. the profile editor. */
  afterHeader?: ReactNode;
  /** Shown after the recent matches, e.g. the private block. */
  children?: ReactNode;
}) {
  const { t, language } = useI18n();
  const ranks = useProfileRanks(profile.id, revision);
  const histories = useProfileResource(profile.id, revision, loadRatingHistories);
  const stats = useProfileResource(profile.id, revision, statisticsApi.getPlayerStatistics);
  const recent = useProfileResource(profile.id, revision, loadRecentMatches);
  const [chosenMode, setChosenMode] = useState<GameModeId | null>(null);
  const ratings = ranks.result?.data?.ratings;
  const mode = chosenMode ?? (ratings ? mostPlayedMode(ratings) : "standard");
  const bestMode = ratings ? bestRankedMode(ratings) : null;
  const bestRank = bestMode && ratings ? getRankPresentation(ratings[bestMode].rankTier) : null;
  const historyData = histories.result?.data;
  const avatar = <Avatar {...profile} arch />;
  return (
    <div className="profile-overview">
      <header className="profile-hero" data-testid="profile-hero">
        <GrimoireHead
          portrait={
            onAvatarClick ? (
              <button
                type="button"
                className="profile-hero__avatar-button"
                aria-label={t("profile.changeAvatar")}
                onClick={onAvatarClick}
              >
                {avatar}
              </button>
            ) : (
              avatar
            )
          }
          kicker={
            bestRank && bestMode
              ? `${t(bestRank.labelKey)} · ${getGameModeName(bestMode, t)}`
              : t("auth.brand")
          }
          name={<span dir="auto">{profile.displayName || profile.username}</span>}
        >
          <div className="profile-hero__meta">
            <p dir="auto">@{profile.username}</p>
            <p>
              {t("profile.memberSince")} {new Date(profile.createdAt).toLocaleDateString(language)}
            </p>
          </div>
          {actions && <div className="profile-hero__actions">{actions}</div>}
        </GrimoireHead>
      </header>
      {afterHeader}
      <ProfileRanks resource={ranks} mode={mode} onModeChange={setChosenMode} />
      <div className="profile-row profile-row--chart">
        <RatingChart
          history={historyData?.[mode]}
          loading={!histories.result}
          failed={Boolean(histories.result?.error)}
          retry={histories.retry}
          mode={mode}
          onModeChange={setChosenMode}
          rating={ratings?.[mode]}
        />
        <ProfileStatTiles
          stats={stats.result?.data}
          loading={!stats.result}
          failed={Boolean(stats.result?.error)}
          retry={stats.retry}
          ratings={ratings}
          histories={historyData}
          own={own}
        />
      </div>
      <div className="profile-row profile-row--matches">
        <ProfileHeroes
          stats={stats.result?.data}
          loading={!stats.result}
          failed={Boolean(stats.result?.error)}
        />
        <RecentMatches
          items={recent.result?.data?.items}
          deltas={historyData ? ratingDeltaByMatch(historyData) : undefined}
          loading={!recent.result}
          failed={Boolean(recent.result?.error)}
          retry={recent.retry}
          historyPath={own ? "/matches" : `${publicProfilePath(profile.username)}/matches`}
        />
      </div>
      {children}
    </div>
  );
}
