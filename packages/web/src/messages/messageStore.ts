import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { ApiError } from "../api/client";
import type { Friend, Player } from "../api/friendApi";
import { friendApi } from "../friends/friendStore";
import {
  createMessageApi,
  type Conversation,
  type DirectMessage,
} from "../api/messageApi";
import type { UserEvent } from "../api/notificationApi";
import { authClient, authStore } from "../auth/authStore";
import { userEvents } from "../notifications/userEvents";

export const messageApi = createMessageApi(authClient);

export interface Thread {
  player: Player | null;
  /** Oldest first. */
  messages: DirectMessage[];
  hasMore: boolean;
  canSend: boolean;
  status: "loading" | "ready" | "error";
  loadingOlder: boolean;
}

interface MessageState {
  /** The account everything below belongs to; a different sign-in starts over. */
  owner: string | null;
  unread: number;
  conversations: Conversation[] | null;
  conversationsError: boolean;
  /** Friends, so each one has a conversation to open even before the first message. */
  friends: Friend[] | null;
  threads: Record<string, Thread>;
  /** A moderator's restriction on this player's messages, as last heard. */
  mutedUntil: string | null;
  /** The floating mini-chat: closed, the conversation list, or one conversation. */
  dock: { open: boolean; partnerId: string | null };
  loadUnread(): Promise<void>;
  loadConversations(): Promise<void>;
  openThread(partnerId: string): Promise<void>;
  loadOlder(partnerId: string): Promise<void>;
  /** Resolves to an error code when the server refused the message. */
  send(partnerId: string, text: string): Promise<string | null>;
  markRead(partnerId: string): Promise<void>;
  receive(event: UserEvent): void;
  setDock(dock: Partial<MessageState["dock"]>): void;
  reset(): void;
}

const signedInUser = () => {
  const state = authStore.getState();
  return state.status === "authenticated" ? (state.user?.id ?? null) : null;
};

const emptyThread: Thread = {
  player: null,
  messages: [],
  hasMore: false,
  canSend: false,
  status: "loading",
  loadingOlder: false,
};

/** Threads on screen: a new message there is read at once instead of counted. */
const watched = new Map<string, number>();
export function watchThread(partnerId: string) {
  watched.set(partnerId, (watched.get(partnerId) ?? 0) + 1);
  return () => {
    const left = (watched.get(partnerId) ?? 1) - 1;
    if (left > 0) watched.set(partnerId, left);
    else watched.delete(partnerId);
  };
}
const onScreen = (partnerId: string) =>
  watched.has(partnerId) && (typeof document === "undefined" || document.visibilityState === "visible");

const merge = (messages: DirectMessage[], added: DirectMessage[]) => {
  const byId = new Map(messages.map((message) => [message.id, message]));
  for (const message of added) byId.set(message.id, message);
  return [...byId.values()].sort(
    (a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
  );
};

const initial = {
  owner: null,
  unread: 0,
  conversations: null,
  conversationsError: false,
  friends: null,
  mutedUntil: null,
  threads: {},
  dock: { open: false, partnerId: null },
};

export const messageStore = createStore<MessageState>()((set, get) => {
  /** Runs only while the same account is signed in; a stale answer is dropped. */
  const claim = () => {
    const owner = signedInUser();
    if (!owner) {
      get().reset();
      return null;
    }
    if (get().owner !== owner) set({ ...initial, owner });
    return owner;
  };
  const current = (owner: string) => signedInUser() === owner && get().owner === owner;
  const patchThread = (partnerId: string, change: (thread: Thread) => Partial<Thread>) =>
    set((state) => {
      const thread = state.threads[partnerId];
      return thread ? { threads: { ...state.threads, [partnerId]: { ...thread, ...change(thread) } } } : {};
    });
  const patchConversation = (partnerId: string, change: (row: Conversation) => Partial<Conversation>) =>
    set((state) => ({
      conversations:
        state.conversations?.map((row) =>
          row.player.id === partnerId ? { ...row, ...change(row) } : row,
        ) ?? null,
    }));

  return {
    ...initial,
    loadUnread: async () => {
      const owner = claim();
      if (!owner) return;
      try {
        const unread = await messageApi.unread();
        if (current(owner)) set({ unread });
      } catch {
        /* The badge is a hint; a failed read keeps the last value. */
      }
    },
    loadConversations: async () => {
      const owner = claim();
      if (!owner) return;
      try {
        const [list, friends] = await Promise.all([
          messageApi.conversations(),
          // Without the friends list the conversations still show.
          friendApi.friends().catch(() => null),
        ]);
        if (current(owner))
          set((state) => ({
            conversations: list.conversations,
            unread: list.unread,
            conversationsError: false,
            friends: friends ?? state.friends,
          }));
      } catch {
        if (current(owner)) set({ conversationsError: true });
      }
    },
    openThread: async (partnerId) => {
      const owner = claim();
      if (!owner) return;
      const existing = get().threads[partnerId];
      set((state) => ({
        threads: {
          ...state.threads,
          [partnerId]: existing ? { ...existing, status: existing.status === "error" ? "loading" : existing.status } : emptyThread,
        },
      }));
      try {
        const page = await messageApi.history(partnerId);
        if (!current(owner)) return;
        set((state) => {
          const held = state.threads[partnerId];
          return {
            threads: {
              ...state.threads,
              [partnerId]: {
                player: page.player,
                // A refresh keeps older pages already shown and anything pushed meanwhile; an
                // empty answer means a block now hides the conversation, so drop what is held.
                messages: page.messages.length ? merge(held?.messages ?? [], page.messages) : [],
                hasMore: held && held.messages.length > page.messages.length ? held.hasMore : page.hasMore,
                canSend: page.canSend,
                status: "ready",
                loadingOlder: false,
              },
            },
          };
        });
        patchConversation(partnerId, () => ({ canSend: page.canSend, player: page.player }));
        set({ mutedUntil: page.mutedUntil });
        if (onScreen(partnerId)) void get().markRead(partnerId);
      } catch {
        if (current(owner)) patchThread(partnerId, (thread) => ({ status: thread.status === "ready" ? "ready" : "error" }));
      }
    },
    loadOlder: async (partnerId) => {
      const owner = claim();
      const thread = get().threads[partnerId];
      if (!owner || !thread?.hasMore || thread.loadingOlder || !thread.messages.length) return;
      patchThread(partnerId, () => ({ loadingOlder: true }));
      try {
        const page = await messageApi.history(partnerId, thread.messages[0].id);
        if (current(owner))
          patchThread(partnerId, (held) => ({
            messages: merge(held.messages, page.messages),
            hasMore: page.hasMore,
            loadingOlder: false,
          }));
      } catch {
        if (current(owner)) patchThread(partnerId, () => ({ loadingOlder: false }));
      }
    },
    send: async (partnerId, text) => {
      const owner = claim();
      if (!owner) return "UNAUTHORIZED";
      try {
        const message = await messageApi.send(partnerId, text);
        if (current(owner)) get().receive({ type: "directMessage", message });
        return null;
      } catch (error) {
        const code = error instanceof ApiError ? error.code : "SERVER_ERROR";
        if (code === "CHAT_MUTED" && current(owner) && error instanceof ApiError) {
          const until = error.details?.until;
          if (typeof until === "string") set({ mutedUntil: until });
        }
        if (code === "MESSAGE_NOT_ALLOWED" && current(owner)) {
          patchThread(partnerId, () => ({ canSend: false }));
          patchConversation(partnerId, () => ({ canSend: false }));
        }
        return code;
      }
    },
    markRead: async (partnerId) => {
      const owner = claim();
      if (!owner) return;
      const thread = get().threads[partnerId];
      const row = get().conversations?.find((item) => item.player.id === partnerId);
      const pending =
        (row?.unread ?? 0) > 0 ||
        !!thread?.messages.some((message) => message.from === partnerId && !message.readAt);
      if (!pending) return;
      patchConversation(partnerId, () => ({ unread: 0 }));
      try {
        const unread = await messageApi.markRead(partnerId);
        if (current(owner)) set({ unread });
      } catch {
        /* Still unread on the server; the next load shows it again. */
      }
    },
    receive: (event) => {
      const owner = get().owner ?? claim();
      if (!owner || signedInUser() !== owner) return;
      if (event.type === "directMessage") {
        const { message } = event;
        const partnerId = message.from === owner ? message.to : message.from;
        const incoming = message.from !== owner;
        const known =
          get().threads[partnerId]?.messages.some((item) => item.id === message.id) ||
          get().conversations?.some((item) => item.lastMessage.id === message.id);
        patchThread(partnerId, (thread) => ({ messages: merge(thread.messages, [message]) }));
        set((state) => {
          const conversations = state.conversations;
          if (!conversations) return {};
          const row = conversations.find((item) => item.player.id === partnerId);
          const player = row?.player ?? state.threads[partnerId]?.player;
          if (!player) return {};
          const updated: Conversation = {
            player,
            lastMessage: message,
            unread: (row?.unread ?? 0) + (incoming && !known ? 1 : 0),
            canSend: row?.canSend ?? true,
          };
          return {
            conversations: [updated, ...conversations.filter((item) => item.player.id !== partnerId)],
          };
        });
        if (event.unread !== undefined) set({ unread: event.unread });
        // A first message from someone with no row yet: the list needs their profile.
        if (incoming && !get().conversations?.some((item) => item.player.id === partnerId) && get().conversations)
          void get().loadConversations();
        if (incoming && onScreen(partnerId)) void get().markRead(partnerId);
        return;
      }
      if (event.type === "directMessagesRead") {
        if (event.readerId === owner) {
          // This account read it, here or in another tab.
          patchConversation(event.partnerId, () => ({ unread: 0 }));
          patchThread(event.partnerId, (thread) => ({
            messages: thread.messages.map((item) =>
              item.from === event.partnerId && !item.readAt ? { ...item, readAt: event.readAt } : item,
            ),
          }));
          if (event.unread !== undefined) set({ unread: event.unread });
        } else {
          // The partner read what this account sent.
          const partnerId = event.readerId;
          const read = (item: DirectMessage) =>
            item.to === partnerId && !item.readAt && item.sentAt <= event.readAt
              ? { ...item, readAt: event.readAt }
              : item;
          patchThread(partnerId, (thread) => ({ messages: thread.messages.map(read) }));
          patchConversation(partnerId, (row) => ({ lastMessage: read(row.lastMessage) }));
        }
        return;
      }
      if (event.type === "chatMuted") {
        set({ mutedUntil: event.until });
        return;
      }
      if (event.type === "friendsChanged") {
        // Friendship or a block changed who can write; refresh what is held.
        if (get().conversations) void get().loadConversations();
        for (const partnerId of Object.keys(get().threads)) void get().openThread(partnerId);
        void get().loadUnread();
      }
    },
    setDock: (dock) => set((state) => ({ dock: { ...state.dock, ...dock } })),
    reset: () => set({ ...initial }),
  };
});

userEvents.on((event) => messageStore.getState().receive(event));

authStore.subscribe((state, previous) => {
  if (state.user?.id === previous.user?.id && state.status === previous.status) return;
  messageStore.getState().reset();
  if (state.status === "authenticated") void messageStore.getState().loadUnread();
});

export const useMessages = <T>(select: (state: MessageState) => T) => useStore(messageStore, select);
export const useUnreadMessages = () => useMessages((state) => state.unread);

/** A row of the conversation list: a real conversation, or a friend not written to yet. */
export interface ConversationRow {
  player: Player;
  lastMessage: DirectMessage | null;
  unread: number;
}

const PRESENCE_ORDER = { online: 0, lobby: 1, battle: 2, offline: 3 } as const;

/** Conversations newest first, then every other friend: those online first, then by name. */
export function conversationRows(
  conversations: Conversation[] | null,
  friends: Friend[] | null,
): ConversationRow[] | null {
  if (!conversations) return null;
  const talked = new Set(conversations.map((row) => row.player.id));
  const name = (player: Player) => (player.displayName || player.username).toLocaleLowerCase();
  const quiet = (friends ?? [])
    .filter((friend) => !talked.has(friend.player.id))
    .sort(
      (a, b) =>
        PRESENCE_ORDER[a.presence.state] - PRESENCE_ORDER[b.presence.state] ||
        name(a.player).localeCompare(name(b.player)),
    )
    .map((friend) => ({ player: friend.player, lastMessage: null, unread: 0 }));
  return [...conversations, ...quiet];
}
