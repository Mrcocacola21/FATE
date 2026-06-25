import type { GameAction, PendingRoll } from "rules";
import type { TestRoomCommand } from "./types";
import { useI18n } from "../i18n";

export function PendingRollDebugPanel({
  pendingRoll,
  send,
  sendAction,
}: {
  pendingRoll: PendingRoll | null;
  send: (command: TestRoomCommand) => void;
  sendAction: (action: GameAction) => void;
}) {
  const { t } = useI18n();
  if (!pendingRoll) {
    return <div className="text-sm text-slate-500">{t("testRoom.noPendingRoll")}</div>;
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-slate-950 p-3 font-mono text-xs text-slate-100">
        <div>{pendingRoll.id}</div>
        <div>{pendingRoll.kind} · {pendingRoll.player}</div>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
          {JSON.stringify(pendingRoll.context, null, 2)}
        </pre>
      </div>
      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() =>
          sendAction({
            type: "resolvePendingRoll",
            pendingRollId: pendingRoll.id,
            player: pendingRoll.player,
          })
        }
      >
        {t("testRoom.resolvePending")}
      </button>
      <button
        type="button"
        className="btn btn-warning w-full"
        onClick={() => {
          if (window.confirm(t("testRoom.clearPendingConfirm"))) {
            send({ type: "debugClearPendingRoll" });
          }
        }}
      >
        {t("testRoom.clearPending")}
      </button>
    </div>
  );
}
