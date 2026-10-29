import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { authClient, authStore } from "../auth/authStore";
import { createNotificationApi, type AppNotification } from "../api/notificationApi";

export const notificationApi = createNotificationApi(authClient);

const LIMIT = 30;
const MAX_TOASTS = 3;

interface NotificationState {
  /** The account the list belongs to; a different sign-in starts over. */
  owner: string | null;
  items: AppNotification[];
  unread: number;
  status: "idle" | "loading" | "ready" | "error";
  toasts: AppNotification[];
  load(): Promise<void>;
  /** A pushed notification; `toast` is false while a battle is on, so it only waits in the bell. */
  receive(notification: AppNotification, unread: number, toast: boolean): void;
  markAllRead(): Promise<void>;
  /** The request was accepted or declined from the bell or a toast. */
  answered(requestId: string): void;
  dismiss(id: string): void;
  reset(): void;
}

const signedInUser = () => {
  const state = authStore.getState();
  return state.status === "authenticated" ? (state.user?.id ?? null) : null;
};

export const notificationStore = createStore<NotificationState>()((set, get) => ({
  owner: null,
  items: [],
  unread: 0,
  status: "idle",
  toasts: [],
  load: async () => {
    const owner = signedInUser();
    if (!owner) return get().reset();
    if (get().owner !== owner) set({ owner, items: [], unread: 0, toasts: [] });
    set((state) => ({ status: state.status === "ready" ? "ready" : "loading" }));
    try {
      const { notifications, unread } = await notificationApi.list();
      if (signedInUser() === owner) set({ items: notifications, unread, status: "ready" });
    } catch {
      if (signedInUser() === owner)
        set((state) => ({ status: state.status === "ready" ? "ready" : "error" }));
    }
  },
  receive: (notification, unread, toast) => {
    if (get().owner !== signedInUser()) return;
    set((state) => ({
      items: [notification, ...state.items.filter((item) => item.id !== notification.id)].slice(
        0,
        LIMIT,
      ),
      unread,
      toasts: toast
        ? [notification, ...state.toasts.filter((item) => item.id !== notification.id)].slice(
            0,
            MAX_TOASTS,
          )
        : state.toasts,
    }));
  },
  markAllRead: async () => {
    if (!get().unread) return;
    set((state) => ({ unread: 0, items: state.items.map((item) => ({ ...item, read: true })) }));
    try {
      await notificationApi.markAllRead();
    } catch {
      /* The next load shows them unread again; nothing is lost. */
    }
  },
  answered: (requestId) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.requestId === requestId ? { ...item, requestId: null } : item,
      ),
      toasts: state.toasts.filter((item) => item.requestId !== requestId),
    })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
  reset: () => set({ owner: null, items: [], unread: 0, status: "idle", toasts: [] }),
}));

export function useNotifications<T>(select: (state: NotificationState) => T) {
  return useStore(notificationStore, select);
}
