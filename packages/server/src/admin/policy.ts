import { AuthError } from "../auth/authErrors";
import { assertActiveAccount, type AccountAccess } from "../auth/accountAccess";

export function assertModerator(actor: AccountAccess) {
  assertActiveAccount(actor);
  if (actor.role !== "MODERATOR" && actor.role !== "ADMIN") throw new AuthError("FORBIDDEN");
}
export function assertCanModerate<T extends AccountAccess>(
  actor: T,
  target: AccountAccess,
  blocking: boolean,
): asserts actor is T & { role: "MODERATOR" | "ADMIN" } {
  assertModerator(actor);
  if (blocking && actor.id === target.id) throw new AuthError("CANNOT_BLOCK_SELF");
  if (target.role === "ADMIN" || (actor.role === "MODERATOR" && target.role !== "USER"))
    throw new AuthError("INSUFFICIENT_TARGET_ROLE");
}
export function assertCanChangeRole(actor: AccountAccess, targetId: string) {
  assertActiveAccount(actor);
  if (actor.role !== "ADMIN") throw new AuthError("FORBIDDEN");
  if (actor.id === targetId) throw new AuthError("CANNOT_CHANGE_OWN_ROLE");
}
