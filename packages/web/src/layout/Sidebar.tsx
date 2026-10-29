import { Link, useLocation } from "react-router";
import { useI18n } from "../i18n";
import { TacticalIcon } from "../ui/TacticalIcon";
import { AccountMenu } from "./AccountMenu";
import { useAuthStore } from "../auth/authStore";
import { canAccessAdmin } from "../admin/policy";
import { useEffect, useId, type ReactNode } from "react";
import { friendBadgeStore, useFriendBadge } from "../friends/friendStore";
import { NotificationBell } from "../notifications/NotificationBell";

// Profile lives on the account card at the foot, so the chapters hold only places to go.
const chapters = [
  {
    title: "shell.chapterGame",
    items: [
      { to: "/", label: "shell.play", icon: "actions" },
      { to: "/lobby", label: "customLobby.title", icon: "players" },
      { to: "/figures", label: "lobby.figureSet", icon: "unit" },
      { to: "/matches", label: "matches.history", icon: "log" },
    ],
  },
  {
    title: "shell.chapterCommunity",
    items: [
      { to: "/friends", label: "friends.title", icon: "friends" },
      { to: "/leaderboard", label: "leaderboard.title", icon: "leaderboard" },
    ],
  },
] as const;

function isActive(to: string, pathname: string) {
  if (to === "/") return pathname === "/";
  if (to === "/matches")
    return /^\/matches(?:\/|$)/.test(pathname) || /^\/users\/[^/]+\/matches\/?$/.test(pathname);
  return pathname.replace(/\/$/, "") === to;
}

/** A chapter of the sidebar: a small-caps title that folds into a short gold rule on the rail. */
function Chapter({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = useId();
  return (
    <div className="shell-nav-chapter" role="group" aria-labelledby={id} data-testid={testId}>
      <p id={id} className="shell-nav-chapter__title">
        {title}
      </p>
      {children}
    </div>
  );
}

export function Sidebar({
  testRoomsEnabled,
  onRules,
  onSettings,
  onTestRoom,
  onNavigate,
  onClose,
  mobile = false,
  collapsed = false,
  onToggleCollapsed,
}: {
  testRoomsEnabled: boolean;
  onRules: () => void;
  onSettings: () => void;
  onTestRoom: () => void;
  onNavigate: () => void;
  onClose?: () => void;
  mobile?: boolean;
  /** Desktop only: the sidebar folds into a rail of icons. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const staff = useAuthStore(state => state.status === "authenticated" && canAccessAdmin(state.user?.role));
  const signedIn = useAuthStore((state) => state.status === "authenticated");
  const incomingRequests = useFriendBadge();
  const folded = collapsed && !mobile;
  // Requests are pushed over the socket; focus covers a socket that was down for a while.
  useEffect(() => {
    if (signedIn) void friendBadgeStore.getState().refresh();
  }, [signedIn]);
  useEffect(() => {
    if (!signedIn || typeof window === "undefined") return;
    const refresh = () => void friendBadgeStore.getState().refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [signedIn]);
  // On the rail the label is hidden; data-tip feeds the hover/focus tooltip drawn in CSS.
  const label = (text: string) => <span className="shell-nav-label">{text}</span>;
  return (
    <aside
      className="shell-sidebar"
      data-testid={mobile ? "mobile-sidebar" : "desktop-sidebar"}
      data-collapsed={folded || undefined}
    >
      <div className="shell-sidebar__head">
        <Link to="/" className="shell-brand" onClick={onNavigate} aria-label={t("auth.brand")}>
          <img
            className="shell-brand-icon"
            src="/android-chrome-192x192.png"
            width={40}
            height={40}
            alt=""
            aria-hidden="true"
          />
          <span className="fate-brand block text-xl">{t("auth.brand")}</span>
        </Link>
        {!mobile && <NotificationBell />}
        {onClose && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={t("shell.closeMenu")}
            onClick={onClose}
          >
            <TacticalIcon name="close" />
          </button>
        )}
      </div>
      <nav aria-label={t("lobby.navLabel")} className="shell-navigation">
        {chapters.map(({ title, items }) => (
          <Chapter key={title} title={t(title)}>
            {items.map(({ to, label: key, icon }) => (
              <Link
                key={to}
                to={to}
                className="shell-nav-item"
                data-tip={t(key)}
                aria-current={isActive(to, pathname) ? "page" : undefined}
                onClick={onNavigate}
              >
                <TacticalIcon name={icon} />
                {label(t(key))}
                {to === "/friends" && incomingRequests > 0 && (
                  <span className="nav-count" aria-label={t("friends.newRequests", { value: incomingRequests })}>
                    {incomingRequests}
                  </span>
                )}
              </Link>
            ))}
          </Chapter>
        ))}
      </nav>
      <div className="shell-sidebar__foot">
        {testRoomsEnabled && (
          <Chapter title={t("shell.developer")} testId="developer-navigation">
            <Link
              to="/heartbreak"
              className="shell-nav-item"
              data-tip={t("lobby.heartbreak")}
              aria-current={pathname === "/heartbreak" ? "page" : undefined}
              onClick={onNavigate}
            >
              <TacticalIcon name="heart" />
              {label(t("lobby.heartbreak"))}
            </Link>
            <button type="button" className="shell-nav-item" data-tip={t("testRoom.create")} onClick={onTestRoom}>
              <TacticalIcon name="unit" />
              {label(t("testRoom.create"))}
            </button>
          </Chapter>
        )}
        <div className="shell-nav-utility">
          {staff && (
            <Link
              to="/admin"
              className="shell-nav-item"
              data-tip={t("admin.title")}
              onClick={onNavigate}
              aria-current={/^\/admin(?:\/|$)/.test(pathname) ? "page" : undefined}
            >
              <TacticalIcon name="rules" />
              {label(t("admin.title"))}
            </Link>
          )}
          <button type="button" className="shell-nav-item" data-tip={t("lobby.rules")} onClick={onRules}>
            <TacticalIcon name="rules" />
            {label(t("lobby.rules"))}
          </button>
          <button
            type="button"
            className="shell-nav-item"
            data-testid="sidebar-settings"
            data-tip={t("mobile.settings")}
            onClick={onSettings}
          >
            <TacticalIcon name="settings" />
            {label(t("mobile.settings"))}
          </button>
        </div>
        <div className="shell-account">
          {folded && !signedIn ? (
            // The guest and session-check panels need the full width; the rail offers sign-in.
            <Link to="/login" className="shell-nav-item" data-tip={t("auth.login")} onClick={onNavigate}>
              <TacticalIcon name="profile" />
              {label(t("auth.login"))}
            </Link>
          ) : (
            <AccountMenu onNavigate={onNavigate} />
          )}
        </div>
      </div>
      {!mobile && onToggleCollapsed && (
        <button
          type="button"
          className="shell-fold"
          aria-expanded={!folded}
          aria-label={t(folded ? "shell.expandSidebar" : "shell.collapseSidebar")}
          data-testid="sidebar-fold"
          onClick={onToggleCollapsed}
        >
          <TacticalIcon name="collapse" />
        </button>
      )}
    </aside>
  );
}
