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

export function redirectToMultiplayerLogin(): void {
  if (typeof window === "undefined") return;
  if (["/login", "/register"].includes(window.location.pathname.replace(/\/$/, ""))) return;
  const returnTo = safeReturnTo(
    window.location.pathname + window.location.search + window.location.hash,
  );
  window.history.pushState({}, "", `/login?returnTo=${encodeURIComponent(returnTo)}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
