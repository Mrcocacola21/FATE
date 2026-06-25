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
        className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-bold shadow-sm transition focus-visible:ring-4 focus-visible:ring-amber-500/15 ${
          moveDisabled
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : actionMode === "move"
              ? "border-amber-500 bg-amber-500 text-stone-950"
              : "border-stone-300 bg-stone-100/70 text-stone-700 hover:border-amber-400 hover:bg-amber-50 dark:border-stone-800 dark:bg-black/20 dark:text-stone-100 dark:hover:border-amber-700 dark:hover:bg-amber-950/25"
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
        className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-bold shadow-sm transition focus-visible:ring-4 focus-visible:ring-rose-500/15 ${
          attackDisabled
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : actionMode === "attack"
              ? "border-rose-500 bg-rose-500 text-white"
              : "border-stone-300 bg-stone-100/70 text-stone-700 hover:border-rose-300 hover:bg-rose-50 dark:border-stone-800 dark:bg-black/20 dark:text-stone-100 dark:hover:border-rose-800 dark:hover:bg-rose-950/30"
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
        className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-bold shadow-sm transition focus-visible:ring-4 focus-visible:ring-sky-500/15 ${
          searchMoveDisabled
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : "border-stone-300 bg-stone-100/70 text-stone-700 hover:border-sky-300 hover:bg-sky-50 dark:border-stone-800 dark:bg-black/20 dark:text-stone-100 dark:hover:border-sky-800 dark:hover:bg-sky-950/30"
        }`}
        onClick={onSearchMoveClick}
        disabled={searchMoveDisabled}
      >
        {t("game.searchMove")}
      </button>
      <button
        type="button"
        className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-bold shadow-sm transition focus-visible:ring-4 focus-visible:ring-sky-500/15 ${
          searchActionDisabled
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : "border-stone-300 bg-stone-100/70 text-stone-700 hover:border-sky-300 hover:bg-sky-50 dark:border-stone-800 dark:bg-black/20 dark:text-stone-100 dark:hover:border-sky-800 dark:hover:bg-sky-950/30"
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
        className={`min-h-10 rounded-lg border px-2 py-2 text-xs font-bold shadow-sm transition focus-visible:ring-4 focus-visible:ring-violet-500/15 ${
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
