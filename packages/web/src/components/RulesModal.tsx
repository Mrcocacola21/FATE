import { Children, isValidElement, useMemo, useRef, type ReactNode } from "react";
import { useDialogFocus } from "../ui/useDialogFocus";
import ReactMarkdown, { type Components } from "react-markdown";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "../i18n";
import { ClassPatternGrid } from "./rules/ClassPatternGrid";

function plainText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? plainText(child.props.children)
          : "",
    )
    .join("");
}

/** Stable anchor for a rulebook section; the table of contents uses the same rule. */
export function rulesSectionId(title: string): string {
  const slug = title
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `rules-${slug || "section"}`;
}

const CLASS_PATTERNS_ID = "rules-class-patterns";

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
    <h2
      id={rulesSectionId(plainText(children))}
      className="scroll-mt-4 font-display mt-7 border-b border-amber-900/10 pb-2 text-2xl font-semibold text-stone-900 dark:border-amber-500/15 dark:text-stone-100">
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
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(open, dialogRef, onClose);
  const content = t("rulebook.content");
  const sections = useMemo(
    () => [
      ...content
        .split("\n")
        .filter((line) => line.startsWith("## "))
        .map((line) => {
          const title = line.slice(3).trim();
          return { id: rulesSectionId(title), title };
        }),
      { id: CLASS_PATTERNS_ID, title: t("rules.classPatterns") },
    ],
    [content, t],
  );

  if (!open) return null;
  const jumpTo = (id: string) => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <div
      ref={dialogRef}
      className="modal-backdrop fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-card rules-modal-card panel-card w-full max-w-5xl overflow-hidden">
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
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label={t("rules.contents")}
            className="scroll-panel hidden w-56 shrink-0 overflow-y-auto border-r border-amber-900/10 px-3 py-4 md:block dark:border-amber-500/15"
          >
            <p className="section-kicker mb-2 px-2.5">{t("rules.contents")}</p>
            <ul className="space-y-0.5">
              {sections.map((section) => (
                <li key={section.id}>
                  <button type="button" className="rules-toc-link" onClick={() => jumpTo(section.id)}>
                    {section.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="rules-modal-body scroll-panel min-w-0 flex-1 overflow-y-auto px-6 pb-6 pt-4 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
            <section aria-labelledby={CLASS_PATTERNS_ID}>
              <h2
                id={CLASS_PATTERNS_ID}
                className="scroll-mt-4 font-display mt-7 border-b border-amber-900/10 pb-2 text-2xl font-semibold text-stone-900 dark:border-amber-500/15 dark:text-stone-100"
              >
                {t("rules.classPatterns")}
              </h2>
              <p className="mt-3">{t("rules.patternNote")}</p>
              <div className="mt-4">
                <ClassPatternGrid />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
