import { readAuthConfig } from "./auth/config";
import { refreshCookieOptions } from "./auth/httpSecurity";

export class ProductionConfigurationError extends Error {}

// Only fixed messages and variable names may escape this validator.
export function validateProductionEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;

  for (const name of [
    "DATABASE_URL",
    "DIRECT_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "WEB_ORIGIN",
  ]) {
    if (!env[name]?.trim()) {
      throw new ProductionConfigurationError(
        `Missing required production environment variable: ${name}`,
      );
    }
  }

  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    try {
      const url = new URL(env[name]!);
      if (
        !["postgresql:", "postgres:"].includes(url.protocol) ||
        !url.hostname ||
        url.pathname.length < 2
      ) {
        throw new Error();
      }
    } catch {
      throw new ProductionConfigurationError(
        `Invalid production PostgreSQL configuration: ${name}`,
      );
    }
  }

  try {
    const origin = new URL(env.WEB_ORIGIN!);
    if (origin.protocol !== "https:" || origin.origin !== env.WEB_ORIGIN) throw new Error();
  } catch {
    throw new ProductionConfigurationError(
      "WEB_ORIGIN must be an exact HTTPS origin without a path or trailing slash",
    );
  }

  try {
    readAuthConfig(env);
  } catch {
    throw new ProductionConfigurationError(
      "Invalid production auth configuration: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different keys of at least 32 UTF-8 bytes; JWT TTLs must be valid",
    );
  }
  try {
    refreshCookieOptions(env);
  } catch {
    throw new ProductionConfigurationError(
      "Invalid production environment variable: AUTH_COOKIE_SAME_SITE",
    );
  }
}
