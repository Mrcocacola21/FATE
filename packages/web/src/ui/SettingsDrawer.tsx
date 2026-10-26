import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ThemeToggle } from "../components/ThemeToggle";
import { SoundControls } from "../features/sfx/SoundControls";
import { TacticalIcon } from "./TacticalIcon";
import { useDialogFocus } from "./useDialogFocus";

/** Side drawer shared by the app shell and the match, so settings change without leaving play. */
export function SettingsDrawer({ onClose, actions }: { onClose: () => void; actions?: ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(true, ref, onClose);
  const drawer = (
    <div
      className="modal-backdrop settings-drawer-backdrop fixed inset-0 z-[70] flex justify-end"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="settings-drawer panel-card flex h-full w-full max-w-sm flex-col rounded-none"
        data-testid="settings-drawer"
      >
        <header className="flex items-center justify-between gap-4 border-b border-amber-900/10 px-5 py-4 dark:border-amber-500/15">
          <h2
            id="settings-title"
            className="font-display text-xl font-semibold text-stone-900 dark:text-stone-100"
          >
            {t("mobile.settings")}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <TacticalIcon name="close" />
          </button>
        </header>
        <div className="scroll-panel min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <section className="space-y-2">
            <p className="field-label">{t("language.switchLabel")}</p>
            <LanguageSwitcher />
          </section>
          <section className="space-y-2">
            <p className="field-label">{t("profile.theme")}</p>
            <ThemeToggle />
          </section>
          <section className="space-y-2">
            <p className="field-label">{t("audio.sound")}</p>
            <SoundControls />
          </section>
        </div>
        {actions ? (
          <footer className="flex flex-wrap gap-2 border-t border-amber-900/10 px-5 py-4 dark:border-amber-500/15">
            {actions}
          </footer>
        ) : null}
      </div>
    </div>
  );
  // Same portal rule as Dialog: parent layout must not offset the fixed backdrop.
  const canPortal =
    typeof Element !== "undefined" &&
    typeof document !== "undefined" &&
    document.body instanceof Element;
  return canPortal ? createPortal(drawer, document.body) : drawer;
}
