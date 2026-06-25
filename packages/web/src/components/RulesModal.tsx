import { useEffect } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rulesContent from "../content/rules.md?raw";
import rulesContentUk from "../content/rules.uk.md?raw";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "../i18n";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="font-display text-3xl font-semibold text-stone-900 dark:text-stone-100">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-display mt-7 border-b border-amber-900/10 pb-2 text-2xl font-semibold text-stone-900 dark:border-amber-500/15 dark:text-stone-100">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 text-base font-semibold text-slate-800 dark:text-slate-200">{children}</h3>
  ),
  p: ({ children }) => <p className="mt-3">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900 dark:text-slate-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-slate-800 dark:text-slate-200">{children}</em>,
  a: ({ children, href }) => (
    <a
      className="text-sky-700 underline underline-offset-2 dark:text-sky-300"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) =>
    !className ? (
      <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px] text-slate-800 dark:bg-slate-800 dark:text-slate-100">
        {children}
      </code>
    ) : (
      <code className="block whitespace-pre-wrap rounded bg-slate-100 p-3 text-[12px] text-slate-800 dark:bg-slate-800 dark:text-slate-100">
        {children}
      </code>
    ),
};

export function RulesModal({ open, onClose }: RulesModalProps) {
  const { language, t } = useI18n();
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="panel-card panel-parchment w-full max-w-3xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b border-amber-900/10 px-6 py-4 dark:border-amber-500/15">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t("rules.rulebook")}
            </div>
            <h2
              id="rules-modal-title"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {t("rules.title")}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              {t("common.close")}
            </button>
          </div>
        </div>
        <div className="scroll-panel max-h-[80vh] overflow-y-auto px-6 pb-6 pt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          <ReactMarkdown components={markdownComponents}>
            {language === "uk" ? rulesContentUk : rulesContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
