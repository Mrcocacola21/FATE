import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GameAction, PendingRollContext, RollKind } from "rules";
import { useI18n } from "../../../i18n";
import { getPendingRollLabel } from "../helpers";
import {
  canResolvePendingRollDirectly,
  FALLBACK_PENDING_ROLL_CONTEXT,
  pendingRollTitle,
} from "../../pendingRollPresentation";
import { GameShellPendingRoll } from "./GameShellPendingRoll";
import { PendingRollDetails } from "./PendingRollDetails";

export function nextPendingRollCollapseState(
  current: string | null,
  action: { type: "collapse"; rollId: string } | { type: "open" } | { type: "resolved" },
): string | null {
  if (action.type === "collapse") return action.rollId;
  return null;
}

export function isPendingRollCollapsed(
  collapsedRollId: string | null,
  pendingRollId: string | null,
): boolean {
  return !!pendingRollId && collapsedRollId === pendingRollId;
}

function contextForPending(pending: {
  player: "P1" | "P2";
  presentation?: PendingRollContext;
}): PendingRollContext {
  return (
    pending.presentation ?? {
      ...FALLBACK_PENDING_ROLL_CONTEXT,
      requestedPlayerId: pending.player,
    }
  );
}

function PendingRollWaitingOverlay({ vm, onCollapse }: { vm: any; onCollapse: () => void }) {
  const { language, t } = useI18n();
  const pending = vm.pendingMeta;
  const context = contextForPending(pending);
  const isLocalPending = vm.pendingForLocalPlayer;
  const isDonMadnessDirection = pending.kind === "donMadDelusionDirection";
  const isDirectChoice = isDonMadnessDirection || pending.kind === "papyrusBoneChoice";
  const hasStructuredContext =
    !!pending.presentation && pending.presentation.diceLabel !== "Choice";
  const legacyTitle =
    pending.kind === "initiativeRoll"
      ? t("pending.rollInitiative")
      : getPendingRollLabel(pending.kind, language);

  return (
    <div
      className="game-pending-modal-layer fixed inset-0 flex items-center justify-center overflow-y-auto bg-black/80 px-3 backdrop-blur-md sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={hasStructuredContext ? "pending-roll-title" : "pending-waiting-title"}
      data-layer="pending-task"
      data-testid="pending-roll-waiting-overlay"
    >
      <div className="game-pending-modal-card arcane-prompt scroll-panel panel-card relative w-full max-w-lg overflow-y-auto border-violet-400/45 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl shadow-violet-950/30 sm:p-6">
        <button
          type="button"
          className="pending-roll-collapse-icon"
          onClick={onCollapse}
          aria-label={t("pending.context.collapse")}
          title={t("pending.context.viewBattlefield")}
        >
          <span aria-hidden="true">−</span>
        </button>
        {hasStructuredContext ? (
          <PendingRollDetails
            context={context}
            mode="waiting"
            playerLabel={
              context.requestedPlayerLabel ??
              vm.roomMeta?.playerNames?.[pending.player] ??
              pending.player
            }
          />
        ) : (
          <>
            <div className="relative z-10 flex items-start gap-3">
              <div className="brand-sigil mt-0.5 h-11 w-11" aria-hidden="true" />
              <div className="min-w-0">
                <div className="section-kicker text-violet-700 dark:text-violet-300">
                  {t("game.currentTask")}
                </div>
                <h2 id="pending-waiting-title" className="fate-brand mt-1 text-xl">
                  {legacyTitle}
                </h2>
              </div>
            </div>
            <p className="relative z-10 mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
              {isDirectChoice
                ? isLocalPending
                  ? t("pending.preparingChoice")
                  : t("pending.waitingForOpponentChoice")
                : isLocalPending
                  ? t("pending.preparingRoll")
                  : t("pending.waitingForOpponentRoll")}
            </p>
          </>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="status-pill badge-warning">
            {t("pending.pendingFor", {
              player:
                context.requestedPlayerLabel ??
                vm.roomMeta?.playerNames?.[pending.player] ??
                pending.player,
            })}
          </span>
          <span className="status-pill badge-special">
            {hasStructuredContext ? context.diceLabel : getPendingRollLabel(pending.kind, language)}
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
        <button type="button" className="pending-roll-collapse-button" onClick={onCollapse}>
          <span aria-hidden="true">⌄</span>
          {t("pending.context.collapse")}
          <span className="font-normal opacity-70">· {t("pending.context.viewBattlefield")}</span>
        </button>
      </div>
    </div>
  );
}

export function CollapsedPendingRollChip({
  pending,
  active,
  onOpen,
  onRoll,
}: {
  pending: {
    kind: RollKind;
    player: "P1" | "P2";
    presentation?: PendingRollContext;
  };
  active: boolean;
  onOpen: () => void;
  onRoll?: () => void;
}) {
  const { t } = useI18n();
  const context = contextForPending(pending);
  const canRoll = active && canResolvePendingRollDirectly(pending.kind) && !!onRoll;
  return (
    <div
      className="pending-roll-chip-layer pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-center px-3 sm:bottom-auto sm:top-4"
      data-layer="pending-task"
      data-testid="pending-roll-collapsed"
    >
      <div className="pending-roll-chip pointer-events-auto" role="status" aria-live="polite">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onOpen}
          aria-label={t("pending.context.open")}
        >
          <span className="block truncate text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
            {active
              ? t("pending.rollRequired")
              : t("pending.context.waitingFor", {
                  player: context.requestedPlayerLabel ?? pending.player,
                })}
          </span>
          <span className="mt-0.5 block truncate text-sm font-bold text-stone-50">
            {pendingRollTitle(context, t)} · {context.diceLabel}
          </span>
        </button>
        {canRoll ? (
          <button type="button" className="pending-roll-chip__roll" onClick={onRoll}>
            {t("pending.context.rollShort")}
          </button>
        ) : null}
        <button type="button" className="pending-roll-chip__open" onClick={onOpen}>
          {t("pending.context.open")}
        </button>
      </div>
    </div>
  );
}

export function GlobalPendingTaskLayer({ vm }: { vm: any }) {
  const showAction = !!vm.pendingRoll && !!vm.playerId && !vm.boardSelectionPending;
  const showWaiting = !!vm.pendingMeta && !!vm.playerId && !vm.pendingRoll && !vm.isSpectator;
  const active = showAction || showWaiting;
  const pending = showAction ? vm.pendingRoll : vm.pendingMeta;
  const pendingId = pending?.id ?? null;
  const [collapsedRollId, setCollapsedRollId] = useState<string | null>(null);
  const collapsed = isPendingRollCollapsed(collapsedRollId, pendingId);

  useEffect(() => {
    if (!pendingId) {
      setCollapsedRollId((current) => nextPendingRollCollapseState(current, { type: "resolved" }));
    }
  }, [pendingId]);

  useEffect(() => {
    if (!active || collapsed || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active, collapsed]);

  if (!active || !pending) return null;

  const open = () =>
    setCollapsedRollId((current) => nextPendingRollCollapseState(current, { type: "open" }));
  const collapse = () =>
    setCollapsedRollId((current) =>
      nextPendingRollCollapseState(current, {
        type: "collapse",
        rollId: pending.id,
      }),
    );
  const roll = showAction
    ? () =>
        vm.sendAction({
          type: "resolvePendingRoll",
          pendingRollId: vm.pendingRoll.id,
        } as GameAction)
    : undefined;

  const layer = collapsed ? (
    <CollapsedPendingRollChip pending={pending} active={showAction} onOpen={open} onRoll={roll} />
  ) : showAction ? (
    <GameShellPendingRoll vm={vm} onCollapse={collapse} />
  ) : (
    <PendingRollWaitingOverlay vm={vm} onCollapse={collapse} />
  );

  return typeof document === "undefined" ? layer : createPortal(layer, document.body);
}
