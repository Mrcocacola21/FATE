import { createStore } from "zustand/vanilla";
import { ApiError } from "../api/client";
import type { AuthApi, AuthUser, LoginInput, RegisterInput } from "./types";
import { type AuthLock, withAuthLock } from "./refreshLock";

export interface AuthState {
  status: "initializing" | "authenticated" | "unauthenticated" | "unavailable";
  user: AuthUser | null;
  accessToken: string | null;
  initialized: boolean;
  error: ApiError | null;
  operation: "login" | "register" | "logout" | null;
  initializeSession(): Promise<void>;
  refreshSession(): Promise<string>;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  logout(): Promise<void>;
  clearSession(): void;
}

export function createAuthStore(api: AuthApi, lock: AuthLock = withAuthLock) {
  let version = 0;
  let refreshFlight: Promise<string> | null = null;
  let initialization: Promise<void> | null = null;
  let mutation: Promise<void> | null = null;
  const store = createStore<AuthState>()((set, get) => {
    const clear = () => {
      version++;
      refreshFlight = null;
      set({
        status: "unauthenticated",
        initialized: true,
        accessToken: null,
        user: null,
        error: null,
      });
    };
    const isCurrent = (expected: number) => {
      if (expected !== version) throw new ApiError("SESSION_CHANGED");
    };
    const refreshSession = (): Promise<string> => {
      if (refreshFlight) return refreshFlight;
      const expected = version;
      const flight = lock(async () => {
        isCurrent(expected);
        const result = await api.refresh();
        isCurrent(expected);
        const user = await api.getMe(result.accessToken);
        isCurrent(expected);
        set({
          accessToken: result.accessToken,
          user,
          status: "authenticated",
          initialized: true,
          error: null,
        });
        return result.accessToken;
      })
        .catch((error: unknown) => {
          if (version === expected) {
            const failure = error instanceof ApiError ? error : new ApiError("NETWORK_ERROR");
            const absent =
              failure.status === 401 &&
              ["INVALID_REFRESH_TOKEN", "UNAUTHORIZED"].includes(failure.code);
            version++;
            set({
              accessToken: null,
              user: null,
              initialized: true,
              status: absent ? "unauthenticated" : "unavailable",
              error: absent ? null : failure,
            });
          }
          throw error;
        })
        .finally(() => {
          if (refreshFlight === flight) refreshFlight = null;
        });
      refreshFlight = flight;
      return flight;
    };
    const initializeSession = (): Promise<void> => {
      if (initialization) return initialization;
      if (get().initialized && get().status !== "unavailable") return Promise.resolve();
      set({ status: "initializing", error: null });
      const flight = refreshSession()
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          if (initialization === flight) initialization = null;
        });
      initialization = flight;
      return flight;
    };
    const signIn = (
      kind: "login" | "register",
      input: LoginInput | RegisterInput,
    ): Promise<void> => {
      if (mutation) return Promise.reject(new ApiError("REQUEST_IN_PROGRESS"));
      const expected = ++version;
      refreshFlight = null;
      set({ operation: kind, error: null });
      const flight = lock(async () => {
        isCurrent(expected);
        const result =
          kind === "login" ? await api.login(input) : await api.register(input as RegisterInput);
        isCurrent(expected);
        set({
          accessToken: result.accessToken,
          user: result.user,
          status: "authenticated",
          initialized: true,
          error: null,
        });
      }).finally(() => {
        if (mutation === flight) {
          mutation = null;
          set({ operation: null });
        }
      });
      mutation = flight;
      return flight;
    };
    const logout = (): Promise<void> => {
      if (get().operation === "logout" && mutation) return mutation;
      clear();
      const expected = version;
      set({ operation: "logout" });
      const flight = lock(() => api.logout())
        .catch(() => {
          if (version === expected) set({ error: new ApiError("LOGOUT_FAILED") });
        })
        .finally(() => {
          if (mutation === flight) {
            mutation = null;
            set({ operation: null });
          }
        });
      mutation = flight;
      return flight;
    };
    return {
      status: "initializing",
      user: null,
      accessToken: null,
      initialized: false,
      error: null,
      operation: null,
      initializeSession,
      refreshSession,
      login: (input) => signIn("login", input),
      register: (input) => signIn("register", input),
      logout,
      clearSession: clear,
    };
  });
  return store;
}

export type AuthStore = ReturnType<typeof createAuthStore>;
