import { useState, type ReactNode } from "react";
import { GrimoireHead } from "../components/grimoire";
import { useI18n } from "../i18n";
import { getGameModeName } from "../modes/modeLabels";
import { getRankPresentation } from "../ranks/rankAssets";
import { Avatar } from "./Avatar";
import { ProfileRanks, bestRankedMode, useProfileRanks } from "./ProfileRank";
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
 * Grimoire profile header plus the three rank cards, shared by the own and public profile.
 * `onAvatarClick` makes the arch a button (own profile: opens the editor).
 */
export function ProfileOverview({
  profile,
  revision = 0,
  onAvatarClick,
  actions,
}: {
  profile: PublicProfile;
  revision?: number;
  onAvatarClick?: () => void;
  actions?: ReactNode;
}) {
  const { t, language } = useI18n();
  const ranks = useProfileRanks(profile.id, revision);
  const ratings = ranks.result?.data?.ratings;
  const bestMode = ratings ? bestRankedMode(ratings) : null;
  const bestRank = bestMode && ratings ? getRankPresentation(ratings[bestMode].rankTier) : null;
  const avatar = <Avatar {...profile} arch />;
  return (
    <>
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
      <ProfileRanks resource={ranks} />
    </>
  );
}
