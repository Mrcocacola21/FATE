import { AuthError } from "./authErrors";
import type { ConnectionIdentityService } from "./connectionIdentity";

export function bearerToken(header: string | undefined, required = true): string | undefined {
  if (header === undefined && !required) return undefined;
  const token = /^Bearer ([^\s]+)$/i.exec(header ?? "")?.[1];
  if (!token) throw new AuthError("UNAUTHORIZED");
  return token;
}

export async function requireIdentity(
  header: string | undefined,
  service: Pick<ConnectionIdentityService, "verify">,
) {
  const identity = await service.verify(bearerToken(header));
  if (!identity) throw new AuthError("UNAUTHORIZED");
  return identity;
}
