import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { Dialog } from "../ui/Dialog";
import { CHAT_REPORT_COMMENT_MAX, CHAT_REPORT_REASONS, type ChatReportReason } from "../ws";

const ERRORS: Record<string, string> = {
  CHAT_REPORT_LIMIT: "moderation.errors.limit",
  CHAT_REPORT_INVALID: "moderation.errors.invalid",
};

/**
 * Reporting one chat message: a reason, an optional note, then a thank-you. The caller sends it
 * and resolves to null once stored, or to the server's error code.
 */
export function ReportDialog({
  author,
  text,
  onSubmit,
  onClose,
}: {
  author: string;
  text: string;
  onSubmit(reason: ChatReportReason, comment: string): Promise<string | null>;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState<ChatReportReason>("ABUSE");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => setError(null), [reason, comment]);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const code = await onSubmit(reason, comment);
    setBusy(false);
    if (code) setError(t(ERRORS[code] ?? "moderation.errors.failed"));
    else setSent(true);
  };
  return (
    <Dialog id="report-title" title={t("moderation.reportTitle")} onClose={onClose} busy={busy} className="report-dialog">
      {sent ? (
        <div className="report-dialog__body" data-testid="report-sent">
          <p role="status">{t("moderation.reportSent")}</p>
          <div className="report-dialog__actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t("moderation.close")}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="report-dialog__body"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <blockquote className="report-dialog__quote" dir="auto">
            <strong>{author}</strong>: {text}
          </blockquote>
          <fieldset className="report-dialog__reasons">
            <legend>{t("moderation.reasonLabel")}</legend>
            {CHAT_REPORT_REASONS.map((item) => (
              <label key={item} className="report-dialog__reason" data-checked={reason === item || undefined}>
                <input
                  type="radio"
                  name="report-reason"
                  value={item}
                  checked={reason === item}
                  onChange={() => setReason(item)}
                />
                {t(`moderation.reasons.${item}`)}
              </label>
            ))}
          </fieldset>
          <label className="report-dialog__comment">
            <span>{t("moderation.commentLabel")}</span>
            <textarea
              className="field-control"
              rows={2}
              dir="auto"
              maxLength={CHAT_REPORT_COMMENT_MAX}
              value={comment}
              data-testid="report-comment"
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
          <p className="report-dialog__note">{t("moderation.reportNote", { name: author })}</p>
          {error && (
            <p role="alert" className="report-dialog__error">
              {error}
            </p>
          )}
          <div className="report-dialog__actions">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
              {t("moderation.cancel")}
            </button>
            <button type="submit" className="btn btn-danger" disabled={busy} data-testid="report-submit">
              {t("moderation.reportSend")}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
