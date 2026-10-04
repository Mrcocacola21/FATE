import { Link } from "react-router";
import { useI18n } from "../i18n";
import { adminApi } from "./api";
import {
  AdminError,
  Badge,
  DateValue,
  Empty,
  Field,
  Loading,
  ParticipantName,
  SelectFilter,
  TableFooter,
} from "./components";
import { useAdminQuery } from "./query";
import { modes, statuses } from "./types";
import { useAdminResource } from "./useAdminResource";

const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export function AdminMatchesPage() {
  const { t } = useI18n();
  const { query, key, change, reset, params } = useAdminQuery("matches");
  const resource = useAdminResource(key, () => adminApi.matches(query));
  return (
    <div className="admin-section">
      <h2>{t("admin.matches")}</h2>
      <div className="admin-panel admin-list-panel">
        <div className="admin-filters">
          <SelectFilter name="status" values={statuses} query={query} change={change} />
          <SelectFilter name="gameMode" values={modes} query={query} change={change} />
          <SelectFilter
            name="matchType"
            values={["CASUAL", "RATED"]}
            query={query}
            change={change}
          />
          <Field label={t("admin.sort")}>
            <select value={query.sort} onChange={(e) => change({ sort: e.target.value })}>
              {["createdAt", "finishedAt"].map((value) => (
                <option key={value} value={value}>
                  {t(`admin.${value}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("admin.order")}>
            <select value={query.order} onChange={(e) => change({ order: e.target.value })}>
              <option value="desc">{t("admin.desc")}</option>
              <option value="asc">{t("admin.asc")}</option>
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
              query.participantUserId ||
              query.matchId ||
              query.createdFrom ||
              query.createdTo ||
              query.finishedFrom ||
              query.finishedTo
            )
          }
        >
          <summary>{t("admin.lookupDates")}</summary>
          <form
            className="admin-filters"
            key={key}
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const patch: Record<string, string> = {
                participant: String(form.get("participant") ?? "").trim(),
                matchId: String(form.get("matchId") ?? "").trim(),
              };
              for (const field of ["createdFrom", "createdTo", "finishedFrom", "finishedTo"]) {
                const value = String(form.get(field) ?? "");
                patch[field] = value
                  ? `${value}T${field.endsWith("To") ? "23:59:59.999" : "00:00:00.000"}Z`
                  : "";
              }
              // Native date controls validate format; reject inverted ranges before sending.
              const invalidCreated = !!(
                patch.createdFrom &&
                patch.createdTo &&
                patch.createdFrom > patch.createdTo
              );
              const invalidFinished = !!(
                patch.finishedFrom &&
                patch.finishedTo &&
                patch.finishedFrom > patch.finishedTo
              );
              if (invalidCreated || invalidFinished) {
                e.currentTarget
                  .querySelector<HTMLInputElement>(
                    `input[name="${invalidCreated ? "createdTo" : "finishedTo"}"]`,
                  )
                  ?.setCustomValidity(t("admin.invalidDateRange"));
                e.currentTarget.reportValidity();
                return;
              }
              change({ ...patch, participantUserId: undefined });
            }}
          >
            <Field label={t("admin.participantId")}>
              <input name="participant" pattern={uuid} defaultValue={query.participantUserId} />
            </Field>
            <Field label={t("admin.matchId")}>
              <input name="matchId" pattern={uuid} defaultValue={query.matchId} />
            </Field>
            {["createdFrom", "createdTo", "finishedFrom", "finishedTo"].map((field) => (
              <Field key={field} label={t(`admin.${field}`)}>
                <input
                  type="date"
                  name={field}
                  defaultValue={params.get(field)?.slice(0, 10)}
                  onChange={(e) =>
                    e.currentTarget.form
                      ?.querySelectorAll("input")
                      .forEach((input) => input.setCustomValidity(""))
                  }
                />
              </Field>
            ))}
            <button className="btn btn-secondary" type="submit">
              {t("admin.apply")}
            </button>
            <p className="admin-muted">{t("admin.dateTimezone")}</p>
          </form>
        </details>
        <div aria-busy={resource.loading}>
          <table className="admin-table">
            <caption className="sr-only">{t("admin.matches")}</caption>
            <thead>
              <tr>
                {[
                  "match",
                  "gameMode",
                  "matchType",
                  "status",
                  "startedAt",
                  "finishedAt",
                  "details",
                ].map((value) => (
                  <th scope="col" key={value}>
                    {t(`admin.${value}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resource.data?.items.map((match) => (
                <tr key={match.matchId}>
                  <td>
                    <strong>{match.lobbyName || t("admin.match")}</strong>
                    <div className="admin-participant-line">
                      {match.participants.map((p, i) => (
                        <span key={p.seat}>
                          {i > 0 && <span className="admin-muted"> · </span>}
                          <ParticipantName participant={p} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td data-label={t("admin.gameMode")}>{t(`admin.labels.${match.gameMode}`)}</td>
                  <td data-label={t("admin.matchType")}>
                    <Badge value={match.matchType} />
                  </td>
                  <td data-label={t("admin.status")}>
                    <Badge value={match.status} danger={match.status === "CANCELLED"} />
                  </td>
                  <td data-label={t("admin.startedAt")}>
                    <DateValue value={match.startedAt} />
                  </td>
                  <td data-label={t("admin.finishedAt")}>
                    <DateValue value={match.finishedAt} />
                  </td>
                  <td>
                    <Link
                      className="btn btn-ghost btn-sm"
                      to={`/admin/matches/${match.matchId}`}
                      aria-label={t("admin.viewMatch", {
                        name:
                          match.lobbyName ||
                          match.participants.map((p) => p.displayNameSnapshot).join(" · "),
                      })}
                    >
                      {t("admin.view")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {resource.error ? (
            <AdminError error={resource.error} retry={resource.retry} />
          ) : resource.loading ? (
            <Loading />
          ) : (
            resource.data?.items.length === 0 && <Empty kind="matches" />
          )}
        </div>
        <TableFooter
          pagination={resource.data?.pagination}
          query={query}
          change={change}
          onPage={(page) => change({ page })}
        />
      </div>
    </div>
  );
}
