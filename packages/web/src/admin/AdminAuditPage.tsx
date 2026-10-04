import { Link } from "react-router";
import { Fragment, useState } from "react";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { adminApi } from "./api";
import {
  AdminError,
  Badge,
  DateValue,
  Field,
  Loading,
  Metadata,
  TableFooter,
  TechnicalId,
} from "./components";
import { useAdminQuery } from "./query";
import { auditEventTypes, type AuditIdentity, type AuditRecord } from "./types";
import { useAdminResource } from "./useAdminResource";

function Identity({ identity, id }: { identity: AuditIdentity | null; id: string | null }) {
  const { t } = useI18n();
  const name = identity?.displayName || identity?.username || t("admin.audit.deletedAccount");
  return identity ? (
    <Link to={`/admin/users/${identity.id}`}>{name}</Link>
  ) : (
    <span title={id ?? undefined}>{name}</span>
  );
}
function Actor({ event }: { event: AuditRecord }) {
  const { t } = useI18n();
  return event.actorType === "SYSTEM" ? (
    <span>{t("admin.audit.system")}</span>
  ) : (
    <div>
      <Identity identity={event.actor} id={event.actorUserId} />
      {event.actorRole && <div className="admin-muted">{t(`admin.labels.${event.actorRole}`)}</div>}
    </div>
  );
}
function Target({ event }: { event: AuditRecord }) {
  const { t } = useI18n();
  return event.matchId ? (
    <Link to={`/admin/matches/${event.matchId}`}>
      {t("admin.match")} · {event.matchId.slice(0, 8)}
    </Link>
  ) : (
    <Identity identity={event.targetUser} id={event.targetUserId} />
  );
}
export function AdminAuditPage() {
  const { t } = useI18n();
  const role = useAuthStore((s) => s.user?.role);
  return role === "ADMIN" ? (
    <AuditViewer />
  ) : (
    <div className="admin-state" role="alert">
      {t("admin.accessDenied")}
    </div>
  );
}
function AuditViewer() {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string>();
  const { query, key, change, reset, params } = useAdminQuery("audit");
  const resource = useAdminResource(key, () => adminApi.audit(query));
  return (
    <section className="admin-section" aria-labelledby="audit-title">
      <div className="admin-section-heading">
        <h2 id="audit-title">{t("admin.auditLog")}</h2>
        <button className="btn btn-secondary btn-sm" onClick={resource.retry}>
          {t("admin.audit.refresh")}
        </button>
      </div>
      <div className="admin-panel admin-list-panel">
        <div className="admin-filters">
          <Field label={t("admin.audit.event")}>
            <select
              value={query.eventType ?? ""}
              onChange={(e) => change({ eventType: e.target.value })}
            >
              <option value="">{t("admin.audit.allEvents")}</option>
              {auditEventTypes.map((type) => (
                <option key={type} value={type}>
                  {t(`admin.audit.events.${type}`)}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn btn-ghost" onClick={reset}>
            {t("admin.reset")}
          </button>
        </div>
        <details
          className="admin-search-details"
          open={
            !!(
              query.actorUserId ||
              query.targetUserId ||
              query.matchId ||
              query.dateFrom ||
              query.dateTo ||
              query.actorType
            )
          }
        >
          <summary>{t("admin.lookupDates")}</summary>
          <form
            key={key}
            className="admin-filters"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const patch: Record<string, string> = {};
              for (const field of ["actorUserId", "targetUserId", "matchId", "actorType"])
                patch[field] = String(form.get(field) ?? "").trim();
              for (const field of ["dateFrom", "dateTo"]) {
                const value = String(form.get(field) ?? "");
                patch[field] = value
                  ? `${value}T${field === "dateTo" ? "23:59:59.999" : "00:00:00.000"}Z`
                  : "";
              }
              const to = e.currentTarget.querySelector<HTMLInputElement>('input[name="dateTo"]');
              to?.setCustomValidity(
                patch.dateFrom && patch.dateTo && patch.dateFrom > patch.dateTo
                  ? t("admin.invalidDateRange")
                  : "",
              );
              if (e.currentTarget.reportValidity()) change(patch);
            }}
          >
            {["actorUserId", "targetUserId", "matchId"].map((field) => (
              <Field key={field} label={t(`admin.audit.${field}`)}>
                <input
                  name={field}
                  defaultValue={query[field]}
                  pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                />
              </Field>
            ))}
            <Field label={t("admin.audit.actorType")}>
              <select name="actorType" defaultValue={query.actorType ?? ""}>
                <option value="">{t("admin.all")}</option>
                <option value="USER">{t("admin.user")}</option>
                <option value="SYSTEM">{t("admin.audit.system")}</option>
              </select>
            </Field>
            {["dateFrom", "dateTo"].map((field) => (
              <Field key={field} label={t(`admin.audit.${field}`)}>
                <input
                  type="date"
                  name={field}
                  defaultValue={params.get(field)?.slice(0, 10)}
                  onChange={(e) =>
                    e.currentTarget.form
                      ?.querySelector<HTMLInputElement>('input[name="dateTo"]')
                      ?.setCustomValidity("")
                  }
                />
              </Field>
            ))}
            <button type="submit" className="btn btn-secondary">
              {t("admin.apply")}
            </button>
            <p className="admin-muted">{t("admin.dateTimezone")}</p>
          </form>
        </details>
        <div aria-busy={resource.loading}>
          <table className="admin-table admin-audit-table">
            <caption className="sr-only">{t("admin.auditLog")}</caption>
            <thead>
              <tr>
                {["timestamp", "event", "actor", "target", "reason", "details"].map((field) => (
                  <th key={field} scope="col">
                    {t(`admin.audit.${field}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resource.data?.items.map((event) => (
                <Fragment key={event.id}>
                  <tr>
                    <td data-label={t("admin.audit.timestamp")}>
                      <DateValue value={event.createdAt} />
                    </td>
                    <td data-label={t("admin.audit.event")}>
                      <span
                        className={`admin-badge${event.eventType === "USER_BLOCKED" || event.eventType === "MATCH_INTERRUPTED" ? " admin-badge-danger" : ""}`}
                      >
                        {t(`admin.audit.events.${event.eventType}`)}
                      </span>
                    </td>
                    <td data-label={t("admin.audit.actor")}>
                      <Actor event={event} />
                    </td>
                    <td data-label={t("admin.audit.target")}>
                      <Target event={event} />
                    </td>
                    <td data-label={t("admin.audit.reason")} className="admin-audit-reason">
                      {event.reason || "—"}
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        aria-expanded={selected === event.id}
                        aria-controls={`audit-${event.id}`}
                        onClick={() => setSelected(selected === event.id ? undefined : event.id)}
                      >
                        {t("admin.audit.details")}
                      </button>
                    </td>
                  </tr>
                  {selected === event.id && (
                    <tr className="admin-audit-detail-row">
                      <td colSpan={6} id={`audit-${event.id}`}>
                        <Metadata
                          items={[
                            [t("admin.audit.event"), t(`admin.audit.events.${event.eventType}`)],
                            [
                              t("admin.audit.timestamp"),
                              <DateValue key="time" value={event.createdAt} />,
                            ],
                            [t("admin.audit.actor"), <Actor key="actor" event={event} />],
                            [
                              t("admin.audit.roleAtEvent"),
                              event.actorRole ? <Badge value={event.actorRole} /> : "—",
                            ],
                            [t("admin.audit.target"), <Target key="target" event={event} />],
                            [t("admin.audit.reason"), event.reason],
                            ...Object.entries(event.metadata ?? {}).map(
                              ([name, value]): [string, string | number | null] => [
                                t(`admin.audit.${name}`),
                                (name.toLowerCase().includes("role") ||
                                  name.toLowerCase().includes("status")) &&
                                typeof value === "string"
                                  ? t(`admin.labels.${value}`)
                                  : value,
                              ],
                            ),
                          ]}
                        />
                        <TechnicalId label={t("admin.audit.id")} value={event.id} />
                        <TechnicalId
                          label={t("admin.audit.actorUserId")}
                          value={event.actorUserId}
                        />
                        <TechnicalId
                          label={t("admin.audit.targetUserId")}
                          value={event.targetUserId}
                        />
                        <TechnicalId label={t("admin.matchId")} value={event.matchId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {resource.error ? (
            <AdminError error={resource.error} retry={resource.retry} />
          ) : resource.loading ? (
            <Loading />
          ) : (
            resource.data?.items.length === 0 && (
              <p className="admin-state">{t("admin.audit.empty")}</p>
            )
          )}
        </div>
        <TableFooter
          pagination={resource.data?.pagination}
          query={query}
          change={change}
          onPage={(page) => change({ page })}
        />
      </div>
    </section>
  );
}
