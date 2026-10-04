import { useSyncExternalStore } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { RequireAuth } from "../auth/RequireAuth";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { TacticalIcon } from "../ui/TacticalIcon";
import { canAccessAdmin } from "./policy";
import { getAdminAccessRevision, isAdminAccessLost, subscribeAdminAccess } from "./api";

export function AdminGuard() {
  return (
    <RequireAuth>
      <RoleGuard />
    </RequireAuth>
  );
}
function RoleGuard() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  useSyncExternalStore(subscribeAdminAccess, getAdminAccessRevision, getAdminAccessRevision);
  if (!canAccessAdmin(user?.role) || isAdminAccessLost())
    return (
      <section className="admin-state" role="alert">
        <h1>{t("admin.accessDenied")}</h1>
        <p>{t(isAdminAccessLost() ? "admin.accessLost" : "admin.accessHelp")}</p>
        <Link to="/" className="btn btn-secondary">
          {t("shell.play")}
        </Link>
      </section>
    );
  return <AdminLayout key={`${user?.id}:${user?.role}`} />;
}
function AdminLayout() {
  const { t } = useI18n();
  const role = useAuthStore((s) => s.user?.role);
  return (
    <section className="admin-page" data-testid="admin-page" aria-labelledby="admin-title">
      <header className="admin-heading">
        <div>
          <p className="section-kicker">{t("admin.kicker")}</p>
          <h1 id="admin-title">{t("admin.title")}</h1>
          <p className="admin-muted">{t("admin.subtitle")}</p>
        </div>
        <span className="admin-staff">
          <TacticalIcon name="rules" />
          {t(`admin.labels.${role}`)}
        </span>
      </header>
      <nav className="admin-tabs" aria-label={t("admin.navigation")}>
        {[
          ["/admin", "overview"],
          ["/admin/users", "users"],
          ["/admin/matches", "matches"],
        ].map(([path, label]) => (
          <NavLink key={path} to={path} end={path === "/admin"}>
            {t(`admin.${label}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </section>
  );
}
