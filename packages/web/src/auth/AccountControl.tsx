import { Link } from "react-router";
import { useI18n } from "../i18n";
import { useAuthStore } from "./authStore";
import { authErrorMessage } from "./errorMessage";
import { SessionStatus } from "./SessionStatus";
import { Avatar } from "../profile/Avatar";

export function AccountControl() {
  const { t } = useI18n();
  const { status, user, logout, operation, error } = useAuthStore((state) => state);
  if (status === "initializing" || status === "unavailable")
    return (
      <div className="text-xs">
        <SessionStatus />
      </div>
    );
  return (
    <div
      className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 text-sm lg:justify-end"
      data-testid="account-control"
    >
      {user && status === "authenticated" ? (
        <>
          <Link className="btn btn-secondary max-w-48" to="/profile" title={t("profile.title")}>
            <span aria-hidden="true" className="shrink-0">
              <Avatar
                username={user.username ?? t("auth.account")}
                displayName={user.displayName}
                avatarUrl={user.avatarUrl}
                small
              />
            </span>
            <span className="truncate">
              {user.displayName ?? user.username ?? t("profile.title")}
            </span>
          </Link>
          <button
            className="btn btn-ghost"
            disabled={operation !== null}
            onClick={() => void logout()}
          >
            {t("auth.logout")}
          </button>
          <Link className="btn btn-ghost" to="/matches">
            {t("matches.history")}
          </Link>
        </>
      ) : (
        <>
          <Link className="btn btn-secondary" to="/login">
            {t("auth.login")}
          </Link>
          <Link className="btn btn-ghost" to="/register">
            {t("auth.register")}
          </Link>
        </>
      )}
      {error?.code === "LOGOUT_FAILED" && (
        <div role="alert" className="basis-full text-xs">
          {authErrorMessage(error, t)}{" "}
          <button className="underline" disabled={operation !== null} onClick={() => void logout()}>
            {t("auth.retryLogout")}
          </button>
        </div>
      )}
    </div>
  );
}
