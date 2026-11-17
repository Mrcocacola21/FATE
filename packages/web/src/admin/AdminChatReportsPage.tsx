import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { Dialog } from "../ui/Dialog";
import { adminApi } from "./api";
import { AdminError, Badge, DateValue, Field, Loading } from "./components";
import { chatMuteHours, type AdminUser, type AuditIdentity, type ChatMuteHours, type ChatReport } from "./types";
import { useAdminResource } from "./useAdminResource";

/** The open-reports badge on the admin tab listens for this after every decision. */
export const CHAT_REPORTS_CHANGED = "fate:admin-chat-reports-changed";
const announceChange = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHAT_REPORTS_CHANGED));
};

/** Open reports, for the tab badge. */
export function useOpenChatReports() {
  const [open, setOpen] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      adminApi.chatReports({ status: "OPEN", limit: 1 }).then(
        (page) => alive && setOpen(page.open),
        () => undefined,
      );
    void load();
    if (typeof window === "undefined") return;
    window.addEventListener(CHAT_REPORTS_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(CHAT_REPORTS_CHANGED, load);
    };
  }, []);
  return open;
}

const personName = (person: AuditIdentity, fallback: string) => person.displayName || person.username || fallback;

/** The four durations as chips, then an optional reason. */
function MuteFields({
  hours,
  onHours,
  reason,
  onReason,
  disabled,
}: {
  hours: ChatMuteHours;
  onHours(hours: ChatMuteHours): void;
  reason: string;
  onReason(reason: string): void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <fieldset className="admin-chips" disabled={disabled}>
        <legend>{t("admin.chat.duration")}</legend>
        {chatMuteHours.map((value) => (
          <label key={value} className="admin-chip" data-checked={hours === value || undefined}>
            <input type="radio" name="mute-hours" checked={hours === value} onChange={() => onHours(value)} />
            {t(`admin.chat.hours.h${value}`)}
          </label>
        ))}
      </fieldset>
      <Field label={t("admin.chat.muteReason")}>
        <input maxLength={500} value={reason} disabled={disabled} onChange={(event) => onReason(event.target.value)} />
      </Field>
    </>
  );
}

/** From a user's page: restrict their chat, or lift the restriction. */
export function ChatMuteDialog({
  user,
  onClose,
  onUpdated,
}: {
  user: AdminUser;
  onClose(): void;
  onUpdated(mutedUntil: string | null, reason: string | null): void;
}) {
  const { t } = useI18n();
  const lifting = !!user.chatMutedUntil;
  const [hours, setHours] = useState<ChatMuteHours>(24);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const name = user.displayName || user.username || t("admin.unnamedUser");
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = lifting
        ? await adminApi.unmuteChat(user.id)
        : await adminApi.muteChat(user.id, hours, reason.trim() || undefined);
      onUpdated(result.mutedUntil, lifting ? null : reason.trim() || null);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure : new ApiError("NETWORK_ERROR"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      id="chat-mute-title"
      title={t(lifting ? "admin.chat.unmuteTitle" : "admin.chat.muteTitle", { name })}
      onClose={onClose}
      busy={busy}
    >
      <form
        className="admin-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <p className="admin-muted">{t(lifting ? "admin.chat.unmuteHelp" : "admin.chat.muteHelp")}</p>
        {!lifting && (
          <MuteFields hours={hours} onHours={setHours} reason={reason} onReason={setReason} disabled={busy} />
        )}
        {error && <AdminError error={error} />}
        <div className="admin-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            {t("admin.cancel")}
          </button>
          <button type="submit" className={`btn ${lifting ? "btn-secondary" : "btn-danger"}`} disabled={busy}>
            {t(busy ? "admin.saving" : lifting ? "admin.chat.unmute" : "admin.chat.mute")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ReportDetail({ id, onResolved }: { id: string; onResolved(): void }) {
  const { t } = useI18n();
  const [version, setVersion] = useState(0);
  const resource = useAdminResource(`${id}:${version}`, () => adminApi.chatReport(id));
  const [hours, setHours] = useState<ChatMuteHours>(24);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError>();
  const report = resource.data;
  if (resource.error) return <AdminError error={resource.error} retry={resource.retry} />;
  if (!report) return <Loading />;
  const unnamed = t("admin.unnamedUser");
  const reported = personName(report.reported, unnamed);
  const decide = async (decision: Parameters<typeof adminApi.resolveChatReport>[1]) => {
    setBusy(true);
    setError(undefined);
    try {
      await adminApi.resolveChatReport(report.id, decision);
      announceChange();
      onResolved();
      setVersion((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure : new ApiError("NETWORK_ERROR"));
    } finally {
      setBusy(false);
    }
  };
  const history = report.reportedChat;
  return (
    <section className="admin-panel chat-report" aria-labelledby="chat-report-title" data-testid="chat-report-detail">
      <div className="admin-detail-heading">
        <h2 id="chat-report-title">{t("admin.chat.reportOn", { name: reported })}</h2>
        <div className="admin-badges">
          <Link to={`/admin/users/${report.reported.id}`}>{t("admin.chat.profile")}</Link>
          {report.matchId && <Link to={`/admin/matches/${report.matchId}`}>{t("admin.chat.match")}</Link>}
        </div>
      </div>
      <p className="admin-muted">
        <Badge value={report.source} /> · {t(`admin.chat.reasons.${report.reason}`)} ·{" "}
        <DateValue value={report.createdAt} /> ·{" "}
        {t("admin.chat.from", { name: personName(report.reporter, unnamed) })}
        {report.reports > 1 && <> · {t("admin.chat.sameMessage", { count: report.reports })}</>}
      </p>
      {report.comment && (
        <blockquote className="chat-report__comment" dir="auto">
          {report.comment}
        </blockquote>
      )}
      <p className="admin-muted chat-report__caption">
        {t(report.source === "DIRECT" ? "admin.chat.copyDirect" : "admin.chat.copyRoom")}
      </p>
      <ol className="chat-report__context" data-testid="chat-report-context">
        {report.context.map((line, index) => (
          <li key={index} data-reported={line.reported || undefined}>
            <strong dir="auto">{line.name || line.username}:</strong> <span dir="auto">{line.text}</span>
          </li>
        ))}
      </ol>
      <p className="admin-muted">
        {history.mutedUntil
          ? t("admin.chat.mutedNow", { date: new Date(history.mutedUntil).toLocaleString() })
          : t("admin.chat.notMuted")}{" "}
        {t("admin.chat.history", {
          muted: history.mutedReports,
          dismissed: history.dismissedReports,
          open: history.openReports,
        })}
      </p>
      {report.status === "OPEN" ? (
        <form
          className="chat-report__decision"
          onSubmit={(event) => {
            event.preventDefault();
            void decide({ action: "MUTE", hours, reason: reason.trim() || undefined });
          }}
        >
          <h3>{t("admin.chat.mute")}</h3>
          <MuteFields hours={hours} onHours={setHours} reason={reason} onReason={setReason} disabled={busy} />
          {error && <AdminError error={error} />}
          <div className="admin-actions">
            <button type="submit" className="btn btn-danger" disabled={busy} data-testid="chat-report-mute">
              {t("admin.chat.muteAndClose")}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void decide({ action: "DISMISS" })}
              data-testid="chat-report-dismiss"
            >
              {t("admin.chat.dismiss")}
            </button>
          </div>
          <p className="admin-muted">{t("admin.chat.decisionHelp")}</p>
        </form>
      ) : (
        <p className="admin-notice" role="status">
          <Badge value={report.status} danger={report.status === "MUTED"} />{" "}
          {report.resolvedBy && t("admin.chat.resolvedBy", { name: personName(report.resolvedBy, unnamed) })}{" "}
          {report.resolvedAt && <DateValue value={report.resolvedAt} />}
        </p>
      )}
    </section>
  );
}

function ReportRow({ report, selected, onSelect }: { report: ChatReport; selected: boolean; onSelect(): void }) {
  const { t } = useI18n();
  const unnamed = t("admin.unnamedUser");
  return (
    <li>
      <button
        type="button"
        className="chat-report-row"
        aria-current={selected || undefined}
        onClick={onSelect}
        data-testid="chat-report-row"
      >
        <span className="chat-report-row__top">
          <strong>{t("admin.chat.on", { name: personName(report.reported, unnamed) })}</strong>
          <DateValue value={report.createdAt} />
        </span>
        <span className="admin-muted">
          <Badge value={report.source} /> · {t(`admin.chat.reasons.${report.reason}`)} ·{" "}
          {t("admin.chat.from", { name: personName(report.reporter, unnamed) })}
          {report.reports > 1 && <> · {t("admin.chat.sameMessage", { count: report.reports })}</>}
        </span>
        <span className="chat-report-row__body" dir="auto">
          {report.body}
        </span>
      </button>
    </li>
  );
}

/** The moderators' queue: open reports oldest first, closed ones newest first. */
export function AdminChatReportsPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") === "CLOSED" ? "CLOSED" : "OPEN";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const selected = params.get("report");
  const [version, setVersion] = useState(0);
  const resource = useAdminResource(`${status}:${page}:${version}`, () =>
    adminApi.chatReports({ status, page, limit: 30 }),
  );
  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null) merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged, { replace: true });
  };
  const data = resource.data;
  return (
    <div className="admin-section" data-testid="admin-chat-reports">
      <div className="admin-actions" role="group" aria-label={t("admin.chat.tab")}>
        {(["OPEN", "CLOSED"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`btn btn-sm ${status === value ? "btn-primary" : "btn-secondary"}`}
            aria-pressed={status === value}
            onClick={() => update({ status: value === "OPEN" ? null : value, page: null, report: null })}
          >
            {t(`admin.chat.${value === "OPEN" ? "open" : "closed"}`)}
            {value === "OPEN" && data ? ` · ${data.open}` : ""}
          </button>
        ))}
      </div>
      {resource.error ? (
        <AdminError error={resource.error} retry={resource.retry} />
      ) : !data ? (
        <Loading />
      ) : (
        <div className="chat-reports">
          <div>
            {data.items.length === 0 ? (
              <p className="admin-state">{t(status === "OPEN" ? "admin.chat.emptyOpen" : "admin.chat.emptyClosed")}</p>
            ) : (
              <ul className="chat-reports__list">
                {data.items.map((report) => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    selected={report.id === selected}
                    onSelect={() => update({ report: report.id })}
                  />
                ))}
              </ul>
            )}
            {data.pagination.totalPages > 1 && (
              <div className="admin-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => update({ page: String(page - 1) })}
                >
                  {t("admin.chat.newer")}
                </button>
                <span className="admin-muted">
                  {page} / {data.pagination.totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => update({ page: String(page + 1) })}
                >
                  {t("admin.chat.older")}
                </button>
              </div>
            )}
          </div>
          {selected ? (
            <ReportDetail key={selected} id={selected} onResolved={() => setVersion((value) => value + 1)} />
          ) : (
            <p className="admin-state chat-reports__pick">{t("admin.chat.pick")}</p>
          )}
        </div>
      )}
    </div>
  );
}
