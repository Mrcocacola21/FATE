import { ApiError, type Decoder } from "../api/client";
import { authClient, authStore, reloadCurrentUser } from "../auth/authStore";
import type { Query, UserRole } from "./types";
import * as decode from "./decoders";

let accessRevision = 0;
let deniedUserId: string | undefined;
const listeners = new Set<() => void>();
export const subscribeAdminAccess = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getAdminAccessRevision = () => accessRevision;
export const isAdminAccessLost = () =>
  !!deniedUserId && deniedUserId === authStore.getState().user?.id;
function revokeAdminAccess() {
  deniedUserId = authStore.getState().user?.id;
  accessRevision++;
  listeners.forEach((listener) => listener());
}
const queryString = (query: Query) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  return `?${params}`;
};
async function request<T>(path: string, decoder: Decoder<T>, options: RequestInit = {}) {
  const owner = authStore.getState().user?.id;
  const revision = accessRevision;
  try {
    const value = await authClient.request(`/api/admin${path}`, decoder, {
      ...options,
      cache: "no-store",
    });
    if (owner !== authStore.getState().user?.id || revision !== accessRevision)
      throw new ApiError("SESSION_CHANGED");
    return value;
  } catch (error) {
    if (owner === authStore.getState().user?.id && error instanceof ApiError) {
      if (error.code === "ACCOUNT_BLOCKED") {
        revokeAdminAccess();
        authStore.getState().clearSession();
      } else if (error.code === "FORBIDDEN" || error.status === 401) {
        revokeAdminAccess();
        void reloadCurrentUser().catch(() => {
          /* Guard remains closed if refresh fails. */
        });
      }
    }
    throw error;
  }
}
export const adminApi = {
  summary: () => request("/summary", decode.summary),
  users: (query: Query) => request(`/users${queryString(query)}`, decode.page(decode.user)),
  user: (id: string) => request(`/users/${encodeURIComponent(id)}`, decode.userDetail),
  block: (id: string, reason: string) =>
    request(`/users/${encodeURIComponent(id)}/block`, decode.userResponse, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  unblock: (id: string) =>
    request(`/users/${encodeURIComponent(id)}/unblock`, decode.userResponse, {
      method: "POST",
      body: "{}",
    }),
  changeRole: (id: string, role: UserRole) =>
    request(`/users/${encodeURIComponent(id)}/role`, decode.userResponse, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  matches: (query: Query) => request(`/matches${queryString(query)}`, decode.page(decode.match)),
  match: (id: string) => request(`/matches/${encodeURIComponent(id)}`, decode.matchDetail),
  actions: (id: string, query: Query) =>
    request(
      `/matches/${encodeURIComponent(id)}/actions${queryString(query)}`,
      decode.page(decode.action),
    ),
};
