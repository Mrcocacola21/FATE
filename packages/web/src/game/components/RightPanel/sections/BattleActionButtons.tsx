import type { FC } from "react";
import type { ActionMode, ActionPreviewMode } from "../../../../store";
import { useI18n } from "../../../../i18n";
import { localizeServerText } from "../../../../i18n/displayMetadata";

interface BattleActionButtonsProps {
  actionMode: ActionMode;
  targetingActive: boolean;
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
  targetingActive,
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
  const moveBlocked = moveDisabled || targetingActive;
  const attackBlocked = attackDisabled || targetingActive;
  const searchMoveBlocked = searchMoveDisabled || targetingActive;
  const searchActionBlocked = searchActionDisabled || targetingActive;
  const stealthBlocked = stealthDisabled || targetingActive;
  const moveReason = targetingActive
    ? t("game.cancelTargetingFirst")
    : moveDisabled
      ? t("actionMenu.movementAlreadySpent")
      : "";
  const attackReason = targetingActive
    ? t("game.cancelTargetingFirst")
    : attackDisabledReason || (attackDisabled ? t("actionMenu.actionAlreadySpent") : "");
  const stealthReason = targetingActive
    ? t("game.cancelTargetingFirst")
    : stealthDisabled
      ? t("pending.conditionNotMet")
      : "";
  const compactSearchMoveReason = targetingActive
    ? t("game.cancelTargetingFirst")
    : searchMoveDisabled && searchMoveReason
      ? localizeServerText(searchMoveReason, t)
      : "";
  const compactSearchActionReason = targetingActive
    ? t("game.cancelTargetingFirst")
    : searchActionDisabled && searchActionReason
      ? localizeServerText(searchActionReason, t)
      : "";
  return (
    <>
      <button
        type="button"
        aria-pressed={actionMode === "move"}
        className={`min-h-11 rounded-lg border px-2.5 py-2 text-left text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-amber-500/25 ${
          moveBlocked
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : actionMode === "move"
              ? "border-amber-500 bg-amber-500 text-stone-950"
              : "border-stone-300 bg-stone-100/70 text-stone-700 hover:border-amber-400 hover:bg-amber-50 dark:border-stone-800 dark:bg-black/20 dark:text-stone-100 dark:hover:border-amber-700 dark:hover:bg-amber-950/25"
        }`}
        onClick={onMoveClick}
        onMouseEnter={() => !moveBlocked && onModePreview("move")}
        onMouseLeave={() => onModePreview(null)}
        onFocus={() => !moveBlocked && onModePreview("move")}
        onBlur={() => onModePreview(null)}
        disabled={moveBlocked}
        title={moveReason}
      >
        <span className="block">{t("game.move")}</span>
        {moveReason ? (
          <span className="mt-0.5 block text-[10px] font-semibold opacity-80">{moveReason}</span>
        ) : null}
      </button>
      <button
        type="button"
        aria-pressed={actionMode === "attack"}
        className={`min-h-11 rounded-lg border px-2.5 py-2 text-left text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-rose-500/25 ${
          attackBlocked
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : actionMode === "attack"
              ? "border-rose-500 bg-rose-500 text-white"
              : "border-stone-300 bg-stone-100/70 text-stone-700 hover:border-rose-300 hover:bg-rose-50 dark:border-stone-800 dark:bg-black/20 dark:text-stone-100 dark:hover:border-rose-800 dark:hover:bg-rose-950/30"
        }`}
        onClick={onAttackClick}
        onMouseEnter={() => !attackBlocked && onModePreview("attack")}
        onMouseLeave={() => onModePreview(null)}
        onFocus={() => !attackBlocked && onModePreview("attack")}
        onBlur={() => onModePreview(null)}
        disabled={attackBlocked}
        title={attackReason}
      >
        <span className="block">{t("game.attack")}</span>
        {attackReason ? (
          <span className="mt-0.5 block text-[10px] font-semibold opacity-80">{attackReason}</span>
        ) : null}
      </button>
      <button
        type="button"
        className={`min-h-11 rounded-lg border px-2.5 py-2 text-left text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-sky-500/25 ${
          searchMoveBlocked
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : "border-stone-300 bg-stone-100/70 text-stone-700 hover:border-sky-300 hover:bg-sky-50 dark:border-stone-800 dark:bg-black/20 dark:text-stone-100 dark:hover:border-sky-800 dark:hover:bg-sky-950/30"
        }`}
        onClick={onSearchMoveClick}
        disabled={searchMoveBlocked}
        title={compactSearchMoveReason}
      >
        <span className="block">{t("game.searchMove")}</span>
        {compactSearchMoveReason ? (
          <span className="mt-0.5 block text-[9px] font-semibold leading-tight opacity-75">
            {compactSearchMoveReason}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className={`min-h-11 rounded-lg border px-2.5 py-2 text-left text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-sky-500/25 ${
          searchActionBlocked
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : "border-stone-300 bg-stone-100/70 text-stone-700 hover:border-sky-300 hover:bg-sky-50 dark:border-stone-800 dark:bg-black/20 dark:text-stone-100 dark:hover:border-sky-800 dark:hover:bg-sky-950/30"
        }`}
        onClick={onSearchActionClick}
        disabled={searchActionBlocked}
        title={compactSearchActionReason}
      >
        <span className="block">{t("game.searchAction")}</span>
        {compactSearchActionReason ? (
          <span className="mt-0.5 block text-[9px] font-semibold leading-tight opacity-75">
            {compactSearchActionReason}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        className={`min-h-11 rounded-lg border px-2.5 py-2 text-left text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-violet-500/25 ${
          stealthBlocked
            ? "border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-500"
            : "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-900/70 dark:bg-violet-950/30 dark:text-violet-200 dark:hover:border-violet-800 dark:hover:bg-violet-950/50"
        }`}
        onClick={onStealthClick}
        disabled={stealthBlocked}
        title={stealthReason}
      >
        <span className="block">{t("game.enterStealth")}</span>
        {stealthReason ? (
          <span className="mt-0.5 block text-[10px] font-semibold opacity-80">{stealthReason}</span>
        ) : null}
      </button>
    </>
  );
};
