import type { KeyboardEvent } from "react";
import { useI18n } from "../i18n";
import {
  PAGE_TRANSITIONS,
  setPageTransition,
  usePageTransition,
  type PageTransition,
} from "./pageTransition";

const LABELS = {
  turn: "shell.pageTransitionTurn",
  simple: "shell.pageTransitionSimple",
} as const;

/** The page turn or a plain fade, as a radio group in the look of the segment tabs. */
export function PageTransitionSetting() {
  const { t } = useI18n();
  const value = usePageTransition();
  const choose = (next: PageTransition) => setPageTransition(next);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl =
      typeof getComputedStyle === "function" &&
      getComputedStyle(event.currentTarget).direction === "rtl";
    const forward = event.key === (rtl ? "ArrowLeft" : "ArrowRight") || event.key === "ArrowDown";
    const back = event.key === (rtl ? "ArrowRight" : "ArrowLeft") || event.key === "ArrowUp";
    if (!forward && !back) return;
    event.preventDefault();
    const next =
      PAGE_TRANSITIONS[
        (index + (forward ? 1 : -1) + PAGE_TRANSITIONS.length) % PAGE_TRANSITIONS.length
      ];
    choose(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)
      ?.focus();
  };
  return (
    <div className="space-y-2">
      <div
        className="segment-tabs"
        role="radiogroup"
        aria-labelledby="page-transition-label"
        aria-describedby="page-transition-help"
        data-testid="page-transition-setting"
      >
        {PAGE_TRANSITIONS.map((option, index) => (
          <button
            key={option}
            type="button"
            role="radio"
            data-value={option}
            aria-checked={value === option}
            tabIndex={value === option ? 0 : -1}
            onClick={() => choose(option)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {t(LABELS[option])}
          </button>
        ))}
      </div>
      <p id="page-transition-help" className="text-xs text-muted">
        {t("shell.pageTransitionHelp")}
      </p>
    </div>
  );
}
