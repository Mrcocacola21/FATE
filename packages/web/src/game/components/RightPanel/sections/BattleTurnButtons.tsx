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
        className={`min-h-11 rounded-lg border px-2.5 py-2 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-slate-500/25 ${
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
        className="min-h-11 rounded-lg border border-slate-200 bg-white/70 px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-500/25 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200 dark:hover:border-slate-700 dark:hover:bg-slate-800"
        onClick={onClear}
      >
        {t("game.clearSelection")}
      </button>
    </>
  );
};
