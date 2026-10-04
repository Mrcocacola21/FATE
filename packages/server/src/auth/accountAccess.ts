import { AuthError } from "./authErrors";
import { getDatabaseClient } from "../db/client";
import type { UserRole } from "@prisma/client";

export interface AccountAccess {
  id: string;
  role: UserRole;
  blockedAt: Date | null;
}
export type AccountAccessLoader = (id: string) => Promise<AccountAccess | null>;

export const loadAccountAccess: AccountAccessLoader = (id) =>
  getDatabaseClient().user.findUnique({
    where: { id },
    select: { id: true, role: true, blockedAt: true },
  });

export function assertActiveAccount<T extends { blockedAt: Date | null }>(account: T): T {
  if (account.blockedAt != null) throw new AuthError("ACCOUNT_BLOCKED");
  return account;
}

export async function requireActiveAccount(id: string, load = loadAccountAccess) {
  const account = await load(id);
  if (!account) throw new AuthError("UNAUTHORIZED");
  return assertActiveAccount(account);
}
