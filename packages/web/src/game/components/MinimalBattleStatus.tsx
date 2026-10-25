import type { FC } from "react";
import type { PlayerId } from "rules";
import type { GameShellViewModel } from "../gameshell-content/hooks/useGameShellViewModel";
import { useI18n, type Translate } from "../../i18n";
import { getConnectionLabel, getUnitIdDisplayName } from "../../i18n/displayMetadata";

/**
 * One naming scheme for a seat across the minimal layout (header, turn pill, waiting line,
 * task badge, battle end): the player's name, falling back to the seat label.
 */
export function getMinimalPlayerName(
  vm: Pick<GameShellViewModel, "roomMeta">,
  owner: PlayerId,
  t: Translate,
): string {
  return vm.roomMeta?.playerNames?.[owner] || t(`roles.${owner}`);
}

/** "Round 3 · turn 5/15", or null outside the battle phase. */
export function getMinimalRoundLabel(
  view: GameShellViewModel["view"],
  t: Translate,
): string | null {
  if (!view || view.phase !== "battle") return null;
  const queue = view.turnQueue?.length ? view.turnQueue : view.turnOrder;
  const index = view.turnQueue?.length ? view.turnQueueIndex : view.turnOrderIndex;
  return t("game.roundTurnShort", {
    round: view.roundNumber,
    turn: index + 1,
    total: queue.length,
  });
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
  const name = player ? getMinimalPlayerName(vm, player, t) : null;
  // Figure first: a long nickname is cut at the end, never the figure.
  const who = name ? (unit ? `${unit} · ${name}` : name) : null;
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
