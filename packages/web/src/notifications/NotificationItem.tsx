import { useState } from "react";
import { Link } from "react-router";
import type { AppNotification } from "../api/notificationApi";
import { friendApi, friendBadgeStore } from "../friends/friendStore";
import { relativeTime } from "../friends/PresenceLine";
import { useI18n } from "../i18n";
import { Avatar } from "../profile/Avatar";
import { publicProfilePath } from "../profile/ProfileOverview";
import { notificationStore } from "./notificationStore";

/** Accepts or declines a request right from the bell or a toast. */
function RequestAnswer({ requestId }: { requestId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const answer = async (accept: boolean) => {
    setBusy(true);
    try {
      await (accept ? friendApi.accept(requestId) : friendApi.deleteRequest(requestId));
    } catch {
      // Already answered or withdrawn elsewhere; the reload below shows what is true now.
      void notificationStore.getState().load();
    }
    notificationStore.getState().answered(requestId);
    void friendBadgeStore.getState().refresh();
  };
  return (
    <span className="notification-item__actions">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={busy}
        onClick={() => void answer(true)}
      >
        {t("friends.accept")}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() => void answer(false)}
      >
        {t("friends.decline")}
      </button>
    </span>
  );
}

export function NotificationItem({
  notification,
  fresh = false,
  onNavigate,
}: {
  notification: AppNotification;
  /** Unread when the bell was opened; marked with a gold dot. */
  fresh?: boolean;
  onNavigate?: () => void;
}) {
  const { t, language } = useI18n();
  const { player } = notification;
  const name = player.displayName || player.username;
  return (
    <div className="notification-item" data-fresh={fresh || undefined}>
      <Link
        className="notification-item__arch"
        to={publicProfilePath(player.username)}
        onClick={onNavigate}
        tabIndex={-1}
        aria-hidden="true"
      >
        <Avatar {...player} arch />
      </Link>
      <span className="notification-item__body">
        <span className="notification-item__text">
          <Link to={publicProfilePath(player.username)} onClick={onNavigate} dir="auto">
            {name}
          </Link>{" "}
          {t(
            notification.kind === "friendRequest"
              ? "notifications.friendRequest"
              : "notifications.friendAccepted",
          )}
        </span>
        <time className="notification-item__time" dateTime={notification.createdAt}>
          {relativeTime(notification.createdAt, language)}
        </time>
        {notification.requestId && <RequestAnswer requestId={notification.requestId} />}
      </span>
    </div>
  );
}
