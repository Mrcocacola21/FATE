import { useEffect, useRef, useState, type FC } from "react";
import { useI18n } from "../../../../i18n";
import { localizeServerText } from "../../../../i18n/displayMetadata";
import { useGameStore } from "../../../../store";

const NOTICE_MS = 6000;

/**
 * Minimal Controls tab: a rejected action otherwise only reaches the log tab, so the
 * button the player just pressed seems to do nothing. Shows the server's reason briefly.
 */
export const ActionRejectionNotice: FC = () => {
  const { t } = useI18n();
  const result = useGameStore((state) => state.lastActionResult);
  const resultAt = useGameStore((state) => state.lastActionResultAt);
  // Results that arrived before this panel opened belong to earlier clicks.
  const mountedAt = useRef(Date.now());
  const [dismissedAt, setDismissedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const visible =
    !!result &&
    !result.ok &&
    resultAt > mountedAt.current &&
    resultAt !== dismissedAt &&
    now - resultAt < NOTICE_MS;

  useEffect(() => {
    setNow(Date.now());
    if (!result || result.ok || resultAt <= mountedAt.current) return;
    const timer = setTimeout(() => setNow(Date.now()), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [result, resultAt]);

  if (!visible) return null;
  return (
    <div className="action-rejection" role="alert" data-testid="action-rejection-notice">
      <div className="min-w-0">
        <div className="action-rejection__title">{t("actionMenu.actionNotAccepted")}</div>
        <div className="action-rejection__reason">
          {result?.error ? localizeServerText(result.error, t) : t("errors.actionRejected")}
        </div>
      </div>
      <button
        type="button"
        className="action-rejection__close"
        aria-label={t("common.close")}
        onClick={() => setDismissedAt(resultAt)}
      >
        ×
      </button>
    </div>
  );
};
