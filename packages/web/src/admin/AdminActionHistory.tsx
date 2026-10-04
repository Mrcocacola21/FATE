import { useI18n } from "../i18n";
import { adminApi } from "./api";
import {
  AdminError,
  DateValue,
  Empty,
  Field,
  Loading,
  ParticipantName,
  TableFooter,
} from "./components";
import { useAdminQuery } from "./query";
import type { Participant } from "./types";
import { useAdminResource } from "./useAdminResource";

export function AdminActionHistory({
  matchId,
  participants,
}: {
  matchId: string;
  participants: Participant[];
}) {
  const { t } = useI18n();
  const { query, key, change } = useAdminQuery("actions");
  const resource = useAdminResource(`${matchId}:${key}`, () => adminApi.actions(matchId, query));
  return (
    <section className="admin-panel admin-list-panel">
      <div className="admin-section-heading admin-panel-heading">
        <div>
          <h2>{t("admin.actionHistory")}</h2>
          <p className="admin-muted">{t("admin.readOnlyHistory")}</p>
        </div>
        <Field label={t("admin.order")}>
          <select value={query.order} onChange={(e) => change({ actionOrder: e.target.value })}>
            <option value="asc">{t("admin.oldestFirst")}</option>
            <option value="desc">{t("admin.newestFirst")}</option>
          </select>
        </Field>
      </div>
      <div aria-busy={resource.loading}>
        <table className="admin-table admin-actions-table">
          <caption className="sr-only">{t("admin.actionHistory")}</caption>
          <thead>
            <tr>
              {["revision", "actor", "action", "time", "details"].map((value) => (
                <th key={value} scope="col">
                  {t(`admin.${value}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resource.data?.items.map((action) => {
              const participant = participants.find((p) =>
                action.actorUserId ? p.userId === action.actorUserId : p.seat === action.actorSeat,
              );
              return (
                <tr key={action.revision}>
                  <td data-label={t("admin.revision")}>
                    <strong>{action.revision}</strong>
                  </td>
                  <td data-label={t("admin.actor")}>
                    {action.actorSeat && <span className="admin-muted">{action.actorSeat} · </span>}
                    {participant ? (
                      <ParticipantName participant={participant} link />
                    ) : (
                      t(action.actorSeat ? "admin.guest" : "admin.system")
                    )}
                  </td>
                  <td data-label={t("admin.action")}>{action.actionType}</td>
                  <td data-label={t("admin.time")}>
                    <DateValue value={action.createdAt} />
                  </td>
                  <td>
                    <details className="admin-payload">
                      <summary aria-label={t("admin.actionDetails", { revision: action.revision })}>
                        {t("admin.details")}
                      </summary>
                      <div>
                        {action.payloadValid ? (
                          <pre tabIndex={0} aria-label={t("admin.actionPayload")}>
                            <code>{JSON.stringify(action.actionPayload, null, 2)}</code>
                          </pre>
                        ) : (
                          <p className="admin-muted">{t("admin.payloadUnavailable")}</p>
                        )}
                        {action.formatVersion !== null && (
                          <p className="admin-muted">
                            {t("admin.formatVersion")}: {action.formatVersion}
                          </p>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {resource.error ? (
          <AdminError error={resource.error} retry={resource.retry} />
        ) : resource.loading ? (
          <Loading />
        ) : (
          resource.data?.items.length === 0 && <Empty kind="actions" />
        )}
      </div>
      <TableFooter
        pagination={resource.data?.pagination}
        query={query}
        change={change}
        onPage={(page) => change({ actionPage: page })}
      />
    </section>
  );
}
