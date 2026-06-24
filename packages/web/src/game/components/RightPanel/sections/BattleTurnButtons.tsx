import type { FC } from "react";
import { useI18n } from "../../../../i18n";

interface BattleTurnButtonsProps {
  isMyTurn: boolean;
  joined: boolean;
  isSpectator: boolean;
  pendingRoll: boolean;
  onEndTurn: () => void;
  onClear: () => void;
}

export const BattleTurnButtons: FC<BattleTurnButtonsProps> = ({
  isMyTurn,
  joined,
  isSpectator,
  pendingRoll,
  onEndTurn,
  onClear,
}) => {
  const { t } = useI18n();
  return (
    <>
      <button
        type="button"
        className={`min-h-10 rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition focus-visible:ring-4 focus-visible:ring-slate-500/15 ${
          isMyTurn && joined && !isSpectator
            ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            : "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
        }`}
        onClick={onEndTurn}
        disabled={!isMyTurn || !joined || isSpectator || pendingRoll}
      >
        {t("game.endTurn")}
      </button>
      <button
        type="button"
        className="min-h-10 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-slate-500/15 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
        onClick={onClear}
      >
        {t("game.clearSelection")}
      </button>
    </>
  );
};
