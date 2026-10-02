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
  showStealthAction?: boolean;
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
  showStealthAction = true,
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
        className="action-control"
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
        className="action-control"
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
        className="action-control"
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
        className="action-control"
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
      {showStealthAction ? (
        <button
          type="button"
          data-testid="enter-stealth-action"
          className="action-control"
          onClick={onStealthClick}
          disabled={stealthBlocked}
          title={stealthReason}
        >
          <span className="block">{t("game.enterStealth")}</span>
          {stealthReason ? (
            <span className="mt-0.5 block text-[10px] font-semibold opacity-80">
              {stealthReason}
            </span>
          ) : null}
        </button>
      ) : null}
    </>
  );
};
