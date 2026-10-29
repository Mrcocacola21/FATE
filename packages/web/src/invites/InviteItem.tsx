import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { LobbyInvite } from "../api/inviteApi";
import { useI18n } from "../i18n";
import { getGameModeName, isGameModeId } from "../modes/modeLabels";
import { Avatar } from "../profile/Avatar";
import { publicProfilePath } from "../profile/ProfileOverview";
import { inviteStore, joinInvite } from "./inviteStore";

/** Seconds left, ticking once a second while shown. */
const secondsUntil = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));

function useSecondsLeft(expiresAt: string) {
  const [seconds, setSeconds] = useState(() => secondsUntil(expiresAt));
  useEffect(() => {
    setSeconds(secondsUntil(expiresAt));
    const timer = setInterval(() => setSeconds(secondsUntil(expiresAt)), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return seconds;
}

/** An incoming lobby invite: who, which lobby, time left, "Join lobby" and "Decline". */
export function InviteItem({ invite, onDone }: { invite: LobbyInvite; onDone?: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const seconds = useSecondsLeft(invite.expiresAt);
  const name = invite.from.displayName || invite.from.username;
  const mode = isGameModeId(invite.gameMode) ? getGameModeName(invite.gameMode, t) : invite.gameMode;
  return (
    <div className="notification-item" data-invite>
      <Link
        className="notification-item__arch"
        to={publicProfilePath(invite.from.username)}
        onClick={onDone}
        tabIndex={-1}
        aria-hidden="true"
      >
        <Avatar {...invite.from} arch />
      </Link>
      <span className="notification-item__body">
        <span className="notification-item__text">
          <Link to={publicProfilePath(invite.from.username)} onClick={onDone} dir="auto">
            {name}
          </Link>{" "}
          {invite.lobbyName
            ? t("invites.invitesYouNamed", { name: invite.lobbyName })
            : t("invites.invitesYou")}
        </span>
        <span className="notification-item__time">
          {mode} ·{" "}
          {t("invites.expiresIn", {
            value: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
          })}
        </span>
        <span className="notification-item__actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={seconds === 0}
            onClick={() => {
              onDone?.();
              joinInvite(invite, navigate, t("errors.joinRoom"));
            }}
          >
            {t("invites.join")}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onDone?.();
              void inviteStore.getState().remove(invite.id);
            }}
          >
            {t("friends.decline")}
          </button>
        </span>
      </span>
    </div>
  );
}
