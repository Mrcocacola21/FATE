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
  SelectFilter,
  TableFooter,
  UserIdentity,
} from "./components";
import { useAdminQuery } from "./query";
import { roles } from "./types";
import { useAdminResource } from "./useAdminResource";

export function AdminUsersPage() {
  const { t } = useI18n();
  const { query, key, change, reset } = useAdminQuery("users");
  const resource = useAdminResource(key, () => adminApi.users(query));
  return (
    <div className="admin-section">
      <h2>{t("admin.users")}</h2>
      <div className="admin-panel admin-list-panel">
        <form
          className="admin-filters"
          key={String(query.search ?? "")}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            change({ search: String(form.get("search") ?? "").trim() });
          }}
        >
          <Field label={t("admin.searchUsers")}>
            <input
              name="search"
              type="search"
              maxLength={100}
              defaultValue={query.search}
              placeholder={t("admin.searchUsersHint")}
            />
          </Field>
          <SelectFilter name="role" values={roles} query={query} change={change} />
          <SelectFilter
            name="status"
            values={["ACTIVE", "BLOCKED"]}
            query={query}
            change={change}
          />
          <Field label={t("admin.sort")}>
            <select value={query.sort} onChange={(e) => change({ sort: e.target.value })}>
              {["createdAt", "updatedAt", "username"].map((value) => (
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
          <button type="submit" className="btn btn-secondary">
            {t("admin.search")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={reset}>
            {t("admin.reset")}
          </button>
        </form>
        <div aria-busy={resource.loading}>
          <table className="admin-table">
            <caption className="sr-only">{t("admin.users")}</caption>
            <thead>
              <tr>
                {["user", "role", "status", "createdAt", "details"].map((key) => (
                  <th scope="col" key={key}>
                    {t(`admin.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resource.data?.items.map((user) => (
                <tr key={user.id}>
                  <td data-label={t("admin.user")}>
                    <UserIdentity user={user} />
                  </td>
                  <td data-label={t("admin.role")}>
                    <Badge value={user.role} />
                  </td>
                  <td data-label={t("admin.status")}>
                    <Badge value={user.blocked ? "BLOCKED" : "ACTIVE"} danger={user.blocked} />
                  </td>
                  <td data-label={t("admin.createdAt")}>
                    <DateValue value={user.createdAt} />
                  </td>
                  <td>
                    <Link
                      className="btn btn-ghost btn-sm"
                      to={`/admin/users/${user.id}`}
                      aria-label={t("admin.viewUser", {
                        name: user.displayName || user.username || t("admin.unnamedUser"),
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
            resource.data?.items.length === 0 && <Empty kind="users" />
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
