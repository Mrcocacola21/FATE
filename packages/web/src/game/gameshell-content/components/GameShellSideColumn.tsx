import { MatchTypeBadge } from "../../../matches/MatchTypeBadge";
import { RatedCompatibilityPanel } from "../../../lobby/RatedCompatibilityPanel";
import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import { useState, type FC } from "react";
import { PanelCard, SectionHeader } from "../../../components/ui";
import { useI18n } from "../../../i18n";
import { TestRoomPanel } from "../../../testRoom/TestRoomPanel";
import { shouldShowTestRoomPanel } from "../../../testRoom/testRoomApi";
import { GameModeSelector } from "../../../modes/GameModeSelector";
import { getGameModeDescription } from "../../../modes/modeLabels";
import { RuleDeclarationStatus } from "./RuleDeclarationStatus";
import { SidePanelTabs } from "./SidePanelTabs";
import { hasAuthoritativeMatchStarted } from "../../pendingState";
import { InvitePanel } from "../../../invites/InvitePanel";

interface GameShellSideColumnProps {
  vm: GameShellViewModel;
  mobile?: boolean;
}

export const GameShellSideColumn: FC<GameShellSideColumnProps> = ({ vm, mobile = false }) => {
  const { t } = useI18n();
  const [roomCodeCopied, setRoomCodeCopied] = useState(false);
  if (hasAuthoritativeMatchStarted(vm.view!, vm.pendingMeta)) {
    return (
      <aside className="h-full min-h-0 min-w-0 overflow-hidden">
        <SidePanelTabs vm={vm} />
      </aside>
    );
  }

  return (
    <aside
      className={`scroll-panel h-full min-h-0 min-w-0 space-y-3 overflow-y-auto ${mobile ? "pb-3" : "pr-1"}`}
    >
      {shouldShowTestRoomPanel(vm.roomMeta?.roomMode, vm.canControlTestRoom) ? (
        <TestRoomPanel vm={vm} />
      ) : null}
      <RuleDeclarationStatus vm={vm} />
      <PanelCard variant="parchment" className="p-5" data-testid="waiting-settings">
        <SectionHeader
          title={t("waitingRoom.settingsTitle")}
        />
        {vm.roomMeta && (
          <div className="mt-4 space-y-2">
            <MatchTypeBadge matchType={vm.roomMeta.matchType} />
            <p className="text-sm text-muted">
              {t(
                vm.roomMeta.matchType === "RATED"
                  ? "matchTypes.ratedDescription"
                  : "matchTypes.casualDescription",
              )}
            </p>
          </div>
        )}
        <InvitePanel />
        {vm.roomMeta?.matchType === "RATED" && vm.roomMeta.origin !== "MATCHMAKING" && (
          <RatedCompatibilityPanel compatibility={vm.roomMeta.ratedCompatibility} />
        )}
        {vm.roomId ? (
          <div className="waiting-code">
            <span className="waiting-code__label">{t("customLobby.code")}</span>
            <code className="waiting-code__value" dir="ltr">
              {vm.roomId}
            </code>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              try {
                if (navigator.clipboard) {
                  await navigator.clipboard.writeText(vm.roomId!);
                  setRoomCodeCopied(true);
                }
              } catch {
                setRoomCodeCopied(false);
              }
            }}
          >
            {roomCodeCopied ? t("customLobby.copied") : t("customLobby.copyCode")}
          </button>
          </div>
        ) : null}
        {vm.roomMeta?.roomMode === "normal" ? (
          <GameModeSelector
            value={vm.roomMeta?.gameMode ?? "standard"}
            isHost={vm.isHost}
            disabled={
              !!vm.roomMeta?.gameModeLocked ||
              !!vm.pendingMeta ||
              !!vm.roomMeta?.draftState ||
              vm.view!.phase !== "lobby"
            }
            onChange={vm.setGameMode}
          />
        ) : null}
        {mobile && vm.roomMeta?.gameMode === "draft" ? (
          <p className="waiting-note">{t("mobile.draftReadyHint")}</p>
        ) : null}
        {vm.roomMeta?.gameMode ? (
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {getGameModeDescription(vm.roomMeta.gameMode, t)}
          </p>
        ) : null}
      </PanelCard>
    </aside>
  );
};
