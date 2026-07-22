import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../../i18n";
import { getPendingRollLabel } from "../helpers";
import { GameShellPendingRoll } from "./GameShellPendingRoll";

function PendingRollWaitingOverlay({ vm }: { vm: any }) {
  const { language, t } = useI18n();
  const pending = vm.pendingMeta;
  const isLocalPending = vm.pendingForLocalPlayer;
  const isDonMadnessDirection = pending.kind === "donMadDelusionDirection";
  const isDirectChoice =
    isDonMadnessDirection || pending.kind === "papyrusBoneChoice";
  const title =
    pending.kind === "initiativeRoll"
      ? t("pending.rollInitiative")
      : getPendingRollLabel(pending.kind, language);

  return (
    <div
      className="game-pending-modal-layer fixed inset-0 flex items-center justify-center overflow-y-auto bg-black/80 px-3 backdrop-blur-md sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pending-waiting-title"
      aria-describedby="pending-waiting-description"
      data-layer="pending-task"
      data-testid="pending-roll-waiting-overlay"
    >
      <div className="game-pending-modal-card arcane-prompt scroll-panel panel-card w-full max-w-lg overflow-y-auto border-violet-400/45 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl shadow-violet-950/30 sm:p-6">
        <div className="relative z-10 flex items-start gap-3">
          <div className="brand-sigil mt-0.5 h-11 w-11" aria-hidden="true" />
          <div className="min-w-0">
            <div className="section-kicker text-violet-700 dark:text-violet-300">
              {t("game.currentTask")}
            </div>
            <h2 id="pending-waiting-title" className="fate-brand mt-1 text-xl">
              {title}
            </h2>
          </div>
        </div>
        <p
          id="pending-waiting-description"
          className="relative z-10 mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300"
          aria-live="polite"
        >
          {isDirectChoice
            ? isLocalPending
              ? t("pending.preparingChoice")
              : t("pending.waitingForOpponentChoice")
            : isLocalPending
              ? t("pending.preparingRoll")
              : t("pending.waitingForOpponentRoll")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="status-pill badge-warning">
            {t("pending.pendingFor", { player: pending.player })}
          </span>
          <span className="status-pill badge-special">
            {getPendingRollLabel(pending.kind, language)}
          </span>
        </div>
        {pending.kind === "initiativeRoll" && vm.view?.initiative ? (
          <div className="panel-card-muted mt-3 space-y-1 p-3 text-xs text-stone-600 dark:text-stone-200">
            {(["P1", "P2"] as const).map((player) =>
              vm.view.initiative[player] !== null ? (
                <div key={player}>
                  {t("pending.rolled", {
                    player,
                    value: vm.view.initiative[player],
                  })}
                </div>
              ) : null,
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function GlobalPendingTaskLayer({ vm }: { vm: any }) {
  const showAction = !!vm.pendingRoll && !!vm.playerId && !vm.boardSelectionPending;
  const showWaiting = !!vm.pendingMeta && !!vm.playerId && !vm.pendingRoll && !vm.isSpectator;
  const active = showAction || showWaiting;

  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);

  if (!active) return null;

  const layer = showAction ? (
    <GameShellPendingRoll vm={vm} />
  ) : (
    <PendingRollWaitingOverlay vm={vm} />
  );

  return typeof document === "undefined" ? layer : createPortal(layer, document.body);
}
