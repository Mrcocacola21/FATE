import type { FC } from "react";
import type { ActionMode, ActionPreviewMode } from "../../../../store";

interface BattleActionButtonsProps {
  actionMode: ActionMode;
  moveDisabled: boolean;
  attackDisabled: boolean;
  searchMoveDisabled: boolean;
  searchActionDisabled: boolean;
  stealthDisabled: boolean;
  attackDisabledReason?: string;
  searchMoveReason?: string;
  searchActionReason?: string;
  onMoveClick: () => void;
  onAttackClick: () => void;
  onSearchMoveClick: () => void;
  onSearchActionClick: () => void;
  onStealthClick: () => void;
  onModePreview: (mode: ActionPreviewMode | null) => void;
}

export const BattleActionButtons: FC<BattleActionButtonsProps> = ({
  actionMode,
  moveDisabled,
  attackDisabled,
  searchMoveDisabled,
  searchActionDisabled,
  stealthDisabled,
  attackDisabledReason,
  searchMoveReason,
  searchActionReason,
  onMoveClick,
  onAttackClick,
  onSearchMoveClick,
  onSearchActionClick,
  onStealthClick,
  onModePreview,
}) => {
  return (
    <>
      <button
        className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
          moveDisabled
            ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
            : actionMode === "move"
            ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
            : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
        }`}
        onClick={onMoveClick}
        onMouseEnter={() => !moveDisabled && onModePreview("move")}
        onMouseLeave={() => onModePreview(null)}
        onFocus={() => !moveDisabled && onModePreview("move")}
        onBlur={() => onModePreview(null)}
        disabled={moveDisabled}
      >
        Move
      </button>
      <button
        className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
          attackDisabled
            ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
            : actionMode === "attack"
            ? "bg-teal-500 text-white dark:bg-teal-800/50 dark:text-slate-100 dark:hover:bg-teal-700/60"
            : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
        }`}
        onClick={onAttackClick}
        onMouseEnter={() => !attackDisabled && onModePreview("attack")}
        onMouseLeave={() => onModePreview(null)}
        onFocus={() => !attackDisabled && onModePreview("attack")}
        onBlur={() => onModePreview(null)}
        disabled={attackDisabled}
        title={attackDisabledReason ?? ""}
      >
        Attack
      </button>
      {attackDisabledReason && (
        <div className="col-span-2 text-[10px] text-amber-700 dark:text-amber-300">
          {attackDisabledReason}
        </div>
      )}
      <button
        className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
          searchMoveDisabled
            ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
            : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
        }`}
        onClick={onSearchMoveClick}
        disabled={searchMoveDisabled}
      >
        Search (Move)
      </button>
      <button
        className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
          searchActionDisabled
            ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
            : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
        }`}
        onClick={onSearchActionClick}
        disabled={searchActionDisabled}
      >
        Search (Action)
      </button>
      {searchMoveDisabled && searchMoveReason && (
        <div className="col-span-2 text-[10px] text-slate-400 dark:text-slate-400">
          Search (Move) disabled: {searchMoveReason}
        </div>
      )}
      {searchActionDisabled && searchActionReason && (
        <div className="col-span-2 text-[10px] text-slate-400 dark:text-slate-400">
          Search (Action) disabled: {searchActionReason}
        </div>
      )}
      <button
        className={`rounded-lg px-2 py-2 shadow-sm transition hover:shadow ${
          stealthDisabled
            ? "bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500"
            : "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-700/60"
        }`}
        onClick={onStealthClick}
        disabled={stealthDisabled}
      >
        Enter Stealth
      </button>
    </>
  );
};
