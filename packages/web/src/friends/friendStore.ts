import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { authStore, authClient } from "../auth/authStore";
import { createFriendApi } from "../api/friendApi";

export const friendApi = createFriendApi(authClient);

interface FriendBadgeState {
  /** Pending requests addressed to the signed-in player; drives the sidebar badge. */
  incoming: number;
  refresh(): Promise<void>;
}

/** Re-read after every action that can change it; the notification channel will push it later. */
export const friendBadgeStore = createStore<FriendBadgeState>()((set) => ({
  incoming: 0,
  refresh: async () => {
    const owner = authStore.getState().user?.id;
    if (!owner || authStore.getState().status !== "authenticated") {
      set({ incoming: 0 });
      return;
    }
    try {
      const incoming = await friendApi.incomingCount();
      if (authStore.getState().user?.id === owner) set({ incoming });
    } catch {
      /* The badge is a hint; a failed read keeps the last value. */
    }
  },
}));

authStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.status !== previous.status)
    void friendBadgeStore.getState().refresh();
});

export const useFriendBadge = () => useStore(friendBadgeStore, (state) => state.incoming);
