import { MatchTypeBadge } from "../../../matches/MatchTypeBadge";
import { RatedCompatibilityPanel } from "../../../lobby/RatedCompatibilityPanel";
import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import { useState, type FC } from "react";
import { PanelCard, SectionHeader } from "../../../components/ui";
import { Avatar } from "../../../profile/Avatar";
import { useI18n } from "../../../i18n";
import { TestRoomPanel } from "../../../testRoom/TestRoomPanel";
import { shouldShowTestRoomPanel } from "../../../testRoom/testRoomApi";
import { GameModeSelector } from "../../../modes/GameModeSelector";
import { getGameModeDescription, getGameModeName } from "../../../modes/modeLabels";
import { getSelectedHeroes } from "../../../figures/getSelectedHeroes";
import { getHeroDisplayName } from "../../../i18n/displayMetadata";
import { RuleDeclarationStatus } from "./RuleDeclarationStatus";
import { SidePanelTabs } from "./SidePanelTabs";
import { hasAuthoritativeMatchStarted } from "../../pendingState";
import { InvitePanel } from "../../../invites/InvitePanel";

interface GameShellSideColumnProps {
  vm: GameShellViewModel;
  mobile?: boolean;
}

/** One seat in the waiting room: the player's arched avatar, name and a single readiness state. */
function LobbySeat({ vm, seat }: { vm: GameShellViewModel; seat: "P1" | "P2" }) {
  const { t } = useI18n();
  const meta = vm.roomMeta;
  const taken = !!meta?.players[seat] || meta?.origin === "MATCHMAKING";
  const name = taken ? meta?.playerNames?.[seat] || t("customLobby.guest") : null;
  const mine = vm.seat === seat;
  const ready = !!vm.readyStatus[seat];
  const rating =
    meta?.matchType === "RATED" ? (meta.ratedCompatibility?.ratings[seat] ?? null) : null;
  const state = !taken
    ? t(meta?.origin === "MATCHMAKING" ? "customLobby.reserved" : "customLobby.emptySeat")
    : ready
      ? t("common.ready")
      : t("common.waiting");
  return (
    <div
      className="lobby-seat"
      data-taken={taken || undefined}
      data-mine={mine || undefined}
      data-ready={(taken && ready) || undefined}
      data-testid={`lobby-seat-${seat}`}
    >
      <span className="lobby-seat__arch" aria-hidden="true">
        {name ? (
          <Avatar
            username={name}
            displayName={name}
            avatarUrl={meta?.playerAvatars?.[seat] ?? null}
            arch
          />
        ) : (
          <span className="lobby-seat__empty">+</span>
        )}
      </span>
      <span className="lobby-seat__kicker">
        {seat}
        {mine ? ` · ${t("competitive.you")}` : ""}
        {mine && vm.isHost ? ` · ${t("roles.host")}` : ""}
      </span>
      <strong className="lobby-seat__name" dir="auto">
        {name ?? t("customLobby.emptySeat")}
      </strong>
      {rating != null && (
        <span className="lobby-seat__rating">
          {t("matchmaking.rating")} {Math.round(rating)}
        </span>
      )}
      {(taken || meta?.origin === "MATCHMAKING") && (
        <span className="lobby-seat__state">
          <span aria-hidden="true" className="lobby-seat__dot" />
          {state}
        </span>
      )}
    </div>
  );
}

export const GameShellSideColumn: FC<GameShellSideColumnProps> = ({ vm, mobile = false }) => {
  const { language, t } = useI18n();
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
      <PanelCard variant="parchment" className="p-5">
        <SectionHeader
          kicker={t("game.stagingRoom")}
          title={vm.roomMeta?.lobbyName || t("customLobby.defaultName")}
          description={t("game.matchLobbyDescription")}
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
        <div className="lobby-seats" data-testid="lobby-seats">
          {(["P1", "P2"] as const).map((seat) => (
            <LobbySeat key={seat} vm={vm} seat={seat} />
          ))}
        </div>
        <InvitePanel />
        {vm.roomMeta?.matchType === "RATED" && vm.roomMeta.origin !== "MATCHMAKING" && (
          <RatedCompatibilityPanel compatibility={vm.roomMeta.ratedCompatibility} />
        )}
        <p className="lobby-meta">
          {getGameModeName(vm.roomMeta?.gameMode ?? "standard", t)} ·{" "}
          {t("lobby.spectators", { count: vm.roomMeta?.spectators ?? 0 })}
        </p>
        {vm.roomId ? (
          <button
            type="button"
            className="btn btn-secondary mt-3 w-full"
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
            aria-describedby={
              vm.roomMeta?.matchType === "RATED" && vm.roomMeta.origin !== "MATCHMAKING"
                ? "rated-start-eligibility"
                : undefined
            }
            title={vm.canStartGame ? t("game.startMatch") : t("game.startBlocked")}
          >
            {vm.roomMeta?.gameMode === "draft" ? t("draft.startDraft") : t("game.startGame")}
          </button>
        ) : null}
      </PanelCard>
    </aside>
  );
};
