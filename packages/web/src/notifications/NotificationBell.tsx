import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { TacticalIcon } from "../ui/TacticalIcon";
import { NotificationItem } from "./NotificationItem";
import { notificationStore, useNotifications } from "./notificationStore";
import { InviteItem } from "../invites/InviteItem";
import { useInvites } from "../invites/inviteStore";

/**
 * The bell: a count of unread notifications and, when opened, the latest ones. Opening marks
 * them read; the ones that were new keep a gold dot until the panel closes.
 */
export function NotificationBell({ align = "start" }: { align?: "start" | "end" }) {
  const { t } = useI18n();
  const signedIn = useAuthStore((state) => state.status === "authenticated");
  const unread = useNotifications((state) => state.unread);
  const items = useNotifications((state) => state.items);
  const status = useNotifications((state) => state.status);
  const invites = useInvites((state) => state.incoming);
  // Open invites count too: they are waiting for an answer, read or not.
  const count = unread + invites.length;
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        button.current?.focus();
      } else if (root.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  // Whatever arrives while the panel is open is seen at once.
  useEffect(() => {
    if (!open) return;
    setFresh((current) => {
      const next = new Set(current);
      for (const item of items) if (!item.read) next.add(item.id);
      return next;
    });
    if (unread) void notificationStore.getState().markAllRead();
  }, [open, items, unread]);

  if (!signedIn) return null;
  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setFresh(new Set());
    setOpen(true);
    // Once loaded, pushes keep the list current; a re-read here would race the "read" mark.
    if (notificationStore.getState().status !== "ready") void notificationStore.getState().load();
  };
  const close = () => setOpen(false);
  return (
    <div className="notification-bell" ref={root}>
      <button
        ref={button}
        type="button"
        className="notification-bell__button"
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={
          count ? t("notifications.titleUnread", { value: count }) : t("notifications.title")
        }
        data-testid="notification-bell"
        onClick={toggle}
      >
        <TacticalIcon name="bell" />
        {count > 0 && (
          <span className="nav-count notification-bell__count" aria-hidden="true">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {open && (
        <section
          id="notification-panel"
          className="notification-panel"
          data-align={align}
          aria-labelledby="notification-panel-title"
        >
          <header className="notification-panel__head">
            <h2 id="notification-panel-title">{t("notifications.title")}</h2>
            <Link to="/friends?tab=requests" className="notification-panel__more" onClick={close}>
              {t("notifications.allRequests")}
            </Link>
          </header>
          {invites.length > 0 && (
            <ul
              className="notification-panel__list notification-panel__invites"
              aria-label={t("invites.title")}
            >
              {invites.map((invite) => (
                <li key={invite.id}>
                  <InviteItem invite={invite} onDone={close} />
                </li>
              ))}
            </ul>
          )}
          {status === "error" && !items.length ? (
            <p role="alert" className="notification-panel__message">
              {t("notifications.loadError")}
            </p>
          ) : status === "loading" && !items.length ? (
            <p role="status" className="notification-panel__message">
              {t("profile.loading")}
            </p>
          ) : !items.length ? (
            !invites.length && (
              <p className="notification-panel__message">{t("notifications.empty")}</p>
            )
          ) : (
            <ul className="notification-panel__list">
              {items.map((item) => (
                <li key={item.id}>
                  <NotificationItem notification={item} fresh={fresh.has(item.id)} onNavigate={close} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
