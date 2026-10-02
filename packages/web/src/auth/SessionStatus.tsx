import { useI18n } from "../i18n";
import { useAuthStore } from "./authStore";

export function SessionStatus() {
  const { t } = useI18n();
  const status = useAuthStore((state) => state.status);
  const retry = useAuthStore((state) => state.initializeSession);
  const operation = useAuthStore((state) => state.operation);
  if (status === "unavailable")
    return (
      <div role="alert" className="grid gap-3">
        <p>{t("auth.sessionUnavailable")}</p>
        <button
          className="btn btn-secondary"
          disabled={operation !== null}
          onClick={() => void retry()}
        >
          {t("auth.retry")}
        </button>
      </div>
    );
  return (
    <p role="status" aria-live="polite">
      {t("auth.restoring")}
    </p>
  );
}
