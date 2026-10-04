import type { AuthUser } from "../auth/types";
import type { AdminUser } from "./types";

export const canAccessAdmin = (role: unknown) => role === "MODERATOR" || role === "ADMIN";
export function canModerate(actor: AuthUser, target: AdminUser) {
  return (
    actor.id !== target.id &&
    target.role !== "ADMIN" &&
    (actor.role === "ADMIN" || (actor.role === "MODERATOR" && target.role === "USER"))
  );
}
export const canChangeRole = (actor: AuthUser, target: AdminUser) =>
  actor.role === "ADMIN" && actor.id !== target.id && (!target.blocked || target.role !== "USER");
