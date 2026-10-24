import { MatchTypeBadge } from "../../matches/MatchTypeBadge";
import type { GameShellViewModel } from "../gameshell-content/hooks/useGameShellViewModel";
import { lazy, Suspense, useState, type FC } from "react";
import { useI18n } from "../../i18n";
import { StatusBadge } from "../../components/ui";
import { getConnectionLabel, getPhaseLabel, getUnitIdDisplayName } from "../../i18n/displayMetadata";
import { getGameModeName } from "../../modes/modeLabels";
import { ruleDeclarationKey } from "../gameshell-content/components/RuleDeclarationStatus";
import { getActiveBoardFieldVisual, getBoardFieldLabelKey } from "../../assets/registry";
import { SettingsDrawer } from "../../ui/SettingsDrawer";
import { TacticalIcon } from "../../ui/TacticalIcon";

const RulesModal = lazy(() =>
  import("../../components/RulesModal").then((module) => ({ default: module.RulesModal })),
);

interface GameTopBarProps {
  vm: GameShellViewModel;
  compact?: boolean;
}

export const GameTopBar: FC<GameTopBarProps> = ({ vm, compact = false }) => {
  const { t, language } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
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
  const activeUnitName = getUnitIdDisplayName(vm.view!, vm.view!.activeUnitId, { language, t });

  // One row: who plays, whose turn it is, and the match controls; settings live in the drawer.
  return (
    <div
      className={`panel-card panel-hud match-top-bar shrink-0 px-3 py-2 ${compact ? "mobile-match-bar" : ""}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="brand-sigil hidden h-8 w-8 sm:flex" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h1 className="fate-brand truncate text-sm sm:text-base">{t("game.matchTitle")}</h1>
              <StatusBadge tone={vm.connectionStatus === "connected" ? "success" : "danger"} dot>
                {getConnectionLabel(vm.connectionStatus, t)}
              </StatusBadge>
              {!compact ? (
                <StatusBadge tone={vm.role === "spectator" ? "info" : "neutral"}>
                  {vm.role ? t(`roles.${vm.role}`) : t("roles.noRole")}
                </StatusBadge>
              ) : null}
              {vm.roomMeta && !compact ? <MatchTypeBadge matchType={vm.roomMeta.matchType} /> : null}
              {vm.roomMeta?.roomMode === "test" ? (
                <StatusBadge tone="special">{t("testRoom.badgeSandbox")}</StatusBadge>
              ) : null}
            </div>
            {!compact ? (
              <div className="mt-0.5 truncate text-[11px] text-stone-500 dark:text-stone-400">
                {vm.roomMeta?.lobbyName || t("customLobby.defaultName")}
              </div>
            ) : null}
          </div>
        </div>

        {!compact ? (
          <div className="player-strip player-strip--inline" aria-label={t("game.tabsPlayers")}>
            {(["P1", "P2"] as const).map((owner) => (
              <div
                key={owner}
                className="player-presence"
                data-owner={owner}
                data-active={String(activePlayer === owner)}
              >
                <span className="player-presence-seat">{owner}</span>
                <span className="player-presence-name min-w-0 truncate text-xs font-semibold">
                  {vm.roomMeta?.playerNames?.[owner] ||
                    t(vm.roomMeta?.players[owner] ? "customLobby.guest" : "customLobby.emptySeat")}
                </span>
                {activePlayer === owner ? (
                  <span className="turn-indicator">{t("common.current")}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5">
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
          {activeUnitName ? (
            <div className={compact ? "hidden min-[390px]:inline-flex" : "inline-flex"}>
              <StatusBadge tone="info">{activeUnitName}</StatusBadge>
            </div>
          ) : null}
          <StatusBadge tone="neutral">
            {compact ? null : `${t("game.roundTurn")}: `}
            <bdi dir="ltr">
              {vm.view!.roundNumber} / {vm.view!.turnNumber}
            </bdi>
          </StatusBadge>
          {activeFieldId ? (
            <StatusBadge tone="warning">
              {t("game.activeField")}: {t(getBoardFieldLabelKey(activeFieldId))}
            </StatusBadge>
          ) : null}
          {!compact ? (
            <>
              <StatusBadge tone="info">
                {getGameModeName(vm.roomMeta?.gameMode ?? "standard", t)}
              </StatusBadge>
              <StatusBadge tone="special">{ruleLabel}</StatusBadge>
              <StatusBadge tone="neutral">{phaseLabel}</StatusBadge>
            </>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={vm.handleLeave}
            disabled={vm.leavingRoom}
          >
            {vm.leavingRoom ? t("game.leaving") : t("game.leaveMatch")}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-label={t("mobile.settings")}
            title={t("mobile.settings")}
            onClick={() => setSettingsOpen(true)}
            data-testid="match-settings"
          >
            <TacticalIcon name="settings" />
          </button>
        </div>
      </div>
      {settingsOpen ? (
        <SettingsDrawer
          onClose={() => setSettingsOpen(false)}
          actions={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSettingsOpen(false);
                setRulesOpen(true);
              }}
            >
              <TacticalIcon name="rules" />
              {t("lobby.rules")}
            </button>
          }
        />
      ) : null}
      {rulesOpen ? (
        <Suspense fallback={null}>
          <RulesModal open onClose={() => setRulesOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
};
