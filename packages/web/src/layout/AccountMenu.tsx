import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { authErrorMessage } from "../auth/errorMessage";
import { SessionStatus } from "../auth/SessionStatus";
import { Avatar } from "../profile/Avatar";
import { useI18n } from "../i18n";
import { competitiveApi } from "../play/api";
import { formatCompetitiveRating } from "../ranks/rankProgress";
import { TacticalIcon } from "../ui/TacticalIcon";

/** The best rating among modes with rated games; null before the first rated game. */
function useBestRating(userId: string | undefined) {
  const [best, setBest] = useState<{ owner: string; rating: number | null } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const load = () =>
      competitiveApi.ratings(userId).then(
        (ratings) => {
          const rated = Object.values(ratings).filter((rating) => rating.ratedGames > 0);
          if (active)
            setBest({
              owner: userId,
              rating: rated.length ? Math.max(...rated.map((rating) => rating.rating)) : null,
            });
        },
        () => {
          /* The rating is a hint on the card; a failed read keeps the last value. */
        },
      );
    void load();
    if (typeof window === "undefined") return () => void (active = false);
    // A rated match ends elsewhere in the app; focus is a cheap moment to catch up.
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [userId]);
  return best && best.owner === userId ? best.rating : null;
}

export function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { status, user, logout, operation, error } = useAuthStore((state) => state);
  const [open, setOpen] = useState(false);
  const rating = useBestRating(status === "authenticated" ? user?.id : undefined);
  if (status === "initializing" || status === "unavailable") return <SessionStatus />;
  if (!user || status !== "authenticated")
    return (
      <div className="grid gap-2">
        <Link className="btn btn-primary" to="/login" onClick={onNavigate}>
          {t("auth.login")}
        </Link>
        <Link className="btn btn-ghost" to="/register" onClick={onNavigate}>
          {t("auth.register")}
        </Link>
      </div>
    );
  const name = user.displayName || user.username;
  const ownProfile =
    pathname.replace(/\/$/, "") === "/profile" ||
    (!!user.username && pathname.replace(/\/$/, "") === `/users/${encodeURIComponent(user.username)}`);
  return (
    <div
      data-testid="sidebar-account"
      className="shell-account__card"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {open && (
        <div id="sidebar-account-actions" className="shell-account__actions panel-card-muted grid gap-1 p-2">
          <Link
            className="shell-nav-item"
            to="/profile"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
          >
            <TacticalIcon name="profile" />
            {t("profile.title")}
          </Link>
          <button
            type="button"
            className="shell-nav-item"
            disabled={operation !== null}
            onClick={() => void logout()}
          >
            <TacticalIcon name="logout" />
            {t("auth.logout")}
          </button>
        </div>
      )}
      <div className="shell-account__row">
        <Link
          to="/profile"
          className="shell-account__identity"
          data-testid="sidebar-profile"
          data-tip={t("profile.title")}
          aria-current={ownProfile ? "page" : undefined}
          onClick={onNavigate}
        >
          <span className="shell-account__arch">
            <Avatar
              username={user.username ?? t("auth.account")}
              displayName={user.displayName}
              avatarUrl={user.avatarUrl}
              arch
            />
            <span className="shell-account__presence" aria-hidden="true" />
          </span>
          <span className="shell-account__names">
            <span className="shell-account__name">
              <bdi>{name}</bdi>
            </span>
            <span className="shell-account__meta">
              <span className="shell-account__online">{t("presence.online")}</span>
              {rating !== null && (
                <span className="shell-account__rating" title={t("matchmaking.rating")}>
                  <bdi dir="ltr">{formatCompetitiveRating(rating)}</bdi>
                </span>
              )}
            </span>
          </span>
        </Link>
        <button
          type="button"
          className="shell-account-trigger"
          aria-expanded={open}
          aria-controls="sidebar-account-actions"
          aria-label={t("shell.accountMenu")}
          onClick={() => setOpen((current) => !current)}
        >
          <TacticalIcon name="more" />
        </button>
      </div>
      {error?.code === "LOGOUT_FAILED" && (
        <p role="alert" className="mt-2 text-xs">
          {authErrorMessage(error, t)}
        </p>
      )}
    </div>
  );
}
