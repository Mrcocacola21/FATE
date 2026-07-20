import { useState, type FC } from "react";
import { PanelCard, SectionHeader, StatusBadge } from "../../../components/ui";
import { useI18n } from "../../../i18n";
import { TestRoomPanel } from "../../../testRoom/TestRoomPanel";
import { shouldShowTestRoomPanel } from "../../../testRoom/testRoomApi";
import { GameModeSelector } from "../../../modes/GameModeSelector";
import { getGameModeDescription, getGameModeName } from "../../../modes/modeLabels";
import { getSelectedHeroes } from "../../../figures/getSelectedHeroes";
import { getHeroDisplayName } from "../../../i18n/displayMetadata";
import { RuleDeclarationStatus } from "./RuleDeclarationStatus";
import { SidePanelTabs } from "./SidePanelTabs";

interface GameShellSideColumnProps {
  vm: any;
  mobile?: boolean;
}

export const GameShellSideColumn: FC<GameShellSideColumnProps> = ({ vm, mobile = false }) => {
  const { language, t } = useI18n();
  const [roomCodeCopied, setRoomCodeCopied] = useState(false);
  if (vm.view.phase !== "lobby") {
    return (
      <aside className="h-full min-h-0 min-w-0 overflow-hidden">
        <SidePanelTabs vm={vm} />
      </aside>
    );
  }

  return (
    <aside className={`scroll-panel h-full min-h-0 min-w-0 space-y-3 overflow-y-auto ${mobile ? "pb-3" : "pr-1"}`}>
      {shouldShowTestRoomPanel(vm.roomMeta?.roomMode, vm.canControlTestRoom) ? (
        <TestRoomPanel vm={vm} />
      ) : null}
      <RuleDeclarationStatus vm={vm} />
      <PanelCard variant="parchment" className="p-5">
        <SectionHeader
          kicker={t("game.stagingRoom")}
          title={t("game.matchLobby")}
          description={t("game.matchLobbyDescription")}
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["P1", "P2"] as const).map((seat) => (
            <div key={seat} className="panel-card-muted p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {seat}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusBadge tone={vm.roomMeta?.players[seat] ? "success" : "neutral"}>
                  {vm.roomMeta?.players[seat] ? t("common.occupied") : t("common.open")}
                </StatusBadge>
                <StatusBadge tone={vm.readyStatus[seat] ? "success" : "warning"}>
                  {vm.readyStatus[seat] ? t("common.ready") : t("common.waiting")}
                </StatusBadge>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge tone="info">
            {t("lobby.spectators", { count: vm.roomMeta?.spectators ?? 0 })}
          </StatusBadge>
          <StatusBadge tone={vm.isHost ? "special" : "neutral"}>
            {t("game.you", { role: vm.role ? t(`roles.${vm.role}`) : "-" })}
            {vm.isHost ? ` / ${t("roles.host")}` : ""}
          </StatusBadge>
          <StatusBadge tone="info">
            {getGameModeName(vm.roomMeta?.gameMode ?? "standard", t)}
          </StatusBadge>
        </div>
        {mobile && vm.roomId ? (
          <button
            type="button"
            className="btn btn-secondary mt-3 w-full"
            onClick={async () => {
              await navigator.clipboard?.writeText(vm.roomId);
              setRoomCodeCopied(true);
            }}
          >
            {roomCodeCopied ? t("mobile.roomCodeCopied") : t("mobile.copyRoomCode")}
          </button>
        ) : null}
        {vm.roomMeta?.roomMode === "normal" ? (
          <GameModeSelector
            value={vm.roomMeta?.gameMode ?? "standard"}
            isHost={vm.isHost}
            disabled={!!vm.pendingMeta || !!vm.roomMeta?.draftState || vm.view.phase !== "lobby"}
            onChange={vm.setGameMode}
          />
        ) : null}
        {vm.roomMeta?.gameMode === "classic" ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-200">
            {t("modes.classic.figureSetWarning")}
          </div>
        ) : null}
        {mobile && vm.roomMeta?.gameMode === "draft" ? (
          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm text-violet-800 dark:border-violet-800/70 dark:bg-violet-950/45 dark:text-violet-200">
            {t("mobile.draftReadyHint")}
          </div>
        ) : null}
        {mobile && vm.roomMeta?.gameMode === "standard" ? (
          <details className="panel-card-muted mt-3 p-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">
              {t("mobile.selectedFigureSet")}
            </summary>
            <div className="mt-2 grid gap-1.5 text-xs">
              {getSelectedHeroes().map((hero) => (
                <div key={hero.mainClass} className="flex justify-between gap-3">
                  <span className="font-semibold">{t(`classes.${hero.mainClass}`)}</span>
                  <span className="truncate">
                    {getHeroDisplayName(hero.id, hero.name, language)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
        {vm.roomMeta?.gameMode ? (
          <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {getGameModeDescription(vm.roomMeta.gameMode, t)}
          </p>
        ) : null}
        {vm.seat ? (
          <button
            type="button"
            className={`btn mt-4 w-full ${vm.playerReady ? "btn-warning" : "btn-primary"}`}
            onClick={() => vm.setReady(!vm.playerReady)}
            disabled={!vm.joined || !!vm.pendingMeta}
          >
            {vm.playerReady ? t("game.markNotReady") : t("game.readyUp")}
          </button>
        ) : null}
        {vm.seat ? (
          <button
            type="button"
            className="btn btn-secondary mt-2 w-full"
            onClick={() => vm.switchRole("spectator")}
            disabled={!vm.joined || !!vm.pendingMeta}
          >
            {t("game.switchSpectator")}
          </button>
        ) : null}
        {vm.isHost ? (
          <button
            type="button"
            className="btn btn-strong mt-3 w-full"
            onClick={() => vm.startGame()}
            disabled={!vm.canStartGame}
            title={vm.canStartGame ? t("game.startMatch") : t("game.startBlocked")}
          >
            {vm.roomMeta?.gameMode === "draft" ? t("draft.startDraft") : t("game.startGame")}
          </button>
        ) : null}
      </PanelCard>
    </aside>
  );
};
