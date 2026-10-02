import { AuthError } from "./authErrors";

export interface AuthConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

function secret(value: string | undefined): string {
  // Require independent, explicitly configured keys in every environment.
  if (
    !value ||
    Buffer.byteLength(value, "utf8") < 32 ||
    ["secret", "changeme", "development-secret"].includes(value.trim().toLowerCase())
  ) {
    throw new AuthError("AUTH_UNAVAILABLE");
  }
  return value;
}

function ttl(value: string | undefined, fallback: number): number {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(result) || result <= 0 || result > 31536000) {
    throw new AuthError("AUTH_UNAVAILABLE");
  }
  return result;
}

export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const accessSecret = secret(env.JWT_ACCESS_SECRET);
  const refreshSecret = secret(env.JWT_REFRESH_SECRET);
  if (accessSecret === refreshSecret) throw new AuthError("AUTH_UNAVAILABLE");
  return {
    accessSecret,
    refreshSecret,
    accessTtlSeconds: ttl(env.JWT_ACCESS_TTL_SECONDS, 900),
    refreshTtlSeconds: ttl(env.JWT_REFRESH_TTL_SECONDS, 2592000),
  };
}
