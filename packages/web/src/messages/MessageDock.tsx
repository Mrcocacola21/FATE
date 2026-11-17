import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { useGameStore } from "../store";
import { TacticalIcon } from "../ui/TacticalIcon";
import { ConversationList, MessageThread } from "./MessageThread";
import { messageStore, useMessages } from "./messageStore";

/** Keeps the unread count fresh: on sign-in, on reconnect and when the tab comes back. */
function useUnreadSync(userId: string | undefined) {
  const connection = useGameStore((state) => state.connectionStatus);
  useEffect(() => {
    if (userId && connection === "connected") void messageStore.getState().loadUnread();
  }, [userId, connection]);
  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const refresh = () => {
      void messageStore.getState().loadUnread();
      if (messageStore.getState().conversations) void messageStore.getState().loadConversations();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [userId]);
}

function DockList({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  const conversations = useMessages((state) => state.conversations);
  const failed = useMessages((state) => state.conversationsError);
  useEffect(() => {
    void messageStore.getState().loadConversations();
  }, []);
  return (
    <section className="dm-dock__panel" aria-label={t("messages.title")} data-testid="dm-dock-list">
      <header className="dm-dock__head">
        <h2>{t("messages.title")}</h2>
        <Link to="/friends" className="dm-dock__link" onClick={onClose}>
          {t("messages.allFriendsLink")}
        </Link>
        <button type="button" className="btn btn-ghost btn-sm" aria-label={t("messages.minimize")} onClick={onClose}>
          <TacticalIcon name="minimize" />
        </button>
      </header>
      <div className="dm-dock__scroll">
        {failed && !conversations ? (
          <p role="alert" className="dm-dock__notice">
            {t("messages.loadError")}
          </p>
        ) : !conversations ? (
          <p role="status" className="dm-dock__notice">
            {t("profile.loading")}
          </p>
        ) : conversations.length === 0 ? (
          <p className="dm-dock__notice">{t("messages.empty")}</p>
        ) : (
          <ConversationList
            conversations={conversations}
            onSelect={(partnerId) => messageStore.getState().setDock({ partnerId })}
          />
        )}
      </div>
      <p className="dm-dock__foot">{t("messages.friendsOnly")}</p>
    </section>
  );
}

/**
 * The mini-chat in the bottom corner, on every signed-in page outside a battle: a pill with the
 * unread count that opens the conversation list, then one conversation.
 */
export function MessageDock() {
  const { t } = useI18n();
  const { pathname, search } = useLocation();
  const userId = useAuthStore((state) => (state.status === "authenticated" ? state.user?.id : undefined));
  const unread = useMessages((state) => state.unread);
  const dock = useMessages((state) => state.dock);
  const inBattle = useGameStore((state) => state.joined && !!state.roomState && state.roomState.phase !== "lobby");
  useUnreadSync(userId);
  // The Friends page's own messages tab already shows all of this.
  const onMessagesTab = pathname.replace(/\/$/, "") === "/friends" && new URLSearchParams(search).get("tab") === "messages";
  const authPage = ["/login", "/register"].includes(pathname.replace(/\/$/, ""));
  useEffect(() => {
    if (!dock.open || typeof document === "undefined") return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") messageStore.getState().setDock({ open: false });
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [dock.open]);
  if (!userId || inBattle || onMessagesTab || authPage) return null;
  const minimize = () => messageStore.getState().setDock({ open: false });
  return (
    <div className="dm-dock" data-open={dock.open || undefined} data-testid="dm-dock">
      {dock.open &&
        (dock.partnerId ? (
          <div className="dm-dock__panel dm-dock__panel--thread">
            <MessageThread
              compact
              partnerId={dock.partnerId}
              leading={
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-label={t("messages.back")}
                  onClick={() => messageStore.getState().setDock({ partnerId: null })}
                >
                  <TacticalIcon name="back" />
                </button>
              }
              trailing={
                <button type="button" className="btn btn-ghost btn-sm" aria-label={t("messages.minimize")} onClick={minimize}>
                  <TacticalIcon name="minimize" />
                </button>
              }
            />
          </div>
        ) : (
          <DockList onClose={minimize} />
        ))}
      {!dock.open && (
        <button
          type="button"
          className="dm-dock__pill"
          data-testid="dm-dock-pill"
          aria-expanded={false}
          onClick={() => messageStore.getState().setDock({ open: true })}
        >
          <TacticalIcon name="chat" />
          <span>{t("messages.title")}</span>
          {unread > 0 && (
            <span className="nav-count" aria-label={t("messages.unread", { value: unread })}>
              {unread}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
