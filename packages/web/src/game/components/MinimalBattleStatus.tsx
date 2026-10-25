import type { FC } from "react";
import type { PlayerId } from "rules";
import type { GameShellViewModel } from "../gameshell-content/hooks/useGameShellViewModel";
import { useI18n, type Translate } from "../../i18n";
import { getConnectionLabel, getUnitIdDisplayName } from "../../i18n/displayMetadata";

export function getMinimalPlayerName(
  vm: Pick<GameShellViewModel, "roomMeta">,
  owner: PlayerId,
  t: Translate,
  options: { emptySeatAsRole?: boolean } = {},
): string {
  if (vm.roomMeta?.playerNames?.[owner]) return vm.roomMeta.playerNames[owner]!;
  if (vm.roomMeta?.players[owner]) return t("customLobby.guest");
  // "Waiting for player" reads wrong inside a sentence; a seat label does not.
  return options.emptySeatAsRole ? t(`roles.${owner}`) : t("customLobby.emptySeat");
}

/** True while the match view is on screen but the server cannot take actions from this client. */
export function isMinimalBattleOffline(
  vm: Pick<GameShellViewModel, "connectionStatus" | "joined">,
): boolean {
  return vm.connectionStatus !== "connected" || !vm.joined;
}

/** The waiting / spectating line, or null when it is the viewer's own move or nothing to wait on. */
export function getMinimalTurnStatusLabel(
  vm: GameShellViewModel,
  t: Translate,
  language: Parameters<typeof getUnitIdDisplayName>[2]["language"],
): string | null {
  const view = vm.view;
  if (!view || isMinimalBattleOffline(vm)) return null;
  if (view.phase !== "battle" && view.phase !== "placement") return null;
  if (vm.pendingMeta?.kind === "initiativeRoll") return null;
  const player = view.currentPlayer;
  // The sandbox controller plays both sides, so nothing is ever "the opponent's" there.
  if (!vm.isSpectator && (!player || player === vm.playerId || vm.canControlTestRoom)) return null;

  const unit =
    view.phase === "battle" ? getUnitIdDisplayName(view, view.activeUnitId, { language, t }) : null;
  const name = player ? getMinimalPlayerName(vm, player, t, { emptySeatAsRole: true }) : null;
  const who = name ? (unit ? `${name} · ${unit}` : name) : null;
  if (vm.isSpectator) return who ? t("game.spectatingTurn", { turn: who }) : t("game.spectating");
  return t(view.phase === "placement" ? "game.waitingPlacementOf" : "game.waitingTurnOf", {
    turn: who ?? "",
  });
}

/**
 * Minimal layout: one line saying whose move it is when it is not yours, so disabled
 * controls never look broken.
 */
export const MinimalTurnStatus: FC<{ vm: GameShellViewModel }> = ({ vm }) => {
  const { t, language } = useI18n();
  const label = getMinimalTurnStatusLabel(vm, t, language);
  if (!label) return null;
  const player = vm.view?.currentPlayer;

  return (
    <div
      className="minimal-turn-status"
      data-owner={player ?? undefined}
      data-kind={vm.isSpectator ? "spectator" : "waiting"}
      role="status"
      aria-live="polite"
      data-testid="minimal-turn-status"
    >
      <span className="minimal-turn-status__dot" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {vm.isSpectator ? null : (
        <span className="minimal-turn-status__hint">{t("game.controlsLocked")}</span>
      )}
    </div>
  );
};

/** Minimal layout: shown over the match while the socket or room session is being restored. */
export const MinimalConnectionBanner: FC<{ vm: GameShellViewModel }> = ({ vm }) => {
  const { t } = useI18n();
  if (!isMinimalBattleOffline(vm)) return null;
  return (
    <div
      className="minimal-connection-banner"
      role="alert"
      data-status={vm.connectionStatus}
      data-testid="minimal-connection-banner"
    >
      <span className="minimal-connection-banner__pulse" aria-hidden="true" />
      <strong>{t("game.connectionLostTitle")}</strong>
      <span className="minimal-connection-banner__text">
        {vm.connectionStatus === "connected"
          ? t("connection.reconnecting")
          : getConnectionLabel(vm.connectionStatus, t)}{" "}
        · {t("game.connectionLostHint")}
      </span>
    </div>
  );
};
