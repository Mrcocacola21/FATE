import { useEffect, useMemo } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { TacticalIcon } from "../ui/TacticalIcon";
import { ConversationList, MessageThread } from "./MessageThread";
import { conversationRows, messageStore, useMessages } from "./messageStore";

/** The «Messages» tab of the Friends page: conversations on the left, the open one on the right. */
export function MessagesTab({
  partnerId,
  onSelect,
}: {
  partnerId: string | null;
  onSelect(partnerId: string | null): void;
}) {
  const { t } = useI18n();
  const loaded = useMessages((state) => state.conversations);
  const friends = useMessages((state) => state.friends);
  const conversations = useMemo(() => conversationRows(loaded, friends), [loaded, friends]);
  const failed = useMessages((state) => state.conversationsError);
  useEffect(() => {
    void messageStore.getState().loadConversations();
    if (typeof window === "undefined") return;
    const reload = () => void messageStore.getState().loadConversations();
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);
  return (
    <div className="dm-page" data-open={partnerId ? true : undefined} data-testid="dm-page">
      <div className="dm-page__list">
        {failed && !conversations ? (
          <p role="alert" className="friends-message">
            {t("messages.loadError")}
          </p>
        ) : !conversations ? (
          <p role="status" className="friends-message">
            {t("profile.loading")}
          </p>
        ) : conversations.length === 0 ? (
          <p className="friends-message">
            {t("messages.noFriends")} <Link to="/friends?tab=find">{t("messages.findPlayers")}</Link>
          </p>
        ) : (
          <ConversationList conversations={conversations} selected={partnerId} onSelect={onSelect} />
        )}
        <p className="dm-page__hint">{t("messages.friendsOnly")}</p>
      </div>
      <div className="dm-page__thread">
        {partnerId ? (
          <MessageThread
            partnerId={partnerId}
            leading={
              <button
                type="button"
                className="btn btn-ghost btn-sm dm-page__back"
                aria-label={t("messages.back")}
                onClick={() => onSelect(null)}
              >
                <TacticalIcon name="back" />
              </button>
            }
          />
        ) : (
          <p className="dm-page__pick">
            {t("messages.pick")} <Link to="/friends">{t("messages.allFriends")}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
