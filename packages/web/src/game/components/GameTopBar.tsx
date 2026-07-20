import type { FC } from "react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useI18n } from "../../i18n";
import { StatusBadge } from "../../components/ui";
import { getConnectionLabel, getPhaseLabel } from "../../i18n/displayMetadata";
import { getGameModeName } from "../../modes/modeLabels";
import { ruleDeclarationKey } from "../gameshell-content/components/RuleDeclarationStatus";

interface GameTopBarProps {
  vm: any;
  compact?: boolean;
}

export const GameTopBar: FC<GameTopBarProps> = ({ vm, compact = false }) => {
  const { t } = useI18n();
  const selectedRuleKey = ruleDeclarationKey(vm.view?.ruleDeclaration?.selectedRuleId);
  const ruleLabel = selectedRuleKey
    ? t(`ruleDeclarations.${selectedRuleKey}.name`)
    : t("ruleDeclarations.notSelected");

  return (
    <div className={`panel-card panel-hud shrink-0 px-3 py-2 sm:px-4 ${compact ? "mobile-match-bar" : ""}`}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="brand-sigil hidden h-9 w-9 sm:flex" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="fate-brand truncate text-base">{t("game.matchTitle")}</h1>
              <StatusBadge tone={vm.connectionStatus === "connected" ? "success" : "danger"} dot>
                {getConnectionLabel(vm.connectionStatus, t)}
              </StatusBadge>
              <StatusBadge tone={vm.role === "spectator" ? "info" : "neutral"}>
                {vm.role ? t(`roles.${vm.role}`) : t("roles.noRole")}
              </StatusBadge>
              {vm.roomMeta?.roomMode === "test" ? (
                <StatusBadge tone="special">{t("testRoom.badgeSandbox")}</StatusBadge>
              ) : null}
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-stone-500 dark:text-stone-400">
              {t("game.room")} {vm.roomId ?? "-"}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusBadge tone="info">
            {getGameModeName(vm.roomMeta?.gameMode ?? "standard", t)}
          </StatusBadge>
          <div className={compact ? "hidden min-[420px]:inline-flex" : "inline-flex"}>
            <StatusBadge tone="special">{ruleLabel}</StatusBadge>
          </div>
          <StatusBadge tone="neutral">{getPhaseLabel(vm.view.phase, t)}</StatusBadge>
          <StatusBadge tone="neutral">
            {t("game.roundTurn")}: {vm.view.roundNumber} / {vm.view.turnNumber}
          </StatusBadge>
          <StatusBadge tone={vm.view.currentPlayer === vm.playerId ? "success" : "neutral"}>
            {vm.view.currentPlayer
              ? t("game.playerTurn", { player: vm.view.currentPlayer })
              : t("common.waiting")}
          </StatusBadge>
          <div className={compact ? "hidden min-[390px]:inline-flex" : "inline-flex"}>
            <StatusBadge tone="info">{vm.view.activeUnitId ?? "-"}</StatusBadge>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={vm.handleLeave}
            disabled={vm.leavingRoom}
          >
            {vm.leavingRoom ? t("game.leaving") : t("game.leaveMatch")}
          </button>
          <div className={compact ? "hidden min-[430px]:inline-flex" : "inline-flex"}>
            <LanguageSwitcher />
          </div>
          <div className={compact ? "hidden min-[430px]:inline-flex" : "inline-flex"}>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
};
