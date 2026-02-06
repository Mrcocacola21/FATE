import { useEffect } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rulesContent from "../content/rules.md?raw";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 text-xl font-semibold text-slate-900 dark:text-slate-100">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-4 text-base font-semibold text-slate-800 dark:text-slate-200">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mt-3">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900 dark:text-slate-100">
      {children}
    </strong>
  ),
  em: ({ children }) => (
    <em className="italic text-slate-800 dark:text-slate-200">{children}</em>
  ),
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
  code: ({ inline, children }) =>
    inline ? (
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 dark:bg-slate-950/70"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-3xl rounded-2xl border-ui bg-surface-solid shadow-xl shadow-slate-900/10 dark:shadow-black/40">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-neutral-800">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Rulebook
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              FATE Rules
            </h2>
          </div>
          <button
            className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-6 pb-6 pt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          <ReactMarkdown components={markdownComponents}>
            {rulesContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
