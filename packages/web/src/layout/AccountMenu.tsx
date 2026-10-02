import { useState } from "react";
import { Link } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { authErrorMessage } from "../auth/errorMessage";
import { SessionStatus } from "../auth/SessionStatus";
import { Avatar } from "../profile/Avatar";
import { useI18n } from "../i18n";
import { TacticalIcon } from "../ui/TacticalIcon";

export function AccountMenu({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useI18n();
  const { status, user, logout, operation, error } = useAuthStore((state) => state);
  const [open, setOpen] = useState(false);
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
  return (
    <div
      data-testid="sidebar-account"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {open && (
        <div id="sidebar-account-actions" className="panel-card-muted mb-2 grid gap-1 p-2">
          <Link
            className="shell-nav-item"
            to="/profile"
            onClick={() => {
              setOpen(false);
              onNavigate();
            }}
          >
            <TacticalIcon name="players" />
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
      <button
        type="button"
        className="shell-account-trigger"
        aria-expanded={open}
        aria-controls="sidebar-account-actions"
        aria-label={t("shell.accountMenu")}
        onClick={() => setOpen((current) => !current)}
      >
        <Avatar
          username={user.username ?? t("auth.account")}
          displayName={user.displayName}
          avatarUrl={user.avatarUrl}
          small
        />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold">
            {user.displayName || user.username}
          </span>
          <span className="block truncate text-xs text-muted">@{user.username}</span>
        </span>
        <TacticalIcon name="more" />
      </button>
      {error?.code === "LOGOUT_FAILED" && (
        <p role="alert" className="mt-2 text-xs">
          {authErrorMessage(error, t)}
        </p>
      )}
    </div>
  );
}
