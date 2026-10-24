import { useCallback, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { Dialog } from "./Dialog";

interface ConfirmRequest {
  message: string;
  onConfirm: () => void;
}

/** In-app replacement for window.confirm: `confirm` opens the dialog, render `dialog` once. */
export function useConfirmDialog(): {
  confirm: (message: string, onConfirm: () => void) => void;
  dialog: ReactNode;
} {
  const { t } = useI18n();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirm = useCallback(
    (message: string, onConfirm: () => void) => setRequest({ message, onConfirm }),
    [],
  );
  const dialog = request ? (
    <Dialog title={t("common.confirm")} id="confirm-dialog-title" onClose={() => setRequest(null)}>
      <p className="text-sm leading-relaxed">{request.message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => setRequest(null)}>
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setRequest(null);
            request.onConfirm();
          }}
        >
          {t("common.confirm")}
        </button>
      </div>
    </Dialog>
  ) : null;
  return { confirm, dialog };
}
