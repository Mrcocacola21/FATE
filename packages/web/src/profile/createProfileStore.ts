import { createStore } from "zustand/vanilla";
import { ApiError } from "../api/client";
import type { AuthStore } from "../auth/createAuthStore";
import type { OwnProfile, ProfileApi, ProfilePatch } from "./types";

export interface ProfileState {
  profile: OwnProfile | null;
  loading: boolean;
  saving: boolean;
  error: ApiError | null;
  load(): Promise<void>;
  save(patch: ProfilePatch): Promise<OwnProfile>;
}
export function createProfileStore(
  api: ProfileApi,
  auth: AuthStore,
  applyPreferences: (profile: OwnProfile) => void,
) {
  let generation = 0;
  let revision = 0;
  let loadFlight: Promise<void> | null = null;
  const store = createStore<ProfileState>()((set, get) => {
    const current = (owner: string | undefined, expected: number) =>
      expected === generation &&
      auth.getState().status === "authenticated" &&
      auth.getState().user?.id === owner;
    const accept = (profile: OwnProfile) => {
      set({ profile, error: null });
      const user = auth.getState().user;
      if (user && user.id === profile.id) {
        auth.setState({
          user: {
            ...user,
            username: profile.username,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
        });
      }
      applyPreferences(profile);
    };
    return {
      profile: null,
      loading: false,
      saving: false,
      error: null,
      load: () => {
        if (loadFlight) return loadFlight;
        if (get().saving) return Promise.resolve();
        const owner = auth.getState().user?.id;
        if (!owner || auth.getState().status !== "authenticated") return Promise.resolve();
        const expected = generation;
        const read = ++revision;
        set({ loading: true, error: null });
        const flight = api
          .getOwn()
          .then((profile) => {
            if (current(owner, expected) && read === revision && profile.id === owner)
              accept(profile);
          })
          .catch((error: unknown) => {
            if (current(owner, expected) && read === revision)
              set({ error: error instanceof ApiError ? error : new ApiError("NETWORK_ERROR") });
          })
          .finally(() => {
            if (loadFlight === flight) loadFlight = null;
            if (current(owner, expected) && read === revision) set({ loading: false });
          });
        loadFlight = flight;
        return flight;
      },
      save: async (patch) => {
        if (get().saving) throw new ApiError("REQUEST_IN_PROGRESS");
        const owner = auth.getState().user?.id;
        if (!owner || auth.getState().status !== "authenticated")
          throw new ApiError("UNAUTHORIZED", 401);
        const expected = generation;
        ++revision;
        set({ saving: true, loading: false });
        try {
          const profile = await api.updateOwn(patch);
          if (!current(owner, expected) || profile.id !== owner)
            throw new ApiError("SESSION_CHANGED");
          accept(profile);
          return profile;
        } finally {
          if (current(owner, expected)) set({ saving: false });
        }
      },
    };
  });
  auth.subscribe((state, previous) => {
    if (
      state.user?.id !== previous.user?.id ||
      (state.status !== "authenticated" && previous.status === "authenticated")
    ) {
      ++generation;
      ++revision;
      loadFlight = null;
      store.setState({ profile: null, loading: false, saving: false, error: null });
    }
  });
  return store;
}
