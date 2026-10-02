import { useRef, type ReactNode } from "react";
import { useDialogFocus } from "./useDialogFocus";
import { useI18n } from "../i18n";
import { TacticalIcon } from "./TacticalIcon";

export function Dialog({
  title,
  id,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  id: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(true, ref, () => {
    if (!busy) onClose();
  });
  return (
    <div
      ref={ref}
      className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-card panel-card w-full max-w-md overflow-y-auto p-5 sm:p-6">
        <header className="mb-5 flex items-center justify-between gap-4">
          <h2 id={id} className="font-display text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={t("common.close")}
            disabled={busy}
            onClick={onClose}
          >
            <TacticalIcon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
