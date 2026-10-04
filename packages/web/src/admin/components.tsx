import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import type { ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { HistoryPagination } from "../matches/HistoryPagination";
import type { AdminUser, Participant, Pagination, Query } from "./types";

export function AdminError({ error, retry }: { error: ApiError; retry?: () => void }) {
  const { t } = useI18n();
  const known = [
    "CANNOT_BLOCK_SELF",
    "CANNOT_CHANGE_OWN_ROLE",
    "INSUFFICIENT_TARGET_ROLE",
    "LAST_ADMIN_PROTECTED",
    "BLOCKED_ROLE_TARGET",
    "ACCOUNT_ALREADY_BLOCKED",
    "USER_NOT_FOUND",
    "MATCH_NOT_FOUND",
    "FORBIDDEN",
    "UNAUTHORIZED",
    "INVALID_REQUEST",
    "RATE_LIMITED",
    "NETWORK_ERROR",
    "ACCOUNT_BLOCKED",
    "INVALID_RESPONSE",
    "SESSION_CHANGED",
  ];
  return (
    <div className="admin-state admin-error" role="alert">
      <p>{t(`admin.errors.${known.includes(error.code) ? error.code : "SERVER_ERROR"}`)}</p>
      {retry && (
        <button className="btn btn-secondary btn-sm" onClick={retry}>
          {t("admin.retry")}
        </button>
      )}
    </div>
  );
}
export function Loading({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div
      className={`admin-state ${compact ? "" : "admin-skeleton"}`}
      role="status"
      aria-live="polite"
    >
      <span>{t("admin.loading")}</span>
    </div>
  );
}
export function Empty({ kind }: { kind: "users" | "matches" | "actions" | "ratings" }) {
  const { t } = useI18n();
  return <p className="admin-state">{t(`admin.empty.${kind}`)}</p>;
}
export function Badge({ value, danger = false }: { value: string; danger?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`admin-badge${danger ? " admin-badge-danger" : ""}`}>
      {t(`admin.labels.${value}`)}
    </span>
  );
}
export function UserIdentity({ user }: { user: AdminUser }) {
  const { t } = useI18n();
  const name = user.displayName || user.username || t("admin.unnamedUser");
  return (
    <div className="admin-identity">
      <span className="admin-avatar" aria-hidden="true">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div>
        <strong>{name}</strong>
        {user.username && <span className="admin-muted">@{user.username}</span>}
      </div>
    </div>
  );
}
export function ParticipantName({
  participant,
  link = false,
}: {
  participant: Participant;
  link?: boolean;
}) {
  const { t } = useI18n();
  const name =
    participant.displayNameSnapshot ||
    participant.displayName ||
    participant.username ||
    t("admin.guest");
  return link && participant.userId ? (
    <Link to={`/admin/users/${participant.userId}`}>{name}</Link>
  ) : (
    <>{name}</>
  );
}
export function DateValue({ value }: { value: string | null }) {
  const { language, t } = useI18n();
  if (!value) return <span className="admin-muted">{t("admin.notAvailable")}</span>;
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(language === "uk" ? "uk-UA" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Kyiv",
      }).format(new Date(value))}
    </time>
  );
}
export function TechnicalId({ label, value }: { label: string; value: string | null }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false),
    [failed, setFailed] = useState(false);
  if (!value) return null;
  return (
    <div className="admin-technical">
      <span>{label}</span>
      <code>{value}</code>
      <button
        className="btn btn-ghost btn-sm"
        aria-label={t("admin.copyId", { label })}
        onClick={() => {
          void Promise.resolve()
            .then(() => navigator.clipboard.writeText(value))
            .then(
              () => {
                setCopied(true);
                setFailed(false);
              },
              () => setFailed(true),
            );
        }}
      >
        {t("admin.copy")}
      </button>
      {(copied || failed) && (
        <span role="status">{t(failed ? "admin.copyFailed" : "admin.copied")}</span>
      )}
    </div>
  );
}
export function Metadata({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="admin-metadata">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <label className="admin-field">
      <span id={id}>{label}</span>
      {Children.map(children, (child) =>
        isValidElement(child) && ["input", "select", "textarea"].includes(String(child.type))
          ? cloneElement(child as ReactElement<{ "aria-labelledby"?: string }>, {
              "aria-labelledby": id,
            })
          : child,
      )}
    </label>
  );
}
export function SelectFilter({
  name,
  values,
  query,
  change,
}: {
  name: string;
  values: readonly string[];
  query: Query;
  change: (patch: Query) => void;
}) {
  const { t } = useI18n();
  return (
    <Field label={t(`admin.${name}`)}>
      <select value={query[name] ?? ""} onChange={(e) => change({ [name]: e.target.value })}>
        <option value="">{t("admin.all")}</option>
        {values.map((value) => (
          <option key={value} value={value}>
            {t(`admin.labels.${value}`)}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function TableFooter({
  pagination,
  onPage,
  query,
  change,
}: {
  pagination?: Pagination;
  onPage: (page: number) => void;
  query: Query;
  change: (patch: Query) => void;
}) {
  const { t } = useI18n();
  return (
    <footer className="admin-table-footer">
      <Field label={t("admin.pageSize")}>
        <select value={query.limit} onChange={(e) => change({ limit: e.target.value })}>
          {[20, 50, 100].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </Field>
      {pagination && (
        <>
          <span className="admin-muted">{t("admin.total", { count: pagination.total })}</span>
          <HistoryPagination
            label={t("admin.pagination")}
            pagination={pagination}
            onPage={onPage}
          />
        </>
      )}
    </footer>
  );
}
