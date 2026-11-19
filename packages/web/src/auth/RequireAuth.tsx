import { useRef, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuthStore } from "./authStore";
import { SessionStatus } from "./SessionStatus";
import { SignInGate } from "./SignInGate";
import { safeReturnTo } from "./safeReturnTo";

/**
 * A page that needs an account. A guest who opens it finds a page saying so, with the way in
 * (SignInGate); the book closes onto its cover only when they choose to sign in. Signing out
 * while on such a page still closes the book straight onto the cover.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();
  const wasSignedIn = useRef(false);
  if (status === "authenticated") wasSignedIn.current = true;
  if (status === "initializing" || status === "unavailable") return <SessionStatus />;
  if (status === "unauthenticated") {
    const destination = safeReturnTo(`${location.pathname}${location.search}${location.hash}`);
    if (wasSignedIn.current)
      return <Navigate replace to={`/login?returnTo=${encodeURIComponent(destination)}`} />;
    return <SignInGate returnTo={destination} />;
  }
  return <>{children}</>;
}
