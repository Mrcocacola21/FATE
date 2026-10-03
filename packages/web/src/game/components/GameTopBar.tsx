import { MatchTypeBadge } from "../../matches/MatchTypeBadge";
import type { GameShellViewModel } from "../gameshell-content/hooks/useGameShellViewModel";
import type { FC } from "react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useI18n } from "../../i18n";
import { StatusBadge } from "../../components/ui";
import { getConnectionLabel, getPhaseLabel } from "../../i18n/displayMetadata";
import { getGameModeName } from "../../modes/modeLabels";
import { ruleDeclarationKey } from "../gameshell-content/components/RuleDeclarationStatus";
import { getActiveBoardFieldVisual, getBoardFieldLabelKey } from "../../assets/registry";

interface GameTopBarProps {
  vm: GameShellViewModel;
  compact?: boolean;
}

export const GameTopBar: FC<GameTopBarProps> = ({ vm, compact = false }) => {
  const { t } = useI18n();
  const selectedRuleKey = ruleDeclarationKey(vm.view?.ruleDeclaration?.selectedRuleId);
  const ruleLabel = selectedRuleKey
    ? t(`ruleDeclarations.${selectedRuleKey}.name`)
    : t("ruleDeclarations.notSelected");
  const phaseLabel =
    vm.pendingMeta?.kind === "initiativeRoll"
      ? t("game.rollingInitiative")
      : getPhaseLabel(vm.view!.phase, t);
  const initiativePendingPlayer =
    vm.pendingMeta?.kind === "initiativeRoll" ? vm.pendingMeta.player : null;
  const activeFieldId = getActiveBoardFieldVisual(vm.view!);
  const activePlayer =
    initiativePendingPlayer ?? (vm.view!.phase === "ended" ? null : vm.view!.currentPlayer);

  return (
    <div
      className={`panel-card panel-hud shrink-0 px-3 py-2 sm:px-4 ${compact ? "mobile-match-bar" : ""}`}
    >
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
              {vm.roomMeta && <MatchTypeBadge matchType={vm.roomMeta.matchType} />}
              {vm.roomMeta?.roomMode === "test" ? (
                <StatusBadge tone="special">{t("testRoom.badgeSandbox")}</StatusBadge>
              ) : null}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-stone-500 dark:text-stone-400">
              {vm.roomMeta?.lobbyName || t("customLobby.defaultName")}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:justify-end">
          <StatusBadge tone="info">
            {getGameModeName(vm.roomMeta?.gameMode ?? "standard", t)}
          </StatusBadge>
          <div className={compact ? "hidden min-[420px]:inline-flex" : "inline-flex"}>
            <StatusBadge tone="special">{ruleLabel}</StatusBadge>
          </div>
          <StatusBadge tone="neutral">{phaseLabel}</StatusBadge>
          {activeFieldId ? (
            <StatusBadge tone="warning">
              {t("game.activeField")}: {t(getBoardFieldLabelKey(activeFieldId))}
            </StatusBadge>
          ) : null}
          <StatusBadge tone="neutral">
            {t("game.roundTurn")}: {vm.view!.roundNumber} / {vm.view!.turnNumber}
          </StatusBadge>
          <StatusBadge
            tone={
              (initiativePendingPlayer ?? vm.view!.currentPlayer) === vm.playerId
                ? "success"
                : "neutral"
            }
          >
            {initiativePendingPlayer
              ? t("pending.pendingFor", { player: initiativePendingPlayer })
              : vm.view!.currentPlayer
                ? t("game.playerTurn", { player: vm.view!.currentPlayer })
                : t("common.waiting")}
          </StatusBadge>
          <div className={compact ? "hidden min-[390px]:inline-flex" : "inline-flex"}>
            <StatusBadge tone="info">{vm.view!.activeUnitId ?? "-"}</StatusBadge>
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
      <div className="player-strip" aria-label={t("game.tabsPlayers")}>
        {(["P1", "P2"] as const).map((owner) => (
          <div
            key={owner}
            className="player-presence"
            data-owner={owner}
            data-active={String(activePlayer === owner)}
          >
            <span className="player-presence-seat">{owner}</span>
            <span className="player-presence-name min-w-0 truncate text-xs font-semibold">
              {vm.roomMeta?.playerNames?.[owner] || t(vm.roomMeta?.players[owner] ? "customLobby.guest" : "customLobby.emptySeat")}
            </span>
            {activePlayer === owner ? (
              <span className="turn-indicator">{t("common.current")}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
