import type { FastifyRequest } from "fastify";
import type { CookieSerializeOptions } from "@fastify/cookie";
import { AuthError } from "./authErrors";

export const REFRESH_COOKIE = "fate_refresh";

export function refreshCookieOptions(): CookieSerializeOptions {
  const production = process.env.NODE_ENV === "production";
  const sameSite = process.env.AUTH_COOKIE_SAME_SITE ?? (production ? "none" : "lax");
  if (sameSite !== "none" && sameSite !== "lax" && sameSite !== "strict") {
    throw new AuthError("AUTH_UNAVAILABLE");
  }
  if (sameSite === "none" && !production) throw new AuthError("AUTH_UNAVAILABLE");
  return { httpOnly: true, secure: production, sameSite, path: "/api/auth" };
}

export function isTrustedAuthOrigin(origin: string | undefined): boolean {
  // No Origin is deliberately supported for CLI/native clients.
  if (!origin) return true;
  const trusted =
    process.env.WEB_ORIGIN ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:5173");
  return Boolean(trusted) && origin === trusted;
}

export async function requireTrustedAuthOrigin(request: FastifyRequest): Promise<void> {
  if (
    !isTrustedAuthOrigin(request.headers.origin) ||
    (!request.headers.origin && request.headers["sec-fetch-site"] === "cross-site")
  ) {
    throw new AuthError("FORBIDDEN_ORIGIN");
  }
}
