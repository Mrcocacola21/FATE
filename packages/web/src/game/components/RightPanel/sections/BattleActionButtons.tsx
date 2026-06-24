import type { FC } from "react";
import type { ActionMode, ActionPreviewMode } from "../../../../store";
import { useI18n } from "../../../../i18n";
import { localizeServerText } from "../../../../i18n/displayMetadata";

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
  const { t } = useI18n();
  return (
    <>
      <button
        type="button"
        aria-pressed={actionMode === "move"}
        className={`min-h-10 rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition focus-visible:ring-4 focus-visible:ring-teal-500/15 ${
          moveDisabled
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : actionMode === "move"
              ? "border-teal-500 bg-teal-500 text-white dark:text-slate-950"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800"
        }`}
        onClick={onMoveClick}
        onMouseEnter={() => !moveDisabled && onModePreview("move")}
        onMouseLeave={() => onModePreview(null)}
        onFocus={() => !moveDisabled && onModePreview("move")}
        onBlur={() => onModePreview(null)}
        disabled={moveDisabled}
      >
        {t("game.move")}
      </button>
      <button
        type="button"
        aria-pressed={actionMode === "attack"}
        className={`min-h-10 rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition focus-visible:ring-4 focus-visible:ring-teal-500/15 ${
          attackDisabled
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : actionMode === "attack"
              ? "border-rose-500 bg-rose-500 text-white"
              : "border-slate-200 bg-slate-50 text-slate-700 hover:border-rose-300 hover:bg-rose-50 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:border-rose-800 dark:hover:bg-rose-950/30"
        }`}
        onClick={onAttackClick}
        onMouseEnter={() => !attackDisabled && onModePreview("attack")}
        onMouseLeave={() => onModePreview(null)}
        onFocus={() => !attackDisabled && onModePreview("attack")}
        onBlur={() => onModePreview(null)}
        disabled={attackDisabled}
        title={attackDisabledReason ?? ""}
      >
        {t("game.attack")}
      </button>
      {attackDisabledReason && (
        <div className="col-span-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
          {attackDisabledReason}
        </div>
      )}
      <button
        type="button"
        className={`min-h-10 rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition focus-visible:ring-4 focus-visible:ring-teal-500/15 ${
          searchMoveDisabled
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-300 hover:bg-sky-50 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:border-sky-800 dark:hover:bg-sky-950/30"
        }`}
        onClick={onSearchMoveClick}
        disabled={searchMoveDisabled}
      >
        {t("game.searchMove")}
      </button>
      <button
        type="button"
        className={`min-h-10 rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition focus-visible:ring-4 focus-visible:ring-teal-500/15 ${
          searchActionDisabled
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-300 hover:bg-sky-50 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-100 dark:hover:border-sky-800 dark:hover:bg-sky-950/30"
        }`}
        onClick={onSearchActionClick}
        disabled={searchActionDisabled}
      >
        {t("game.searchAction")}
      </button>
      {searchMoveDisabled && searchMoveReason && (
        <div className="col-span-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {t("game.searchDisabled", {
            action: t("game.searchMove"),
            reason: localizeServerText(searchMoveReason, t),
          })}
        </div>
      )}
      {searchActionDisabled && searchActionReason && (
        <div className="col-span-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {t("game.searchDisabled", {
            action: t("game.searchAction"),
            reason: localizeServerText(searchActionReason, t),
          })}
        </div>
      )}
      <button
        type="button"
        className={`min-h-10 rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm transition focus-visible:ring-4 focus-visible:ring-violet-500/15 ${
          stealthDisabled
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-900/70 dark:bg-violet-950/30 dark:text-violet-200 dark:hover:border-violet-800 dark:hover:bg-violet-950/50"
        }`}
        onClick={onStealthClick}
        disabled={stealthDisabled}
      >
        {t("game.enterStealth")}
      </button>
    </>
  );
};
