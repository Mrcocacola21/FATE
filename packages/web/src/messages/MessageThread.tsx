import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { DIRECT_MESSAGE_MAX_LENGTH, type Conversation, type DirectMessage } from "../api/messageApi";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import type { Language } from "../i18n/registry";
import { InviteButton } from "../invites/InviteButton";
import { Avatar } from "../profile/Avatar";
import { publicProfilePath } from "../profile/ProfileOverview";
import { TacticalIcon } from "../ui/TacticalIcon";
import { messageApi, messageStore, useMessages, watchThread } from "./messageStore";
import { ApiError } from "../api/client";
import { MoreMenu } from "../friends/PlayerRow";
import { friendApi, friendBadgeStore } from "../friends/friendStore";
import { ReportDialog } from "../moderation/ReportDialog";
import { MutedNotice, useActiveMute } from "../moderation/MutedNotice";

const ERRORS: Record<string, string> = {
  MESSAGE_EMPTY: "messages.errors.MESSAGE_EMPTY",
  MESSAGE_TOO_LONG: "messages.errors.MESSAGE_TOO_LONG",
  MESSAGE_NOT_ALLOWED: "messages.errors.MESSAGE_NOT_ALLOWED",
  MESSAGE_DUPLICATE: "messages.errors.MESSAGE_DUPLICATE",
  RATE_LIMITED: "messages.errors.RATE_LIMITED",
  CHAT_MUTED: "messages.errors.CHAT_MUTED",
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Today's messages show the time, older ones the date. */
export function messageTime(iso: string, language: Language, now = new Date()) {
  const date = new Date(iso);
  return sameDay(date, now)
    ? date.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(language, { day: "numeric", month: "short" });
}

const nameOf = (player: { username: string; displayName: string | null }) =>
  player.displayName || player.username;

/** Conversations, newest first, as rows that open a thread. */
export function ConversationList({
  conversations,
  selected,
  onSelect,
}: {
  conversations: Conversation[];
  selected?: string | null;
  onSelect(partnerId: string): void;
}) {
  const { t, language } = useI18n();
  const me = useAuthStore((state) => state.user?.id);
  return (
    <ul className="dm-conversations" aria-label={t("messages.title")}>
      {conversations.map((row) => (
        <li key={row.player.id}>
          <button
            type="button"
            className="dm-conversation"
            data-testid="dm-conversation"
            aria-current={selected === row.player.id || undefined}
            data-unread={row.unread > 0 || undefined}
            onClick={() => onSelect(row.player.id)}
          >
            <span className="dm-conversation__avatar" aria-hidden="true">
              <Avatar {...row.player} arch />
            </span>
            <span className="dm-conversation__body">
              <span className="dm-conversation__top">
                <strong dir="auto">{nameOf(row.player)}</strong>
                <time dateTime={row.lastMessage.sentAt}>{messageTime(row.lastMessage.sentAt, language)}</time>
              </span>
              <span className="dm-conversation__preview" dir="auto">
                {row.lastMessage.from === me && <span>{t("messages.you")}: </span>}
                {row.lastMessage.text}
              </span>
            </span>
            {row.unread > 0 && (
              <span className="nav-count" aria-label={t("messages.unread", { value: row.unread })}>
                {row.unread}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Bubble({
  message,
  own,
  read,
  onReport,
}: {
  message: DirectMessage;
  own: boolean;
  read: boolean;
  onReport?: () => void;
}) {
  const { t, language } = useI18n();
  return (
    <li className="dm-message" data-own={own || undefined} data-testid="dm-message">
      <div className="dm-message__row">
        <p className="dm-message__text" dir="auto">
          {message.text}
        </p>
        {onReport && (
          <span className="dm-message__menu">
            <MoreMenu items={[{ label: t("moderation.report"), danger: true, onSelect: onReport }]} />
          </span>
        )}
      </div>
      <span className="dm-message__meta">
        <time dateTime={message.sentAt}>{messageTime(message.sentAt, language)}</time>
        {read && <span> · {t("messages.read")}</span>}
      </span>
    </li>
  );
}

/** One conversation: header, messages oldest first, and the box to write in. */
export function MessageThread({
  partnerId,
  leading,
  trailing,
  compact = false,
}: {
  partnerId: string;
  /** Before the name, e.g. the dock's "back" button. */
  leading?: ReactNode;
  /** After the name, e.g. the dock's "minimize" button. */
  trailing?: ReactNode;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const me = useAuthStore((state) => state.user?.id);
  const thread = useMessages((state) => state.threads[partnerId]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<DirectMessage | null>(null);
  const mutedUntil = useActiveMute(useMessages((state) => state.mutedUntil));
  const list = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft("");
    setError(null);
    pinned.current = true;
    void messageStore.getState().openThread(partnerId);
    const unwatch = watchThread(partnerId);
    if (typeof window === "undefined") return unwatch;
    const read = () => {
      if (document.visibilityState === "visible") void messageStore.getState().markRead(partnerId);
    };
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      unwatch();
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [partnerId]);

  const messages = thread?.messages ?? [];
  const last = messages[messages.length - 1]?.id;
  // Stay at the newest message unless the player scrolled up to read older ones.
  useLayoutEffect(() => {
    const node = list.current;
    if (node && pinned.current) node.scrollTop = node.scrollHeight;
  }, [last, thread?.status]);

  const player = thread?.player;
  // "Read" goes under the player's latest message once the partner has read it.
  const lastOwn = [...messages].reverse().find((message) => message.from === me);
  const lastOwnRead = lastOwn?.readAt ? lastOwn.id : undefined;
  const length = [...draft.trim()].length;
  const tooLong = length > DIRECT_MESSAGE_MAX_LENGTH;

  const submit = async () => {
    const text = draft.trim();
    if (!text || tooLong || busy) return;
    setBusy(true);
    setError(null);
    const code = await messageStore.getState().send(partnerId, text);
    setBusy(false);
    if (code) setError(t(ERRORS[code] ?? "messages.errors.SEND_FAILED"));
    else {
      setDraft("");
      pinned.current = true;
      input.current?.focus();
    }
  };

  return (
    <section className="dm-thread" data-compact={compact || undefined} data-testid="dm-thread" aria-label={player ? nameOf(player) : t("messages.title")}>
      <header className="dm-thread__header">
        {leading}
        {player ? (
          <Link className="dm-thread__who" to={publicProfilePath(player.username)}>
            <span className="dm-thread__avatar" aria-hidden="true">
              <Avatar {...player} arch />
            </span>
            <span className="dm-thread__names">
              <strong dir="auto">{nameOf(player)}</strong>
              {!compact && <span dir="auto">@{player.username}</span>}
            </span>
          </Link>
        ) : (
          <span className="dm-thread__who" />
        )}
        {player && !compact && <InviteButton player={player} />}
        {player && (
          <MoreMenu
            items={[
              {
                label: t("friends.block"),
                danger: true,
                onSelect: () =>
                  void friendApi.block(partnerId).then(
                    () => {
                      void friendBadgeStore.getState().refresh();
                      void messageStore.getState().openThread(partnerId);
                      void messageStore.getState().loadConversations();
                    },
                    () => setError(t("friends.actionError")),
                  ),
              },
            ]}
          />
        )}
        {trailing}
      </header>
      {thread?.status === "error" && !messages.length ? (
        <p role="alert" className="dm-thread__notice">
          {t("messages.loadError")}
        </p>
      ) : !thread || (thread.status === "loading" && !messages.length) ? (
        <p role="status" className="dm-thread__notice">
          {t("profile.loading")}
        </p>
      ) : (
        <ol
          ref={list}
          className="dm-thread__list"
          aria-live="polite"
          onScroll={(event) => {
            const node = event.currentTarget;
            pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
          }}
        >
          {thread.hasMore && (
            <li className="dm-thread__older">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={thread.loadingOlder}
                onClick={() => {
                  pinned.current = false;
                  void messageStore.getState().loadOlder(partnerId);
                }}
              >
                {t("messages.older")}
              </button>
            </li>
          )}
          {!messages.length && <li className="dm-thread__empty">{t(thread.canSend ? "messages.startHint" : "messages.nothing")}</li>}
          {messages.map((message) => (
            <Bubble
              key={message.id}
              message={message}
              own={message.from === me}
              read={message.id === lastOwnRead}
              onReport={message.from === me ? undefined : () => setReporting(message)}
            />
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="dm-thread__error">
          {error}
        </p>
      )}
      {thread?.status === "ready" &&
        (thread.canSend && mutedUntil ? (
          <MutedNotice until={mutedUntil} className="dm-thread__readonly" />
        ) : thread.canSend ? (
          <form
            className="dm-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <label className="sr-only" htmlFor={`dm-input-${partnerId}${compact ? "-dock" : ""}`}>
              {t("messages.inputLabel")}
            </label>
            <textarea
              ref={input}
              id={`dm-input-${partnerId}${compact ? "-dock" : ""}`}
              className="field-control dm-composer__input"
              data-testid="dm-input"
              rows={compact ? 1 : 2}
              dir="auto"
              placeholder={t("messages.placeholder")}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            {length > DIRECT_MESSAGE_MAX_LENGTH - 200 && (
              <span className="dm-composer__counter" data-over={tooLong || undefined}>
                {t("messages.counter", { count: length, max: DIRECT_MESSAGE_MAX_LENGTH })}
              </span>
            )}
            <button
              type="submit"
              className="btn btn-primary btn-sm dm-composer__send"
              data-testid="dm-send"
              disabled={busy || !length || tooLong}
              aria-label={t("messages.send")}
            >
              <TacticalIcon name="send" />
            </button>
          </form>
        ) : (
          <p className="dm-thread__readonly">{t("messages.readOnly")}</p>
        ))}
      {reporting && player && (
        <ReportDialog
          author={nameOf(player)}
          text={reporting.text}
          onSubmit={(reason, comment) =>
            messageApi.report(partnerId, reporting.id, reason, comment.trim() || undefined).then(
              () => null,
              (failure: unknown) => (failure instanceof ApiError ? failure.code : "SERVER_ERROR"),
            )
          }
          onClose={() => setReporting(null)}
        />
      )}
    </section>
  );
}
