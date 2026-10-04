import { useState } from "react";
import { ApiError } from "../api/client";
import { useI18n } from "../i18n";
import { Dialog } from "../ui/Dialog";
import { adminApi } from "./api";
import { AdminError, Field } from "./components";
import { roles, type AdminUser, type UserRole } from "./types";

export type ModerationAction = "block" | "unblock" | "changeRole";
export function ModerationDialog({
  action,
  user,
  onClose,
  onUpdated,
}: {
  action: ModerationAction;
  user: AdminUser;
  onClose: () => void;
  onUpdated: (user: AdminUser) => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState(""),
    [role, setRole] = useState<UserRole>(user.blocked ? "USER" : user.role);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<ApiError>();
  const name = user.displayName || user.username || t("admin.unnamedUser");
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const updated =
        action === "block"
          ? await adminApi.block(user.id, reason.trim())
          : action === "unblock"
            ? await adminApi.unblock(user.id)
            : await adminApi.changeRole(user.id, role);
      onUpdated(updated);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure : new ApiError("NETWORK_ERROR"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      id="moderation-title"
      title={t(`admin.confirm.${action}`, { name })}
      onClose={onClose}
      busy={busy}
    >
      <form
        className="admin-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="admin-muted">{t(`admin.confirm.${action}Help`)}</p>
        {action === "block" && (
          <Field label={t("admin.blockReason")}>
            <textarea
              maxLength={500}
              rows={4}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
            <span className="admin-muted">
              {t("admin.characters", { count: reason.length, max: 500 })}
            </span>
          </Field>
        )}
        {action === "changeRole" && (
          <>
            <p>
              {t("admin.currentRole")}: {t(`admin.labels.${user.role}`)}
            </p>
            <Field label={t("admin.newRole")}>
              <select
                value={role}
                disabled={busy}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                {roles
                  .filter((value) => !user.blocked || value === "USER")
                  .map((value) => (
                    <option key={value} value={value}>
                      {t(`admin.labels.${value}`)}
                    </option>
                  ))}
              </select>
            </Field>
            {user.blocked && <p className="admin-muted">{t("admin.blockedRoleHelp")}</p>}
          </>
        )}
        {error && <AdminError error={error} />}
        <div className="admin-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            {t("admin.cancel")}
          </button>
          <button
            type="submit"
            className={`btn ${action === "block" ? "btn-danger" : "btn-secondary admin-confirm"}`}
            disabled={busy || (action === "changeRole" && role === user.role)}
          >
            {t(busy ? "admin.saving" : `admin.${action}`)}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
