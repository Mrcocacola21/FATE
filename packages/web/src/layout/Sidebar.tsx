import { Link, useLocation } from "react-router";
import { useI18n } from "../i18n";
import { TacticalIcon } from "../ui/TacticalIcon";
import { AccountMenu } from "./AccountMenu";
import { useAuthStore } from "../auth/authStore";
import { canAccessAdmin } from "../admin/policy";

const primaryNavigation = [
  { to: "/", label: "shell.play", icon: "actions" },
  { to: "/lobby", label: "customLobby.title", icon: "players" },
  { to: "/figures", label: "lobby.figureSet", icon: "unit" },
  { to: "/matches", label: "matches.history", icon: "log" },
  { to: "/leaderboard", label: "leaderboard.title", icon: "leaderboard" },
  { to: "/profile", label: "profile.title", icon: "players" },
] as const;

export function Sidebar({
  testRoomsEnabled,
  onRules,
  onSettings,
  onTestRoom,
  onNavigate,
  onClose,
  mobile = false,
}: {
  testRoomsEnabled: boolean;
  onRules: () => void;
  onSettings: () => void;
  onTestRoom: () => void;
  onNavigate: () => void;
  onClose?: () => void;
  mobile?: boolean;
}) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const staff = useAuthStore(state => state.status === "authenticated" && canAccessAdmin(state.user?.role));
  return (
    <aside className="shell-sidebar" data-testid={mobile ? "mobile-sidebar" : "desktop-sidebar"}>
      <div className="flex items-center justify-between gap-2">
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
        <div className="grid gap-1.5">
          {primaryNavigation.map(({ to, label, icon }) => {
            const active =
              to === "/"
                ? pathname === "/"
                : to === "/matches"
                  ? /^\/matches(?:\/|$)/.test(pathname) ||
                    /^\/users\/[^/]+\/matches\/?$/.test(pathname)
                  : to === "/profile"
                    ? pathname === "/profile" || /^\/users\/[^/]+\/?$/.test(pathname)
                    : pathname.replace(/\/$/, "") === to;
            return (
              <Link
                key={to}
                to={to}
                className="shell-nav-item"
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
              >
                <TacticalIcon name={icon} />
                <span>{t(label)}</span>
              </Link>
            );
          })}
        </div>
        <div className="shell-nav-secondary">
          {staff && <Link to="/admin" className="shell-nav-item" onClick={onNavigate}
            aria-current={/^\/admin(?:\/|$)/.test(pathname) ? "page" : undefined}>
            <TacticalIcon name="rules" />{t("admin.title")}
          </Link>}
          <button type="button" className="shell-nav-item" onClick={onRules}>
            <TacticalIcon name="rules" />
            {t("lobby.rules")}
          </button>
          <button
            type="button"
            className="shell-nav-item"
            data-testid="sidebar-settings"
            onClick={onSettings}
          >
            <TacticalIcon name="settings" />
            {t("mobile.settings")}
          </button>
        </div>
        {testRoomsEnabled && (
          <div className="shell-nav-secondary" data-testid="developer-navigation">
            <p className="section-kicker mb-2 px-3">{t("shell.developer")}</p>
            <Link
              to="/heartbreak"
              className="shell-nav-item"
              aria-current={pathname === "/heartbreak" ? "page" : undefined}
              onClick={onNavigate}
            >
              <TacticalIcon name="heart" />
              {t("lobby.heartbreak")}
            </Link>
            <button type="button" className="shell-nav-item" onClick={onTestRoom}>
              <TacticalIcon name="unit" />
              {t("testRoom.create")}
            </button>
          </div>
        )}
      </nav>
      <div className="shell-account">
        <AccountMenu onNavigate={onNavigate} />
      </div>
    </aside>
  );
}
