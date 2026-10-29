import type { FC, ReactNode } from "react";
import type { ActionMode, ActionPreviewMode } from "../../../../store";
import { useI18n } from "../../../../i18n";
import { localizeServerText } from "../../../../i18n/displayMetadata";
import { GrimoireRune } from "../../../../components/grimoire";

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
  /** Replaces the Attack button, e.g. by Attack with its variants as one split action. */
  renderAttack?: (state: { blocked: boolean; reason: string }) => ReactNode;
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
  renderAttack,
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
  // During targeting one shared notice explains the lock; buttons keep it only as a tooltip.
  // Otherwise a button names the resource it spends, or why it cannot be used.
  const subtitle = (reason: string, cost: string, small = false) => {
    const text = targetingActive ? "" : reason || cost;
    if (!text) return null;
    return (
      <span
        className={`mt-0.5 block font-semibold leading-tight ${small ? "text-[9px]" : "text-[10px]"} ${
          reason ? "opacity-80" : "action-control-cost"
        }`}
      >
        {text}
      </span>
    );
  };
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
        <GrimoireRune action="move" className="control-rune" />
        <span className="action-control__body">
          <span className="action-control__name">{t("game.move")}</span>
          {subtitle(moveReason, t("game.usesMovement"))}
        </span>
      </button>
      {renderAttack ? (
        renderAttack({ blocked: attackBlocked, reason: targetingActive ? "" : attackReason })
      ) : (
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
          <GrimoireRune action="attack" className="control-rune" />
          <span className="action-control__body">
            <span className="action-control__name">{t("game.attack")}</span>
            {subtitle(attackReason, t("game.usesAction"))}
          </span>
        </button>
      )}
      <button
        type="button"
        className="action-control"
        onClick={onSearchMoveClick}
        disabled={searchMoveBlocked}
        title={compactSearchMoveReason}
      >
        <GrimoireRune action="searchMove" className="control-rune" />
        <span className="action-control__body">
          <span className="action-control__name">{t("game.searchMove")}</span>
          {subtitle(compactSearchMoveReason, t("game.usesMovement"), true)}
        </span>
      </button>
      <button
        type="button"
        className="action-control"
        onClick={onSearchActionClick}
        disabled={searchActionBlocked}
        title={compactSearchActionReason}
      >
        <GrimoireRune action="searchAction" className="control-rune" />
        <span className="action-control__body">
          <span className="action-control__name">{t("game.searchAction")}</span>
          {subtitle(compactSearchActionReason, t("game.usesAction"), true)}
        </span>
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
          <GrimoireRune action="stealth" className="control-rune" />
          <span className="action-control__body">
            <span className="action-control__name">{t("game.enterStealth")}</span>
            {subtitle(stealthReason, t("game.usesStealth"))}
          </span>
        </button>
      ) : null}
    </>
  );
};
