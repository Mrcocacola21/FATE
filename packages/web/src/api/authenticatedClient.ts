import type { AuthStore } from "../auth/createAuthStore";
import { ApiError, type ApiClient, type Decoder } from "./client";

export function createAuthenticatedClient(client: ApiClient, store: AuthStore) {
  return {
    async request<T>(path: string, decode: Decoder<T>, options: RequestInit = {}): Promise<T> {
      if (path.split("?")[0].startsWith("/api/auth/") && path.split("?")[0] !== "/api/auth/me") {
        throw new ApiError("INVALID_REQUEST");
      }
      await store.getState().initializeSession();
      const original = store.getState().accessToken;
      const ownerId = store.getState().user?.id;
      if (!original) throw store.getState().error ?? new ApiError("UNAUTHORIZED", 401);
      const send = (token: string) => {
        const headers = new Headers(options.headers);
        headers.set("Authorization", `Bearer ${token}`);
        return client.request(path, decode, { ...options, headers });
      };
      try {
        return await send(original);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || error.code !== "UNAUTHORIZED")
          throw error;
      }
      // A late 401 may arrive after another request already completed refresh.
      const current = store.getState().accessToken;
      if (!current) throw new ApiError("UNAUTHORIZED", 401);
      if (store.getState().user?.id !== ownerId) throw new ApiError("SESSION_CHANGED");
      const token = current !== original ? current : await store.getState().refreshSession();
      if (store.getState().user?.id !== ownerId) throw new ApiError("SESSION_CHANGED");
      try {
        return await send(token);
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401 &&
          error.code === "UNAUTHORIZED" &&
          store.getState().accessToken === token
        )
          store.getState().clearSession();
        throw error;
      }
    },
  };
}
