import { useEffect } from "react";
import { useAuthStore } from "../auth/authStore";
import { friendBadgeStore } from "../friends/friendStore";
import { useI18n } from "../i18n";
import { useGameStore } from "../store";
import { TacticalIcon } from "../ui/TacticalIcon";
import { NotificationItem } from "./NotificationItem";
import { notificationStore, useNotifications } from "./notificationStore";
import { userEvents } from "./userEvents";
import { InviteItem } from "../invites/InviteItem";
import { inviteStore, useInvites } from "../invites/inviteStore";

const TOAST_MS = 8000;
/** Invites wait longer: they are the point of being online. They stay in the bell after. */
const INVITE_TOAST_MS = 30000;

const loadAll = () => {
  void notificationStore.getState().load();
  void inviteStore.getState().load();
};

/** A battle is on: toasts would cover the board, so news waits in the bell. */
const inBattle = () => {
  const game = useGameStore.getState();
  return game.joined && !!game.roomState && game.roomState.phase !== "lobby";
};

function Toast({ id }: { id: string }) {
  const { t } = useI18n();
  const notification = useNotifications((state) => state.toasts.find((item) => item.id === id));
  useEffect(() => {
    const timer = setTimeout(() => notificationStore.getState().dismiss(id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [id]);
  if (!notification) return null;
  const dismiss = () => notificationStore.getState().dismiss(id);
  return (
    <div className="notification-toast" data-testid="notification-toast">
      <NotificationItem notification={notification} onNavigate={dismiss} />
      <button
        type="button"
        className="notification-toast__close"
        aria-label={t("notifications.dismiss")}
        onClick={dismiss}
      >
        <TacticalIcon name="close" />
      </button>
    </div>
  );
}

function InviteToast({ id }: { id: string }) {
  const { t } = useI18n();
  const invite = useInvites((state) => state.incoming.find((item) => item.id === id));
  useEffect(() => {
    const timer = setTimeout(() => inviteStore.getState().dismiss(id), INVITE_TOAST_MS);
    return () => clearTimeout(timer);
  }, [id]);
  if (!invite) return null;
  const dismiss = () => inviteStore.getState().dismiss(id);
  return (
    <div className="notification-toast" data-testid="invite-toast">
      <InviteItem invite={invite} onDone={dismiss} />
      <button
        type="button"
        className="notification-toast__close"
        aria-label={t("notifications.dismiss")}
        onClick={dismiss}
      >
        <TacticalIcon name="close" />
      </button>
    </div>
  );
}

/**
 * Mounted once for the whole app: loads the bell for the signed-in player, applies what the
 * server pushes over the game socket and shows the toasts in the corner.
 */
export function NotificationSync() {
  const userId = useAuthStore((state) => (state.status === "authenticated" ? state.user?.id : undefined));
  const toasts = useNotifications((state) => state.toasts);
  const inviteToasts = useInvites((state) => state.toasts);
  const connection = useGameStore((state) => state.connectionStatus);
  useEffect(() => {
    if (userId) loadAll();
    else {
      notificationStore.getState().reset();
      inviteStore.getState().reset();
    }
  }, [userId]);
  // Pushes sent while the socket was down or the tab was away are not replayed; catch up.
  useEffect(() => {
    if (userId && connection === "connected") loadAll();
  }, [userId, connection]);
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    window.addEventListener("focus", loadAll);
    return () => window.removeEventListener("focus", loadAll);
  }, [userId]);
  useEffect(
    () =>
      userEvents.on((event) => {
        if (event.type === "notification") {
          notificationStore.getState().receive(event.notification, event.unread, !inBattle());
          void friendBadgeStore.getState().refresh();
        } else if (event.type === "invite") {
          inviteStore.getState().received(event.invite, !inBattle());
        } else if (event.type === "inviteGone") {
          inviteStore.getState().gone(event.inviteId);
        } else if (event.type === "friendsChanged") {
          void friendBadgeStore.getState().refresh();
          void notificationStore.getState().load();
        }
      }),
    [],
  );
  return (
    <div className="notification-toasts" role="status" aria-live="polite">
      {userId && inviteToasts.map((id) => <InviteToast key={id} id={id} />)}
      {userId && toasts.map((item) => <Toast key={item.id} id={item.id} />)}
    </div>
  );
}
