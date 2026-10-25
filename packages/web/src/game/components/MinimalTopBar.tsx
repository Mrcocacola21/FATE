import { lazy, Suspense, useState, type FC } from "react";
import type { GameShellViewModel } from "../gameshell-content/hooks/useGameShellViewModel";
import { MatchTypeBadge } from "../../matches/MatchTypeBadge";
import { useI18n } from "../../i18n";
import { getConnectionLabel, getUnitIdDisplayName } from "../../i18n/displayMetadata";
import { getActiveBoardFieldVisual, getBoardFieldLabelKey } from "../../assets/registry";
import { SettingsDrawer } from "../../ui/SettingsDrawer";
import { TacticalIcon } from "../../ui/TacticalIcon";
import { getMinimalPlayerName } from "./MinimalBattleStatus";

const RulesModal = lazy(() =>
  import("../../components/RulesModal").then((module) => ({ default: module.RulesModal })),
);

/**
 * One-row header of the minimal battle layout: who is playing and whose turn it is.
 * Leaving the match and the rules live in the settings drawer.
 */
export const MinimalTopBar: FC<{ vm: GameShellViewModel }> = ({ vm }) => {
  const { t, language } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const view = vm.view!;
  const initiativePlayer = vm.pendingMeta?.kind === "initiativeRoll" ? vm.pendingMeta.player : null;
  const activePlayer = initiativePlayer ?? (view.phase === "ended" ? null : view.currentPlayer);
  const unitName = getUnitIdDisplayName(view, view.activeUnitId, { language, t });
  const activeFieldId = getActiveBoardFieldVisual(view);
  const connected = vm.connectionStatus === "connected";
  const turnTotal = (view.turnQueue?.length ? view.turnQueue : view.turnOrder).length;
  const turnIndex = (view.turnQueue?.length ? view.turnQueueIndex : view.turnOrderIndex) + 1;
  const isMine = !!activePlayer && activePlayer === vm.playerId;
  const playerName = (owner: "P1" | "P2") => getMinimalPlayerName(vm, owner, t);

  const turnLabel = initiativePlayer
    ? t("game.rollingInitiative")
    : !activePlayer
      ? t("common.waiting")
      : isMine
        ? unitName
          ? t("game.yourTurnWith", { unit: unitName })
          : t("draft.yourTurn")
        : t("game.turnOf", {
            player: getMinimalPlayerName(vm, activePlayer, t, { emptySeatAsRole: true }),
            unit: unitName ?? activePlayer,
          });

  return (
    <header className="minimal-top-bar" data-testid="minimal-top-bar">
      <span className="fate-brand text-base">{t("auth.brand")}</span>
      {/* Phones keep only the brand, the turn and the settings button in the header. */}
      <span className="hidden items-center gap-3 sm:inline-flex">
        {vm.roomMeta ? <MatchTypeBadge matchType={vm.roomMeta.matchType} /> : null}
        {vm.roomMeta?.roomMode === "test" ? (
          <span className="minimal-pill minimal-pill--special">{t("testRoom.badgeSandbox")}</span>
        ) : null}
      </span>
      <span
        className="minimal-connection"
        data-connected={String(connected)}
        title={getConnectionLabel(vm.connectionStatus, t)}
      >
        <span aria-hidden="true" />
        {getConnectionLabel(vm.connectionStatus, t)}
      </span>

      <div className="minimal-top-bar__center">
        <span
          className="minimal-turn"
          data-owner={activePlayer ?? undefined}
          data-mine={String(isMine)}
          title={turnLabel}
        >
          {turnLabel}
        </span>
        {view.phase === "battle" ? (
          <span className="hidden text-xs text-muted lg:inline">
            {t("game.roundTurnShort", {
              round: view.roundNumber,
              turn: turnIndex,
              total: turnTotal,
            })}
          </span>
        ) : null}
      </div>

      <span className="minimal-players hidden md:inline-flex">
        {(["P1", "P2"] as const).map((owner, index) => (
          <span key={owner} className="contents">
            {index === 1 ? <span className="text-muted">{t("game.versus")}</span> : null}
            <strong
              data-owner={owner}
              data-active={String(activePlayer === owner)}
              title={playerName(owner)}
            >
              {playerName(owner)}
            </strong>
          </span>
        ))}
      </span>
      {/* The field card on the left shows the details; this keeps the label readable for assistive tech. */}
      {activeFieldId ? (
        <span className="sr-only">
          {t("game.activeField")}: {t(getBoardFieldLabelKey(activeFieldId))}
        </span>
      ) : null}
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

      {settingsOpen ? (
        <SettingsDrawer
          onClose={() => setSettingsOpen(false)}
          actions={
            <>
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
              <button
                type="button"
                className="btn btn-danger"
                onClick={vm.handleLeave}
                disabled={vm.leavingRoom}
              >
                {vm.leavingRoom ? t("game.leaving") : t("game.leaveMatch")}
              </button>
            </>
          }
        />
      ) : null}
      {rulesOpen ? (
        <Suspense fallback={null}>
          <RulesModal open onClose={() => setRulesOpen(false)} />
        </Suspense>
      ) : null}
    </header>
  );
};
