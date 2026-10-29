import { useState } from "react";
import { ApiError } from "../api/client";
import type { Player } from "../api/friendApi";
import { useI18n } from "../i18n";
import { inviteStore, useInvitableRoom, useInvites } from "./inviteStore";

const errorKeys: Record<string, string> = {
  INVITE_NOT_ALLOWED: "invites.notAllowed",
  RATE_LIMITED: "invites.rateLimited",
  LOBBY_NOT_INVITABLE: "invites.lobbyClosed",
};

/**
 * "Invite to lobby" for one player, shown only while this player sits in a lobby with a free
 * seat. Once sent it turns into "Invited", which withdraws the invite on click.
 */
export function InviteButton({ player, className = "btn-sm" }: { player: Player; className?: string }) {
  const { t } = useI18n();
  const roomId = useInvitableRoom();
  const pending = useInvites((state) =>
    state.outgoing.find((invite) => invite.roomId === roomId && invite.to.id === player.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!roomId) return null;
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : "";
      setError(t(errorKeys[code] ?? "invites.sendError"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="invite-button">
      {pending ? (
        <button
          type="button"
          className={`btn btn-ghost ${className}`}
          disabled={busy}
          aria-label={t("invites.withdraw", { name: player.displayName || player.username })}
          onClick={() => void run(() => inviteStore.getState().remove(pending.id))}
        >
          {t("invites.invited")}
        </button>
      ) : (
        <button
          type="button"
          className={`btn btn-secondary ${className}`}
          disabled={busy}
          onClick={() => void run(() => inviteStore.getState().send(roomId, player.id))}
        >
          {t("invites.invite")}
        </button>
      )}
      {error && (
        <span role="alert" className="invite-button__error">
          {error}
        </span>
      )}
    </span>
  );
}
