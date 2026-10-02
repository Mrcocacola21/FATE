import { useStore } from "zustand";
import { API_BASE } from "../api/config";
import { createApiClient } from "../api/client";
import { createAuthApi, parseCurrentUser } from "../api/authApi";
import { createAuthenticatedClient } from "../api/authenticatedClient";
import { createAuthStore, type AuthState } from "./createAuthStore";

const client = createApiClient(API_BASE);
export const authStore = createAuthStore(createAuthApi(client));
export const authClient = createAuthenticatedClient(client, authStore);
export const useAuthStore = <T>(selector: (state: AuthState) => T): T =>
  useStore(authStore, selector);

export async function reloadCurrentUser(): Promise<void> {
  const expected = authStore.getState().user?.id;
  const user = await authClient.request("/api/auth/me", parseCurrentUser);
  if (
    authStore.getState().status === "authenticated" &&
    authStore.getState().user?.id === expected &&
    user.id === expected
  ) {
    authStore.setState({ user });
  }
}
