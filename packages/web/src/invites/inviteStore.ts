import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { authClient, authStore } from "../auth/authStore";
import { createInviteApi, type LobbyInvite } from "../api/inviteApi";
import { useGameStore } from "../store";

export const inviteApi = createInviteApi(authClient);

const MAX_TOASTS = 3;

interface InviteState {
  owner: string | null;
  incoming: LobbyInvite[];
  outgoing: LobbyInvite[];
  /** Incoming invites shown as toasts right now. */
  toasts: string[];
  load(): Promise<void>;
  /** A pushed invite; `toast` is false while a battle is on, so it only waits in the bell. */
  received(invite: LobbyInvite, toast: boolean): void;
  gone(inviteId: string): void;
  send(roomId: string, userId: string): Promise<LobbyInvite>;
  /** Declines an incoming invite or withdraws one this player sent. */
  remove(inviteId: string): Promise<void>;
  dismiss(inviteId: string): void;
  reset(): void;
}

const signedInUser = () => {
  const state = authStore.getState();
  return state.status === "authenticated" ? (state.user?.id ?? null) : null;
};
const without = (list: LobbyInvite[], id: string) => list.filter((item) => item.id !== id);
const upsert = (list: LobbyInvite[], invite: LobbyInvite) => [invite, ...without(list, invite.id)];

export const inviteStore = createStore<InviteState>()((set, get) => ({
  owner: null,
  incoming: [],
  outgoing: [],
  toasts: [],
  load: async () => {
    const owner = signedInUser();
    if (!owner) return get().reset();
    if (get().owner !== owner) set({ owner, incoming: [], outgoing: [], toasts: [] });
    try {
      const { incoming, outgoing } = await inviteApi.list();
      if (signedInUser() !== owner) return;
      const live = new Set(incoming.map((invite) => invite.id));
      set((state) => ({ incoming, outgoing, toasts: state.toasts.filter((id) => live.has(id)) }));
    } catch {
      /* Invites are short-lived; the next push or load catches up. */
    }
  },
  received: (invite, toast) => {
    const me = signedInUser();
    if (!me || get().owner !== me) return;
    if (invite.to.id === me)
      set((state) => ({
        incoming: upsert(state.incoming, invite),
        toasts: toast
          ? [invite.id, ...state.toasts.filter((id) => id !== invite.id)].slice(0, MAX_TOASTS)
          : state.toasts,
      }));
    else if (invite.from.id === me) set((state) => ({ outgoing: upsert(state.outgoing, invite) }));
  },
  gone: (inviteId) =>
    set((state) => ({
      incoming: without(state.incoming, inviteId),
      outgoing: without(state.outgoing, inviteId),
      toasts: state.toasts.filter((id) => id !== inviteId),
    })),
  send: async (roomId, userId) => {
    const invite = await inviteApi.send(roomId, userId);
    set((state) => ({ outgoing: upsert(state.outgoing, invite) }));
    return invite;
  },
  remove: async (inviteId) => {
    get().gone(inviteId);
    try {
      await inviteApi.remove(inviteId);
    } catch {
      /* Already gone on the server too. */
    }
  },
  dismiss: (inviteId) => set((state) => ({ toasts: state.toasts.filter((id) => id !== inviteId) })),
  reset: () => set({ owner: null, incoming: [], outgoing: [], toasts: [] }),
}));

export function useInvites<T>(select: (state: InviteState) => T) {
  return useStore(inviteStore, select);
}

/**
 * Takes the seat the invite holds. The game lives on "/", so go there first; the server drops
 * the invite once the seat is taken, and a seat taken by someone else shows as a join error.
 */
export function joinInvite(
  invite: LobbyInvite,
  navigate: (path: string) => void,
  failure: string,
) {
  inviteStore.getState().gone(invite.id);
  navigate("/");
  const game = useGameStore.getState();
  if (game.joined && game.roomId === invite.roomId) return;
  void game.joinRoom({ mode: "join", roomId: invite.roomId, role: invite.seat }).catch(() => {
    useGameStore.setState({ joinError: failure });
  });
}

/** The lobby this player can invite into right now: theirs, casual, waiting, other seat free. */
export function useInvitableRoom(): string | null {
  return useGameStore((state) => {
    const meta = state.roomMeta;
    const seat = state.seat;
    if (!state.joined || !state.roomId || !seat || !meta) return null;
    const free = seat === "P1" ? "P2" : "P1";
    const open =
      meta.roomMode === "normal" &&
      meta.origin !== "MATCHMAKING" &&
      !meta.draftState &&
      meta.phase === "lobby" &&
      !meta.players[free];
    return open ? state.roomId : null;
  });
}
