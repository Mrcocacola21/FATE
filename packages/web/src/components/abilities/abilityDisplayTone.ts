import type { AbilityKind } from "rules";
import type { AbilityDisplayPresentation } from "../../game/abilityDisplayDetails";

export function getAbilityDisplayTone(
  kind: AbilityKind,
  unavailable: boolean,
  presentation?: AbilityDisplayPresentation,
) {
  if (unavailable) {
    return {
      card: "border-slate-200 bg-slate-100/80 dark:border-slate-800 dark:bg-slate-950/45",
      badge:
        "border-slate-300 bg-slate-200 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
    };
  }
  if (presentation === "resource") {
    return {
      card: "border-cyan-300/80 bg-cyan-50/70 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/25 dark:text-cyan-300",
      badge:
        "border-cyan-200 bg-cyan-100 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-100",
    };
  }
  if (presentation === "outcomes") {
    return {
      card: "border-amber-300/80 bg-amber-50/70 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-300",
      badge:
        "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-100",
    };
  }
  if (presentation === "transformation") {
    return {
      card: "border-sky-300/80 bg-sky-50/70 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/25 dark:text-sky-300",
      badge:
        "border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-900/50 dark:text-sky-100",
    };
  }
  switch (kind) {
    case "passive":
      return {
        card: "border-emerald-300/80 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-300",
        badge:
          "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
      };
    case "impulse":
      return {
        card: "border-amber-300/80 bg-amber-50/70 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-300",
        badge:
          "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
      };
    case "phantasm":
      return {
        card: "border-violet-300 bg-violet-50/75 text-violet-700 dark:border-violet-800/80 dark:bg-violet-950/35 dark:text-violet-300",
        badge:
          "border-violet-300 bg-violet-100 text-violet-700 dark:border-violet-700 dark:bg-violet-900/60 dark:text-violet-200",
      };
    default:
      return {
        card: "border-sky-300/80 bg-sky-50/70 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/25 dark:text-sky-300",
        badge:
          "border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
      };
  }
}
