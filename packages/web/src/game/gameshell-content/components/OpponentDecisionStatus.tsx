import type { OpponentPendingPresentation } from "rules";
import { useI18n } from "../../../i18n";

/** Persistent, non-interactive status. Its props contain only projected public metadata. */
export function OpponentDecisionStatus({
  presentation,
  attemptedAction = false,
}: {
  presentation?: OpponentPendingPresentation;
  attemptedAction?: boolean;
}) {
  const { t } = useI18n();
  const key = presentation?.key ?? "generic";
  return (
    <aside
      className="opponent-decision-status pointer-events-none fixed inset-x-0 top-3 mx-auto w-[calc(100%-1.5rem)] max-w-sm rounded-xl border border-slate-400/30 bg-slate-100/95 p-3 text-slate-900 shadow-lg dark:border-slate-600/60 dark:bg-slate-900/95 dark:text-slate-100"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="opponent-decision-status"
      data-layer="pending-task"
    >
      <h2 className="text-sm font-semibold">{t(`pending.opponent.${key}.title`)}</h2>
      {presentation?.abilityName ? (
        <p className="mt-0.5 text-xs text-violet-700 dark:text-violet-300">
          {t(`pending.opponent.${key}.abilityName`)}
        </p>
      ) : null}
      <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
        {t(`pending.opponent.${key}.message`)}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400/40 border-t-violet-500 motion-reduce:animate-none"
          aria-hidden="true"
        />
        {t("pending.opponent.status")}
      </div>
      {attemptedAction ? (
        <p className="mt-2 text-xs">{t("pending.opponent.blockedAction")}</p>
      ) : null}
    </aside>
  );
}
