import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuthStore } from "./authStore";
import { SessionStatus } from "./SessionStatus";
import { safeReturnTo } from "./safeReturnTo";

export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const location = useLocation();
  if (status === "initializing" || status === "unavailable") return <SessionStatus />;
  if (status === "unauthenticated") {
    const destination = safeReturnTo(`${location.pathname}${location.search}${location.hash}`);
    return <Navigate replace to={`/login?returnTo=${encodeURIComponent(destination)}`} />;
  }
  return <>{children}</>;
}
