import { Link } from "react-router";
import { useI18n } from "../i18n";
import { adminApi } from "./api";
import { AdminError, Loading } from "./components";
import { roles, modes, statuses } from "./types";
import { useAdminResource } from "./useAdminResource";

export function AdminOverviewPage() {
  const { t, language } = useI18n();
  const resource = useAdminResource("summary", adminApi.summary);
  const data = resource.data;
  const number = (n: number) => new Intl.NumberFormat(language).format(n);
  return (
    <div className="admin-section">
      <div className="admin-section-heading">
        <h2>{t("admin.systemOverview")}</h2>
        <button
          className="btn btn-ghost btn-sm"
          disabled={resource.loading}
          onClick={resource.retry}
        >
          {t("admin.refresh")}
        </button>
      </div>
      {resource.error ? (
        <AdminError error={resource.error} retry={resource.retry} />
      ) : !data ? (
        <Loading />
      ) : (
        <>
          <div className="admin-stats">
            {[
              ["totalUsers", data.users.total, "/admin/users"],
              ["blockedUsers", data.users.blocked, "/admin/users?status=blocked"],
              ["totalMatches", data.matches.total, "/admin/matches"],
              [
                "activeMatches",
                data.matches.byStatus.IN_PROGRESS,
                "/admin/matches?status=IN_PROGRESS",
              ],
              ["ratedMatches", data.matches.classification.RATED, "/admin/matches?matchType=RATED"],
              ["finishedMatches", data.matches.byStatus.FINISHED, "/admin/matches?status=FINISHED"],
            ].map(([label, count, path]) => (
              <Link className="admin-stat" key={label} to={String(path)}>
                <span>{t(`admin.${label}`)}</span>
                <strong>{number(Number(count))}</strong>
                <span className="admin-stat-link">{t("admin.inspect")} →</span>
              </Link>
            ))}
          </div>
          <div className="admin-overview-grid">
            {[
              {
                title: "roleBreakdown",
                rows: roles.map(
                  (role) => [t(`admin.labels.${role}`), data.users.byRole[role]] as const,
                ),
              },
              {
                title: "modeBreakdown",
                rows: modes.map(
                  (mode) => [t(`admin.labels.${mode}`), data.matches.byGameMode[mode]] as const,
                ),
              },
              {
                title: "statusBreakdown",
                rows: statuses.map(
                  (status) => [t(`admin.labels.${status}`), data.matches.byStatus[status]] as const,
                ),
              },
            ].map((group) => (
              <section className="admin-panel" key={group.title}>
                <h3>{t(`admin.${group.title}`)}</h3>
                <dl className="admin-breakdown">
                  {group.rows.map(([label, count]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{number(count)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <section className="admin-panel">
            <h3>{t("admin.recentActivity")}</h3>
            <dl className="admin-activity">
              {Object.entries(data.activity).map(([key, count]) => (
                <div key={key}>
                  <dt>{t(`admin.${key}`)}</dt>
                  <dd>{number(count)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
