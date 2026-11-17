import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useI18n } from "../i18n";
import { sendRoomChat, useGameStore } from "../store";
import { CHAT_MAX_LENGTH, QUICK_PHRASES, type ChatChannel, type ChatMessage } from "../ws";
import { roomChat, useRoomChat, visibleChatMessages } from "./chatStore";
import { useAuthStore } from "../auth/authStore";
import { MoreMenu } from "../friends/PlayerRow";
import { ReportDialog } from "../moderation/ReportDialog";
import { MutedNotice, useActiveMute } from "../moderation/MutedNotice";

function chatLength(text: string) {
  return [...text].length;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function ChatLine({
  message,
  timeFormat,
  onReport,
  onBlock,
}: {
  message: ChatMessage;
  timeFormat: Intl.DateTimeFormat;
  /** Offered on other players' messages to a signed-in reader. */
  onReport?: () => void;
  onBlock?: () => void;
}) {
  const { t } = useI18n();
  const menu = onReport ? (
    <span className="room-chat__menu">
      <MoreMenu
        items={[
          { label: t("moderation.report"), danger: true, onSelect: onReport },
          ...(onBlock ? [{ label: t("chat.block"), danger: true, onSelect: onBlock }] : []),
        ]}
      />
    </span>
  ) : null;
  const tone = message.sender.seat === "P1" ? "p1" : message.sender.seat === "P2" ? "p2" : "spectator";
  const time = timeFormat.format(new Date(message.sentAt));
  if (message.phrase) {
    return (
      <li className="room-chat__line room-chat__line--phrase" data-own={message.own || undefined}>
        <span className={`room-chat__name room-chat__name--${tone}`}>{message.sender.name}</span>
        {": "}
        <q>{t(`chat.phrases.${message.phrase}`)}</q>
        <time className="room-chat__time" dateTime={message.sentAt}>{time}</time>
        {menu}
      </li>
    );
  }
  return (
    <li className="room-chat__line" data-own={message.own || undefined}>
      <div className="room-chat__meta">
        <span className={`room-chat__name room-chat__name--${tone}`}>{message.sender.name}</span>
        {message.own ? <span className="room-chat__you">{t("chat.you")}</span> : null}
        <time className="room-chat__time" dateTime={message.sentAt}>{time}</time>
        {menu}
      </div>
      {/* Plain text: links and markup stay as typed and never become clickable. */}
      <p className="room-chat__text" dir="auto">{message.text}</p>
    </li>
  );
}

/** The room's chat: the players' channel, which spectators read, and the spectators' own. */
export function RoomChatPanel({ className = "" }: { className?: string }) {
  const { t, language } = useI18n();
  const chat = useRoomChat();
  const seat = useGameStore((state) => state.seat);
  const role = useGameStore((state) => state.role);
  const spectators = useGameStore((state) => state.roomMeta?.spectators ?? 0);
  const readable = chat.access.read;
  const [chosen, setChosen] = useState<ChatChannel>(role === "spectator" ? "spectators" : "match");
  const channel: ChatChannel = readable.includes(chosen) ? chosen : (readable[0] ?? "match");
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const mutedUntil = useActiveMute(chat.access.mutedUntil);
  const mayWrite = chat.access.write.includes(channel);
  const canWrite = mayWrite && !mutedUntil;
  const signedIn = useAuthStore((state) => state.status === "authenticated");
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const messages = useMemo(() => visibleChatMessages(chat, channel), [chat, channel]);
  const seatsTaken = useGameStore((state) => state.roomMeta?.players);
  const otherSeat = seat === "P1" ? "P2" : seat === "P2" ? "P1" : null;
  // Nothing to hide until someone sits opposite.
  const opponentSeat = otherSeat && seatsTaken?.[otherSeat] ? otherSeat : null;
  const opponentHidden = opponentSeat ? chat.hiddenSeats[opponentSeat] : false;
  const rejection = chat.rejection;
  const now = useNow(!!rejection?.retryUntil);
  const waitSeconds = rejection?.retryUntil ? Math.max(0, Math.ceil((rejection.retryUntil - now) / 1000)) : 0;
  const timeFormat = useMemo(
    () => new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }),
    [language],
  );

  // Mounted means read: the panel's messages do not count as unread while it is open.
  useEffect(() => {
    roomChat.setViewing(channel, true);
    return () => roomChat.setViewing(channel, false);
  }, [channel]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, channel]);

  useEffect(() => {
    if (rejection?.code === "CHAT_RATE_LIMITED" && rejection.retryUntil && waitSeconds === 0) roomChat.clearRejection();
  }, [rejection, waitSeconds]);

  if (!readable.length) return null;

  const length = chatLength(draft.trim());
  const tooLong = length > CHAT_MAX_LENGTH;
  const blockedByWait = waitSeconds > 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || tooLong || blockedByWait) return;
    if (!sendRoomChat({ type: "chatSend", channel, text })) {
      roomChat.rejected("CHAT_UNAVAILABLE");
      return;
    }
    setDraft("");
  };
  const sendPhrase = (phrase: (typeof QUICK_PHRASES)[number]) => {
    if (blockedByWait) return;
    if (!sendRoomChat({ type: "chatQuick", channel, phrase })) roomChat.rejected("CHAT_UNAVAILABLE");
  };

  const notice = rejection
    ? rejection.code === "CHAT_RATE_LIMITED"
      ? blockedByWait ? t("chat.errors.CHAT_RATE_LIMITED", { seconds: waitSeconds }) : null
      : t(`chat.errors.${rejection.code}`)
    : null;

  return (
    <section className={`room-chat ${className}`} aria-label={t("chat.title")} data-testid="room-chat">
      {readable.length > 1 ? (
        <div className="room-chat__channels" role="tablist" aria-label={t("chat.channelsLabel")}>
          {readable.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === channel}
              className="room-chat__channel"
              onClick={() => setChosen(item)}
              data-testid={`room-chat-channel-${item}`}
            >
              {item === "match" ? t("chat.channelMatch") : t("chat.channelSpectators", { value: spectators })}
              {item !== channel && chat.unread[item] > 0 ? (
                <span className="nav-count" aria-label={t("chat.unread", { value: chat.unread[item] })}>
                  {chat.unread[item]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="room-chat__header">
        <p className="room-chat__hint">
          {channel === "match" ? t("chat.matchHint") : t("chat.spectatorsHint")}
        </p>
        {opponentSeat && channel === "match" ? (
          <button
            type="button"
            className="room-chat__toggle"
            aria-pressed={opponentHidden}
            onClick={() => roomChat.setSeatHidden(opponentSeat, !opponentHidden)}
          >
            {opponentHidden ? t("chat.showOpponent") : t("chat.hideOpponent")}
          </button>
        ) : null}
      </div>

      <ol ref={listRef} className="room-chat__list scroll-panel" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? <li className="room-chat__empty">{t("chat.empty")}</li> : null}
        {messages.map((message) => (
          <ChatLine
            key={message.id}
            message={message}
            timeFormat={timeFormat}
            onReport={signedIn && !message.own ? () => setReporting(message) : undefined}
            onBlock={
              signedIn && !message.own
                ? () => {
                    if (!sendRoomChat({ type: "chatBlock", messageId: message.id })) roomChat.rejected("CHAT_UNAVAILABLE");
                  }
                : undefined
            }
          />
        ))}
      </ol>
      {opponentHidden && channel === "match" ? <p className="room-chat__notice">{t("chat.hiddenNotice")}</p> : null}
      {chat.blockedName ? (
        <p className="room-chat__notice" role="status" data-testid="room-chat-blocked">
          {t("chat.blockedNotice", { name: chat.blockedName })}{" "}
          <button type="button" className="room-chat__toggle" onClick={() => roomChat.clearBlocked()}>
            {t("chat.ok")}
          </button>
        </p>
      ) : null}

      {canWrite ? (
        <>
          <div className="room-chat__phrases" role="group" aria-label={t("chat.quickLabel")}>
            {QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                className="room-chat__phrase"
                disabled={blockedByWait}
                onClick={() => sendPhrase(phrase)}
              >
                {t(`chat.phrases.${phrase}`)}
              </button>
            ))}
          </div>
          <form className="room-chat__form" onSubmit={submit}>
            <label className="sr-only" htmlFor="room-chat-input">{t("chat.inputLabel")}</label>
            <input
              id="room-chat-input"
              className="room-chat__input"
              value={draft}
              dir="auto"
              autoComplete="off"
              placeholder={channel === "match" ? t("chat.placeholderMatch") : t("chat.placeholderSpectators")}
              onChange={(event) => {
                setDraft(event.target.value);
                if (rejection && rejection.code !== "CHAT_RATE_LIMITED") roomChat.clearRejection();
              }}
              aria-invalid={tooLong || undefined}
              aria-describedby="room-chat-counter"
              data-testid="room-chat-input"
            />
            <button
              type="submit"
              className="btn btn-primary room-chat__send"
              disabled={!draft.trim() || tooLong || blockedByWait}
              data-testid="room-chat-send"
            >
              {t("chat.send")}
            </button>
          </form>
          <div className="room-chat__footer">
            {notice ? <p className="room-chat__error" role="status">{notice}</p> : <span />}
            <span id="room-chat-counter" className="room-chat__counter" data-over={tooLong || undefined}>
              {t("chat.counter", { count: length, max: CHAT_MAX_LENGTH })}
            </span>
          </div>
        </>
      ) : mayWrite && mutedUntil ? (
        <MutedNotice until={mutedUntil} className="room-chat__notice" />
      ) : role === "spectator" && channel === "spectators" ? (
        <p className="room-chat__notice room-chat__notice--action">
          <Link to="/login">{t("chat.signIn")}</Link>
          {" — "}
          {t("chat.signInToWrite")}
        </p>
      ) : (
        <p className="room-chat__notice">{t("chat.readOnly")}</p>
      )}
      {reporting ? (
        <ReportDialog
          author={reporting.sender.name}
          text={reporting.text ?? t(`chat.phrases.${reporting.phrase}`)}
          onSubmit={(reason, comment) => roomChat.report(sendRoomChat, reporting.id, reason, comment)}
          onClose={() => setReporting(null)}
        />
      ) : null}
    </section>
  );
}
