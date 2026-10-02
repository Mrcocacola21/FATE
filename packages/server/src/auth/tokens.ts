import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { AuthConfig } from "./config";
import { AuthError } from "./authErrors";

const accessClaims = z.object({
  sub: z.string().uuid(),
  type: z.literal("access"),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});
const refreshClaims = accessClaims.extend({
  type: z.literal("refresh"),
  sid: z.string().uuid(),
  jti: z.string().uuid(),
});

export type AccessClaims = z.infer<typeof accessClaims>;
export type RefreshClaims = z.infer<typeof refreshClaims>;

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function equalTokenHashes(first: string, second: string): boolean {
  const a = Buffer.from(first, "hex");
  const b = Buffer.from(second, "hex");
  return a.length === 32 && b.length === 32 && timingSafeEqual(a, b);
}

export class TokenService {
  constructor(readonly config: AuthConfig) {}

  signAccessToken(userId: string): string {
    return jwt.sign({ type: "access" }, this.config.accessSecret, {
      algorithm: "HS256",
      subject: userId,
      jwtid: randomUUID(),
      expiresIn: this.config.accessTtlSeconds,
    });
  }

  signRefreshToken(userId: string, sessionId: string, expiresAt: Date): string {
    return jwt.sign(
      { type: "refresh", sid: sessionId, exp: Math.floor(expiresAt.getTime() / 1000) },
      this.config.refreshSecret,
      { algorithm: "HS256", subject: userId, jwtid: randomUUID() },
    );
  }

  verifyAccessToken(token: string): AccessClaims {
    try {
      return accessClaims.parse(
        jwt.verify(token, this.config.accessSecret, { algorithms: ["HS256"] }),
      );
    } catch {
      throw new AuthError("UNAUTHORIZED");
    }
  }

  verifyRefreshToken(token: string): RefreshClaims {
    try {
      return refreshClaims.parse(
        jwt.verify(token, this.config.refreshSecret, { algorithms: ["HS256"] }),
      );
    } catch {
      throw new AuthError("INVALID_REFRESH_TOKEN");
    }
  }
}
