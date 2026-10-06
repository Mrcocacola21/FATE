import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { GameAction, PendingRollContext, RollKind } from "rules";
import { useI18n } from "../../../i18n";
import {
  canResolvePendingRollDirectly,
  FALLBACK_PENDING_ROLL_CONTEXT,
  pendingRollTitle,
} from "../../pendingRollPresentation";
import { GameShellPendingRoll } from "./GameShellPendingRoll";
import { OpponentDecisionStatus } from "./OpponentDecisionStatus";

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

export function GlobalPendingTaskLayer({ vm }: { vm: GameShellViewModel }) {
  const decision = vm.view?.pendingDecision;
  const showWaiting =
    decision?.viewerCanRespond === false ||
    (!decision &&
      !!vm.pendingMeta &&
      vm.pendingMeta.player !== vm.playerId &&
      !vm.canControlTestRoom);
  const showAction = !showWaiting && !!vm.pendingRoll && !!vm.playerId && !vm.boardSelectionPending;
  const active = showAction;
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

  if (showWaiting) {
    const layer = (
      <OpponentDecisionStatus
        presentation={decision?.viewerCanRespond === false ? decision.opponentStatus : undefined}
        attemptedAction={
          vm.clientLog?.[vm.clientLog.length - 1] ===
          "Waiting for your opponent to finish their decision."
        }
      />
    );
    return typeof document === "undefined" ? layer : createPortal(layer, document.body);
  }
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
          pendingRollId: vm.pendingRoll!.id,
        } as GameAction)
    : undefined;

  const layer = collapsed ? (
    <CollapsedPendingRollChip pending={pending} active={showAction} onOpen={open} onRoll={roll} />
  ) : (
    <GameShellPendingRoll vm={vm} onCollapse={collapse} />
  );

  return typeof document === "undefined" ? layer : createPortal(layer, document.body);
}
