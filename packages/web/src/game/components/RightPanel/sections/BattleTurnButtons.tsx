import type { FC } from "react";

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
  return (
    <>
      <button
        className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
          isMyTurn && joined && !isSpectator
            ? "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
            : "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
        }`}
        onClick={onEndTurn}
        disabled={!isMyTurn || !joined || isSpectator || pendingRoll}
      >
        End Turn
      </button>
      <button
        className="rounded-lg bg-slate-100 px-2 py-2 text-slate-600 shadow-sm transition hover:shadow dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
        onClick={onClear}
      >
        Clear
      </button>
    </>
  );
};
