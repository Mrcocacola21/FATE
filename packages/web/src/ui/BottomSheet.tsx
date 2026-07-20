import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <section
      className={`mobile-bottom-sheet ${expanded ? "mobile-bottom-sheet-expanded" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      data-testid="mobile-bottom-sheet"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-amber-900/15 px-3 py-2 dark:border-amber-500/15">
        <button
          type="button"
          className="mobile-sheet-handle"
          aria-label={expanded ? t("mobile.collapsePanel") : t("mobile.expandPanel")}
          title={expanded ? t("mobile.collapsePanel") : t("mobile.expandPanel")}
          onClick={() => setExpanded((current) => !current)}
        >
          <span aria-hidden="true" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold">{title}</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          {t("mobile.closePanel")}
        </button>
      </div>
      <div className="scroll-panel min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-28">
        {children}
      </div>
    </section>
  );
}
