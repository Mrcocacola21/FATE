import { ApiError } from "../api/client";
import type { AuthStore } from "./createAuthStore";
import { safeReturnTo } from "./safeReturnTo";

export async function multiplayerAccessToken(
  store: AuthStore,
  role: "P1" | "P2" | "spectator",
  roomMode: "normal" | "test" = "normal",
): Promise<string | undefined> {
  if (roomMode === "test") return undefined;
  let token: string | null;
  try {
    token = await store.getState().getValidAccessToken();
  } catch (error) {
    // Public spectating needs no account privileges when session restoration is unavailable.
    if (role === "spectator") return undefined;
    throw error;
  }
  if (!token && role !== "spectator") throw new ApiError("AUTH_REQUIRED", 401);
  return token ?? undefined;
}

/** Test rooms send no access token, so a signed-in player's name must travel as the seat name. */
export function multiplayerSeatName(
  store: AuthStore,
  roomMode: "normal" | "test" | undefined,
  name?: string,
): string | undefined {
  if (name?.trim() || roomMode !== "test") return name;
  const user = store.getState().status === "authenticated" ? store.getState().user : null;
  return user?.displayName?.trim() || user?.username || undefined;
}

export function redirectToMultiplayerLogin(): void {
  if (typeof window === "undefined") return;
  if (["/login", "/register"].includes(window.location.pathname.replace(/\/$/, ""))) return;
  const returnTo = safeReturnTo(
    window.location.pathname + window.location.search + window.location.hash,
  );
  window.history.pushState({}, "", `/login?returnTo=${encodeURIComponent(returnTo)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
